package com.comong.backend.domain.artwork.service;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;

import com.comong.backend.domain.artwork.dto.ArtworkCreateRequest;
import com.comong.backend.domain.artwork.dto.ArtworkResponse;
import com.comong.backend.domain.artwork.dto.ArtworkUpdateRequest;
import com.comong.backend.domain.artwork.dto.PublicArtworkResponse;
import com.comong.backend.domain.artwork.entity.Artwork;
import com.comong.backend.domain.artwork.exception.ArtworkErrorCode;
import com.comong.backend.domain.artwork.repository.ArtworkRepository;
import com.comong.backend.domain.patient.entity.PatientProfile;
import com.comong.backend.domain.patient.exception.PatientErrorCode;
import com.comong.backend.domain.patient.service.PatientProfileService;
import com.comong.backend.global.exception.BusinessException;
import com.comong.backend.global.storage.ImageStorage;
import com.comong.backend.global.storage.StoredImage;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * artwork 유스케이스 — 저장/조회/수정/삭제.
 *
 * <p><b>트랜잭션 정합성</b>: 파일 업로드와 DB 저장이 한 트랜잭션 안에 묶이지 못하므로 (파일시스템은 트랜잭션 외 자원), 다음 패턴으로 orphan 을 최소화한다.
 *
 * <ul>
 *   <li>Create: 업로드 → DB save. DB 롤백 시 {@link TransactionSynchronization#afterCompletion} 에서 업로드한
 *       파일 삭제.
 *   <li>Update: 새 이미지 업로드 → entity 변경. 롤백 시 새 이미지 삭제, 커밋 성공 시 기존 이미지 {@link
 *       TransactionSynchronization#afterCommit} 에서 삭제.
 *   <li>Delete: DB 삭제 → 커밋 성공 후 파일 삭제 (커밋 실패 시 파일 보존).
 * </ul>
 *
 * 완벽한 2PC 는 아니라서 최악의 경우 (커밋 직전 JVM 크래시 등) 일부 orphan 이 남을 수 있음 — 별도 cleanup 배치는 추후 이슈.
 */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ArtworkService {

    private final ArtworkRepository artworkRepository;
    private final PatientProfileService patientProfileService;
    private final ImageStorage imageStorage;
    private final ArtworkAccessChecker accessChecker;

    @Transactional
    public ArtworkResponse create(Long userId, ArtworkCreateRequest request, MultipartFile file) {
        PatientProfile profile =
                patientProfileService
                        .findEntityByUserId(userId)
                        .orElseThrow(
                                () ->
                                        new BusinessException(
                                                PatientErrorCode.PATIENT_PROFILE_NOT_FOUND));

        StoredImage stored = imageStorage.upload(file);
        registerCleanupOnRollback(stored.url());

        Artwork saved =
                artworkRepository.save(
                        Artwork.builder()
                                .patientProfile(profile)
                                .sketchCode(request.sketchCode())
                                .imageUrl(stored.url())
                                .playDurationSeconds(request.playDurationSeconds())
                                .colorCount(request.colorCount())
                                .isPublic(request.isPublic())
                                .build());
        return ArtworkResponse.from(saved, imageStorage);
    }

    public ArtworkResponse findOne(Long currentUserId, Long id) {
        Artwork artwork = findOrThrow(id);
        accessChecker.verifyReadable(artwork, currentUserId);
        return ArtworkResponse.from(artwork, imageStorage);
    }

    public Page<ArtworkResponse> findMine(Long userId, Pageable pageable) {
        return artworkRepository
                .findByOwnerUserId(userId, pageable)
                .map(artwork -> ArtworkResponse.from(artwork, imageStorage));
    }

    public Page<PublicArtworkResponse> findPublic(Pageable pageable) {
        return artworkRepository
                .findPublic(pageable)
                .map(artwork -> PublicArtworkResponse.from(artwork, imageStorage));
    }

    @Transactional
    public ArtworkResponse update(
            Long userId, Long id, ArtworkUpdateRequest request, MultipartFile file) {
        Artwork artwork = findOrThrow(id);
        accessChecker.verifyOwner(artwork, userId);

        String oldImageUrl = null;
        String newImageUrl = null;
        if (file != null && !file.isEmpty()) {
            newImageUrl = imageStorage.upload(file).url();
            oldImageUrl = artwork.getImageUrl();
            artwork.replaceImage(newImageUrl);
        }
        registerImageReplacementCleanup(newImageUrl, oldImageUrl);

        artwork.update(request.isPublic(), request.colorCount());
        if (request.additionalPlayDurationSeconds() != null) {
            artwork.addPlayDuration(request.additionalPlayDurationSeconds());
        }

        return ArtworkResponse.from(artwork, imageStorage);
    }

    @Transactional
    public void delete(Long userId, Long id) {
        Artwork artwork = findOrThrow(id);
        accessChecker.verifyOwner(artwork, userId);

        String imageUrl = artwork.getImageUrl();
        artworkRepository.delete(artwork);
        registerImageDeleteAfterCommit(imageUrl);
    }

    private Artwork findOrThrow(Long id) {
        return artworkRepository
                .findByIdWithProfileAndUser(id)
                .orElseThrow(() -> new BusinessException(ArtworkErrorCode.ARTWORK_NOT_FOUND));
    }

    /** Create 용 — 트랜잭션 롤백 시 업로드 파일 삭제. 커밋 성공 시 그대로 유지. */
    private void registerCleanupOnRollback(String uploadedUrl) {
        TransactionSynchronizationManager.registerSynchronization(
                new TransactionSynchronization() {
                    @Override
                    public void afterCompletion(int status) {
                        if (status == STATUS_ROLLED_BACK) {
                            safeDelete(uploadedUrl, "롤백 후 신규 이미지 cleanup 실패");
                        }
                    }
                });
    }

    /**
     * Update 용 — 새 이미지가 업로드된 경우 (newImageUrl != null) 만 등록.
     *
     * <p>커밋 성공: 기존 이미지(oldImageUrl) 삭제. 롤백: 새 이미지(newImageUrl) 삭제.
     */
    private void registerImageReplacementCleanup(String newImageUrl, String oldImageUrl) {
        if (newImageUrl == null) {
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(
                new TransactionSynchronization() {
                    @Override
                    public void afterCommit() {
                        if (oldImageUrl != null) {
                            safeDelete(oldImageUrl, "기존 이미지 삭제 실패");
                        }
                    }

                    @Override
                    public void afterCompletion(int status) {
                        if (status == STATUS_ROLLED_BACK) {
                            safeDelete(newImageUrl, "롤백 후 신규 이미지 cleanup 실패");
                        }
                    }
                });
    }

    /** Delete 용 — 커밋 성공 시에만 파일 삭제 (커밋 실패 시 파일 보존, DB 도 원상). */
    private void registerImageDeleteAfterCommit(String imageUrl) {
        TransactionSynchronizationManager.registerSynchronization(
                new TransactionSynchronization() {
                    @Override
                    public void afterCommit() {
                        safeDelete(imageUrl, "작품 삭제 후 이미지 cleanup 실패");
                    }
                });
    }

    private void safeDelete(String url, String failureMessage) {
        try {
            imageStorage.delete(url);
        } catch (RuntimeException ex) {
            log.warn("{}: {}", failureMessage, url, ex);
        }
    }
}
