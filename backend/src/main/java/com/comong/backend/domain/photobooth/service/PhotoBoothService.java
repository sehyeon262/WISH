package com.comong.backend.domain.photobooth.service;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;

import com.comong.backend.domain.patient.entity.PatientProfile;
import com.comong.backend.domain.patient.exception.PatientErrorCode;
import com.comong.backend.domain.patient.service.PatientProfileService;
import com.comong.backend.domain.photobooth.dto.PhotoBoothCreateRequest;
import com.comong.backend.domain.photobooth.dto.PhotoBoothResponse;
import com.comong.backend.domain.photobooth.dto.PhotoBoothUpdateRequest;
import com.comong.backend.domain.photobooth.dto.PublicPhotoBoothResponse;
import com.comong.backend.domain.photobooth.entity.PhotoBoothPhoto;
import com.comong.backend.domain.photobooth.exception.PhotoBoothErrorCode;
import com.comong.backend.domain.photobooth.repository.PhotoBoothPhotoRepository;
import com.comong.backend.global.exception.BusinessException;
import com.comong.backend.global.storage.ImageStorage;
import com.comong.backend.global.storage.StoredImage;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * 인생네컷 사진 유스케이스 — 저장/조회/공개여부 토글/삭제.
 *
 * <p><b>트랜잭션 정합성</b>: artwork 와 동일한 orphan 최소화 패턴을 사용한다 (파일시스템/S3 는 트랜잭션 외 자원).
 *
 * <ul>
 *   <li>Create: 업로드 → DB save. DB 롤백 시 {@link TransactionSynchronization#afterCompletion(int)} 에서
 *       업로드한 파일 삭제.
 *   <li>Delete: DB 삭제 → 커밋 성공 후 파일 삭제 (커밋 실패 시 파일 보존).
 * </ul>
 *
 * <p>현재는 사진을 한 번 저장하면 이미지 교체는 지원하지 않는다 (Update 는 공개 여부만). 추후 교체 필요해지면 {@link
 * com.comong.backend.domain.artwork.service.ArtworkService} 의 {@code
 * registerImageReplacementCleanup} 패턴을 그대로 가져온다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class PhotoBoothService {

    private final PhotoBoothPhotoRepository photoRepository;
    private final PatientProfileService patientProfileService;
    private final ImageStorage imageStorage;
    private final PhotoBoothAccessChecker accessChecker;

    @Transactional
    public PhotoBoothResponse create(
            Long userId,
            PhotoBoothCreateRequest request,
            MultipartFile file,
            MultipartFile thumbnail) {
        PatientProfile profile =
                patientProfileService
                        .findEntityByUserId(userId)
                        .orElseThrow(
                                () ->
                                        new BusinessException(
                                                PatientErrorCode.PATIENT_PROFILE_NOT_FOUND));

        StoredImage stored = imageStorage.upload(file);
        registerCleanupOnRollback(stored.url());
        String thumbnailUrl = uploadThumbnailOrNull(thumbnail);

        PhotoBoothPhoto saved =
                photoRepository.save(
                        PhotoBoothPhoto.builder()
                                .patientProfile(profile)
                                .frameId(request.frameId())
                                .imageUrl(stored.url())
                                .thumbnailUrl(thumbnailUrl)
                                .isPublic(request.isPublic())
                                .build());
        return PhotoBoothResponse.from(saved, imageStorage);
    }

    public PhotoBoothResponse findOne(Long currentUserId, Long id) {
        PhotoBoothPhoto photo = findOrThrow(id);
        accessChecker.verifyReadable(photo, currentUserId);
        return PhotoBoothResponse.from(photo, imageStorage);
    }

    public Page<PhotoBoothResponse> findMine(Long userId, Pageable pageable) {
        return photoRepository
                .findByOwnerUserId(userId, pageable)
                .map(photo -> PhotoBoothResponse.from(photo, imageStorage));
    }

    public Page<PublicPhotoBoothResponse> findPublic(Pageable pageable) {
        return photoRepository
                .findPublic(pageable)
                .map(photo -> PublicPhotoBoothResponse.from(photo, imageStorage));
    }

    @Transactional
    public PhotoBoothResponse update(Long userId, Long id, PhotoBoothUpdateRequest request) {
        PhotoBoothPhoto photo = findOrThrow(id);
        accessChecker.verifyOwner(photo, userId);
        photo.update(request.isPublic());
        return PhotoBoothResponse.from(photo, imageStorage);
    }

    @Transactional
    public void delete(Long userId, Long id) {
        PhotoBoothPhoto photo = findOrThrow(id);
        accessChecker.verifyOwner(photo, userId);

        String imageUrl = photo.getImageUrl();
        String thumbnailUrl = photo.getThumbnailUrl();
        photoRepository.delete(photo);
        registerImageDeleteAfterCommit(imageUrl);
        registerImageDeleteAfterCommit(thumbnailUrl);
    }

    private PhotoBoothPhoto findOrThrow(Long id) {
        return photoRepository
                .findByIdWithProfileAndUser(id)
                .orElseThrow(
                        () -> new BusinessException(PhotoBoothErrorCode.PHOTO_BOOTH_NOT_FOUND));
    }

    private String uploadThumbnailOrNull(MultipartFile thumbnail) {
        if (!isPresent(thumbnail)) {
            return null;
        }
        try {
            StoredImage storedThumbnail = imageStorage.upload(thumbnail);
            registerCleanupOnRollback(storedThumbnail.url());
            return storedThumbnail.url();
        } catch (RuntimeException ex) {
            log.warn("포토부스 썸네일 업로드 실패. 원본 이미지로 대체합니다.", ex);
            return null;
        }
    }

    /** Create 용 — 트랜잭션 롤백 시 업로드 파일 삭제. */
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

    /** Delete 용 — 커밋 성공 시에만 파일 삭제. */
    private void registerImageDeleteAfterCommit(String imageUrl) {
        TransactionSynchronizationManager.registerSynchronization(
                new TransactionSynchronization() {
                    @Override
                    public void afterCommit() {
                        safeDelete(imageUrl, "사진 삭제 후 이미지 cleanup 실패");
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

    private static boolean isPresent(MultipartFile file) {
        return file != null && !file.isEmpty();
    }
}
