package com.comong.backend.domain.taekwondo.dto;

import java.time.LocalDateTime;

import com.comong.backend.domain.taekwondo.entity.Poomsae;
import com.comong.backend.domain.taekwondo.entity.TaekwondoMotion;
import com.comong.backend.global.storage.ImageStorage;
import com.comong.backend.global.storage.VideoStorage;

/**
 * 태권도 동작 응답.
 *
 * <p>{@code demoVideoUrl} / {@code thumbnailUrl} 은 {@link VideoStorage#toPublicUrl} / {@link
 * ImageStorage#toPublicUrl} 을 거친 값 — S3 백엔드면 presigned URL.
 */
public record TaekwondoMotionResponse(
        Long id,
        Poomsae poomsae,
        String name,
        int routineOrder,
        int targetReps,
        String description,
        String demoVideoUrl,
        String thumbnailUrl,
        LocalDateTime createdAt,
        LocalDateTime updatedAt) {

    public static TaekwondoMotionResponse from(
            TaekwondoMotion motion, ImageStorage imageStorage, VideoStorage videoStorage) {
        return new TaekwondoMotionResponse(
                motion.getId(),
                motion.getPoomsae(),
                motion.getName(),
                motion.getRoutineOrder(),
                motion.getTargetReps(),
                motion.getDescription(),
                videoStorage.toPublicUrl(motion.getDemoVideoUrl()),
                imageStorage.toPublicUrl(motion.getThumbnailUrl()),
                motion.getCreatedAt(),
                motion.getUpdatedAt());
    }
}
