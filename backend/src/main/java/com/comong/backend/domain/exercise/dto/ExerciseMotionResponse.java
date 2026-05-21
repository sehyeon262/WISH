package com.comong.backend.domain.exercise.dto;

import java.time.LocalDateTime;

import com.comong.backend.domain.exercise.entity.ExerciseMotion;
import com.comong.backend.domain.exercise.entity.ExerciseType;
import com.comong.backend.global.storage.ImageStorage;
import com.comong.backend.global.storage.VideoStorage;

/**
 * 운동 동작 응답.
 *
 * <p>{@code demoVideoUrl} / {@code thumbnailUrl} 은 응답 직렬화 시점에 {@link VideoStorage#toPublicUrl} /
 * {@link ImageStorage#toPublicUrl} 을 거친 값 — S3 백엔드면 짧은 TTL presigned URL, 로컬이면 영구 servlet 경로 (자세한
 * 의도는 {@link ImageStorage} javadoc).
 */
public record ExerciseMotionResponse(
        Long id,
        ExerciseType exerciseType,
        String name,
        int routineOrder,
        int targetReps,
        String description,
        String demoVideoUrl,
        String thumbnailUrl,
        LocalDateTime createdAt,
        LocalDateTime updatedAt) {

    public static ExerciseMotionResponse from(
            ExerciseMotion exerciseMotion, ImageStorage imageStorage, VideoStorage videoStorage) {
        return new ExerciseMotionResponse(
                exerciseMotion.getId(),
                exerciseMotion.getExerciseType(),
                exerciseMotion.getName(),
                exerciseMotion.getRoutineOrder(),
                exerciseMotion.getTargetReps(),
                exerciseMotion.getDescription(),
                videoStorage.toPublicUrl(exerciseMotion.getDemoVideoUrl()),
                imageStorage.toPublicUrl(exerciseMotion.getThumbnailUrl()),
                exerciseMotion.getCreatedAt(),
                exerciseMotion.getUpdatedAt());
    }
}
