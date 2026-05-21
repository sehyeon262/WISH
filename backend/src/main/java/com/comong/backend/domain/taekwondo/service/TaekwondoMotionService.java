package com.comong.backend.domain.taekwondo.service;

import static org.springframework.transaction.support.TransactionSynchronization.STATUS_ROLLED_BACK;

import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;

import com.comong.backend.domain.taekwondo.dto.TaekwondoMotionCreateRequest;
import com.comong.backend.domain.taekwondo.dto.TaekwondoMotionReorderRequest;
import com.comong.backend.domain.taekwondo.dto.TaekwondoMotionResponse;
import com.comong.backend.domain.taekwondo.dto.TaekwondoMotionUpdateRequest;
import com.comong.backend.domain.taekwondo.entity.Poomsae;
import com.comong.backend.domain.taekwondo.entity.TaekwondoMotion;
import com.comong.backend.domain.taekwondo.exception.TaekwondoErrorCode;
import com.comong.backend.domain.taekwondo.repository.TaekwondoMotionRepository;
import com.comong.backend.domain.taekwondo.repository.TaekwondoSessionMotionRepository;
import com.comong.backend.global.exception.BusinessException;
import com.comong.backend.global.storage.ImageStorage;
import com.comong.backend.global.storage.VideoStorage;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * 태권도 동작 마스터 데이터 유스케이스. 체조 {@code ExerciseMotionService} 와 동일 패턴 — 미디어 업로드/DB 저장 정합성을 {@link
 * TransactionSynchronization} 으로 처리한다 (커밋 시 옛 파일 정리 / 롤백 시 신규 파일 정리).
 */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class TaekwondoMotionService {

    private final TaekwondoMotionRepository taekwondoMotionRepository;
    private final TaekwondoSessionMotionRepository sessionMotionRepository;
    private final ImageStorage imageStorage;
    private final VideoStorage videoStorage;

    public List<TaekwondoMotionResponse> findAllByPoomsae(Poomsae poomsae) {
        return taekwondoMotionRepository.findAllByPoomsaeOrderByRoutineOrderAsc(poomsae).stream()
                .map(motion -> TaekwondoMotionResponse.from(motion, imageStorage, videoStorage))
                .toList();
    }

    public TaekwondoMotionResponse findOne(Long id) {
        return TaekwondoMotionResponse.from(findOrThrow(id), imageStorage, videoStorage);
    }

    @Transactional
    public TaekwondoMotionResponse create(
            TaekwondoMotionCreateRequest request,
            MultipartFile thumbnail,
            MultipartFile demoVideo) {
        if (taekwondoMotionRepository.existsByPoomsaeAndRoutineOrder(
                request.poomsae(), request.routineOrder())) {
            throw new BusinessException(
                    TaekwondoErrorCode.TAEKWONDO_MOTION_ROUTINE_ORDER_DUPLICATED);
        }
        if (taekwondoMotionRepository.existsByPoomsaeAndName(request.poomsae(), request.name())) {
            throw new BusinessException(TaekwondoErrorCode.TAEKWONDO_MOTION_NAME_DUPLICATED);
        }

        String thumbnailUrl = null;
        if (isPresent(thumbnail)) {
            thumbnailUrl = imageStorage.upload(thumbnail).url();
            registerImageRollbackCleanup(thumbnailUrl);
        }
        String demoVideoUrl = null;
        if (isPresent(demoVideo)) {
            demoVideoUrl = videoStorage.upload(demoVideo).url();
            registerVideoRollbackCleanup(demoVideoUrl);
        }

        TaekwondoMotion saved =
                taekwondoMotionRepository.save(
                        TaekwondoMotion.builder()
                                .poomsae(request.poomsae())
                                .name(request.name())
                                .routineOrder(request.routineOrder())
                                .targetReps(request.targetReps())
                                .description(request.description())
                                .demoVideoUrl(demoVideoUrl)
                                .thumbnailUrl(thumbnailUrl)
                                .build());
        return TaekwondoMotionResponse.from(saved, imageStorage, videoStorage);
    }

    @Transactional
    public TaekwondoMotionResponse update(
            Long id,
            TaekwondoMotionUpdateRequest request,
            MultipartFile thumbnail,
            MultipartFile demoVideo) {
        TaekwondoMotion motion = findOrThrow(id);
        if (request.routineOrder() != null
                && taekwondoMotionRepository.existsByPoomsaeAndRoutineOrderAndIdNot(
                        motion.getPoomsae(), request.routineOrder(), motion.getId())) {
            throw new BusinessException(
                    TaekwondoErrorCode.TAEKWONDO_MOTION_ROUTINE_ORDER_DUPLICATED);
        }
        if (request.name() != null
                && taekwondoMotionRepository.existsByPoomsaeAndNameAndIdNot(
                        motion.getPoomsae(), request.name(), motion.getId())) {
            throw new BusinessException(TaekwondoErrorCode.TAEKWONDO_MOTION_NAME_DUPLICATED);
        }
        motion.updateMetadata(
                request.name(),
                request.routineOrder(),
                request.targetReps(),
                request.description());

        applyThumbnailChange(motion, request, thumbnail);
        applyDemoVideoChange(motion, request, demoVideo);

        return TaekwondoMotionResponse.from(motion, imageStorage, videoStorage);
    }

    @Transactional
    public List<TaekwondoMotionResponse> reorder(TaekwondoMotionReorderRequest request) {
        List<TaekwondoMotion> motions =
                taekwondoMotionRepository.findAllByPoomsaeOrderByRoutineOrderAsc(request.poomsae());
        Set<Long> currentIds =
                motions.stream().map(TaekwondoMotion::getId).collect(Collectors.toSet());
        Set<Long> requestedIds = new HashSet<>(request.motionIds());
        if (requestedIds.size() != request.motionIds().size() || !currentIds.equals(requestedIds)) {
            throw new BusinessException(TaekwondoErrorCode.TAEKWONDO_MOTION_REORDER_SET_MISMATCH);
        }

        Map<Long, TaekwondoMotion> motionsById =
                motions.stream()
                        .collect(Collectors.toMap(TaekwondoMotion::getId, Function.identity()));
        for (int i = 0; i < request.motionIds().size(); i++) {
            motionsById.get(request.motionIds().get(i)).changeRoutineOrder(i + 1);
        }
        // DEFERRABLE 제약 검사는 트랜잭션 끝에 발생. flush() 는 후속 SELECT 가 동일 트랜잭션 안에서 갱신된 routine_order 를
        // 보도록 SQL 을 즉시 push 한다.
        taekwondoMotionRepository.flush();

        return findAllByPoomsae(request.poomsae());
    }

    @Transactional
    public void delete(Long id) {
        TaekwondoMotion motion = findOrThrow(id);
        if (sessionMotionRepository.existsByMotionId(id)) {
            throw new BusinessException(TaekwondoErrorCode.TAEKWONDO_MOTION_IN_USE);
        }

        String thumbnailUrl = motion.getThumbnailUrl();
        String demoVideoUrl = motion.getDemoVideoUrl();
        taekwondoMotionRepository.delete(motion);

        if (thumbnailUrl != null) {
            registerImageDeleteAfterCommit(thumbnailUrl, "동작 삭제 후 썸네일 cleanup 실패");
        }
        if (demoVideoUrl != null) {
            registerVideoDeleteAfterCommit(demoVideoUrl, "동작 삭제 후 영상 cleanup 실패");
        }
    }

    private void applyThumbnailChange(
            TaekwondoMotion motion, TaekwondoMotionUpdateRequest request, MultipartFile thumbnail) {
        String oldUrl = motion.getThumbnailUrl();
        if (isPresent(thumbnail)) {
            String newUrl = imageStorage.upload(thumbnail).url();
            motion.replaceThumbnail(newUrl);
            registerImageReplacementCleanup(newUrl, oldUrl);
        } else if (Boolean.TRUE.equals(request.clearThumbnail()) && oldUrl != null) {
            motion.clearThumbnail();
            registerImageDeleteAfterCommit(oldUrl, "썸네일 클리어 후 cleanup 실패");
        }
    }

    private void applyDemoVideoChange(
            TaekwondoMotion motion, TaekwondoMotionUpdateRequest request, MultipartFile demoVideo) {
        String oldUrl = motion.getDemoVideoUrl();
        if (isPresent(demoVideo)) {
            String newUrl = videoStorage.upload(demoVideo).url();
            motion.replaceDemoVideo(newUrl);
            registerVideoReplacementCleanup(newUrl, oldUrl);
        } else if (Boolean.TRUE.equals(request.clearDemoVideo()) && oldUrl != null) {
            motion.clearDemoVideo();
            registerVideoDeleteAfterCommit(oldUrl, "영상 클리어 후 cleanup 실패");
        }
    }

    private TaekwondoMotion findOrThrow(Long id) {
        return taekwondoMotionRepository
                .findById(id)
                .orElseThrow(
                        () -> new BusinessException(TaekwondoErrorCode.TAEKWONDO_MOTION_NOT_FOUND));
    }

    private static boolean isPresent(MultipartFile file) {
        return file != null && !file.isEmpty();
    }

    /* ---------------- Transaction sync helpers ---------------- */

    private void registerImageRollbackCleanup(String uploadedUrl) {
        TransactionSynchronizationManager.registerSynchronization(
                new TransactionSynchronization() {
                    @Override
                    public void afterCompletion(int status) {
                        if (status == STATUS_ROLLED_BACK) {
                            safeImageDelete(uploadedUrl, "롤백 후 신규 썸네일 cleanup 실패");
                        }
                    }
                });
    }

    private void registerVideoRollbackCleanup(String uploadedUrl) {
        TransactionSynchronizationManager.registerSynchronization(
                new TransactionSynchronization() {
                    @Override
                    public void afterCompletion(int status) {
                        if (status == STATUS_ROLLED_BACK) {
                            safeVideoDelete(uploadedUrl, "롤백 후 신규 영상 cleanup 실패");
                        }
                    }
                });
    }

    private void registerImageReplacementCleanup(String newUrl, String oldUrl) {
        TransactionSynchronizationManager.registerSynchronization(
                new TransactionSynchronization() {
                    @Override
                    public void afterCommit() {
                        if (oldUrl != null) {
                            safeImageDelete(oldUrl, "기존 썸네일 삭제 실패");
                        }
                    }

                    @Override
                    public void afterCompletion(int status) {
                        if (status == STATUS_ROLLED_BACK) {
                            safeImageDelete(newUrl, "롤백 후 신규 썸네일 cleanup 실패");
                        }
                    }
                });
    }

    private void registerVideoReplacementCleanup(String newUrl, String oldUrl) {
        TransactionSynchronizationManager.registerSynchronization(
                new TransactionSynchronization() {
                    @Override
                    public void afterCommit() {
                        if (oldUrl != null) {
                            safeVideoDelete(oldUrl, "기존 영상 삭제 실패");
                        }
                    }

                    @Override
                    public void afterCompletion(int status) {
                        if (status == STATUS_ROLLED_BACK) {
                            safeVideoDelete(newUrl, "롤백 후 신규 영상 cleanup 실패");
                        }
                    }
                });
    }

    private void registerImageDeleteAfterCommit(String url, String failureMessage) {
        TransactionSynchronizationManager.registerSynchronization(
                new TransactionSynchronization() {
                    @Override
                    public void afterCommit() {
                        safeImageDelete(url, failureMessage);
                    }
                });
    }

    private void registerVideoDeleteAfterCommit(String url, String failureMessage) {
        TransactionSynchronizationManager.registerSynchronization(
                new TransactionSynchronization() {
                    @Override
                    public void afterCommit() {
                        safeVideoDelete(url, failureMessage);
                    }
                });
    }

    private void safeImageDelete(String url, String failureMessage) {
        try {
            imageStorage.delete(url);
        } catch (RuntimeException ex) {
            log.warn("{}: {}", failureMessage, url, ex);
        }
    }

    private void safeVideoDelete(String url, String failureMessage) {
        try {
            videoStorage.delete(url);
        } catch (RuntimeException ex) {
            log.warn("{}: {}", failureMessage, url, ex);
        }
    }
}
