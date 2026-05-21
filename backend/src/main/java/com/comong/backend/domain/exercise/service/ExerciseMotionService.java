package com.comong.backend.domain.exercise.service;

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

import com.comong.backend.domain.exercise.dto.ExerciseMotionCreateRequest;
import com.comong.backend.domain.exercise.dto.ExerciseMotionReorderRequest;
import com.comong.backend.domain.exercise.dto.ExerciseMotionResponse;
import com.comong.backend.domain.exercise.dto.ExerciseMotionUpdateRequest;
import com.comong.backend.domain.exercise.entity.ExerciseMotion;
import com.comong.backend.domain.exercise.entity.ExerciseType;
import com.comong.backend.domain.exercise.exception.ExerciseErrorCode;
import com.comong.backend.domain.exercise.repository.ExerciseMotionRepository;
import com.comong.backend.domain.exercise.repository.ExerciseSessionMotionRepository;
import com.comong.backend.global.exception.BusinessException;
import com.comong.backend.global.storage.ImageStorage;
import com.comong.backend.global.storage.VideoStorage;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * 체조 동작 마스터 데이터 유스케이스.
 *
 * <p><b>트랜잭션 정합성</b>: 파일 업로드와 DB 저장이 한 트랜잭션 안에 묶이지 못하므로 (파일시스템은 트랜잭션 외 자원), {@code ArtworkService}
 * 와 동일 패턴으로 {@link TransactionSynchronization} 을 사용해 orphan 을 최소화한다.
 *
 * <ul>
 *   <li>create: 새로 업로드된 파일은 롤백 시 삭제, 커밋 시 그대로 유지
 *   <li>update: 기존 파일 교체 — 커밋 시 옛 파일 삭제, 롤백 시 새 파일 삭제
 *   <li>update: 명시적 클리어 — 커밋 시 옛 파일 삭제
 *   <li>delete: 커밋 후 모든 연관 파일 삭제
 * </ul>
 *
 * 완벽한 2PC 가 아니라 최악의 경우(커밋 직전 JVM 크래시 등) 일부 orphan 이 남을 수 있음 — 별도 cleanup 배치는 추후 이슈.
 */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ExerciseMotionService {

    private final ExerciseMotionRepository exerciseMotionRepository;
    private final ExerciseSessionMotionRepository sessionMotionRepository;
    private final ImageStorage imageStorage;
    private final VideoStorage videoStorage;

    public List<ExerciseMotionResponse> findAllByExerciseType(ExerciseType exerciseType) {
        return exerciseMotionRepository
                .findAllByExerciseTypeOrderByRoutineOrderAsc(exerciseType)
                .stream()
                .map(motion -> ExerciseMotionResponse.from(motion, imageStorage, videoStorage))
                .toList();
    }

    public ExerciseMotionResponse findOne(Long id) {
        return ExerciseMotionResponse.from(findOrThrow(id), imageStorage, videoStorage);
    }

    @Transactional
    public ExerciseMotionResponse create(
            ExerciseMotionCreateRequest request, MultipartFile thumbnail, MultipartFile demoVideo) {
        if (exerciseMotionRepository.existsByExerciseTypeAndRoutineOrder(
                request.exerciseType(), request.routineOrder())) {
            throw new BusinessException(ExerciseErrorCode.EXERCISE_MOTION_ROUTINE_ORDER_DUPLICATED);
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

        ExerciseMotion saved =
                exerciseMotionRepository.save(
                        ExerciseMotion.builder()
                                .exerciseType(request.exerciseType())
                                .name(request.name())
                                .routineOrder(request.routineOrder())
                                .targetReps(request.targetReps())
                                .description(request.description())
                                .demoVideoUrl(demoVideoUrl)
                                .thumbnailUrl(thumbnailUrl)
                                .build());
        return ExerciseMotionResponse.from(saved, imageStorage, videoStorage);
    }

    @Transactional
    public ExerciseMotionResponse update(
            Long id,
            ExerciseMotionUpdateRequest request,
            MultipartFile thumbnail,
            MultipartFile demoVideo) {
        ExerciseMotion motion = findOrThrow(id);
        if (request.routineOrder() != null
                && exerciseMotionRepository.existsByExerciseTypeAndRoutineOrderAndIdNot(
                        motion.getExerciseType(), request.routineOrder(), motion.getId())) {
            throw new BusinessException(ExerciseErrorCode.EXERCISE_MOTION_ROUTINE_ORDER_DUPLICATED);
        }
        motion.updateMetadata(
                request.name(),
                request.routineOrder(),
                request.targetReps(),
                request.description());

        applyThumbnailChange(motion, request, thumbnail);
        applyDemoVideoChange(motion, request, demoVideo);

        return ExerciseMotionResponse.from(motion, imageStorage, videoStorage);
    }

    @Transactional
    public List<ExerciseMotionResponse> reorder(ExerciseMotionReorderRequest request) {
        List<ExerciseMotion> motions =
                exerciseMotionRepository.findAllByExerciseTypeOrderByRoutineOrderAsc(
                        request.exerciseType());
        Set<Long> currentIds =
                motions.stream().map(ExerciseMotion::getId).collect(Collectors.toSet());
        Set<Long> requestedIds = new HashSet<>(request.motionIds());
        if (requestedIds.size() != request.motionIds().size() || !currentIds.equals(requestedIds)) {
            throw new BusinessException(ExerciseErrorCode.EXERCISE_MOTION_REORDER_SET_MISMATCH);
        }

        Map<Long, ExerciseMotion> motionsById =
                motions.stream()
                        .collect(Collectors.toMap(ExerciseMotion::getId, Function.identity()));
        for (int i = 0; i < request.motionIds().size(); i++) {
            motionsById.get(request.motionIds().get(i)).changeRoutineOrder(i + 1);
        }
        exerciseMotionRepository.flush();

        return findAllByExerciseType(request.exerciseType());
    }

    @Transactional
    public void delete(Long id) {
        ExerciseMotion motion = findOrThrow(id);
        if (sessionMotionRepository.existsByExerciseMotionId(id)) {
            throw new BusinessException(ExerciseErrorCode.EXERCISE_MOTION_IN_USE);
        }

        String thumbnailUrl = motion.getThumbnailUrl();
        String demoVideoUrl = motion.getDemoVideoUrl();
        exerciseMotionRepository.delete(motion);

        if (thumbnailUrl != null) {
            registerImageDeleteAfterCommit(thumbnailUrl, "동작 삭제 후 썸네일 cleanup 실패");
        }
        if (demoVideoUrl != null) {
            registerVideoDeleteAfterCommit(demoVideoUrl, "동작 삭제 후 영상 cleanup 실패");
        }
    }

    private void applyThumbnailChange(
            ExerciseMotion motion, ExerciseMotionUpdateRequest request, MultipartFile thumbnail) {
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
            ExerciseMotion motion, ExerciseMotionUpdateRequest request, MultipartFile demoVideo) {
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

    private ExerciseMotion findOrThrow(Long id) {
        return exerciseMotionRepository
                .findById(id)
                .orElseThrow(
                        () -> new BusinessException(ExerciseErrorCode.EXERCISE_MOTION_NOT_FOUND));
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
