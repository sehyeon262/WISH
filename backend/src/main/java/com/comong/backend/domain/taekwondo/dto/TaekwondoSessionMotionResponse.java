package com.comong.backend.domain.taekwondo.dto;

import java.time.LocalDateTime;

import com.comong.backend.domain.performance.entity.PerformanceVideo;
import com.comong.backend.domain.performance.service.PerformanceVideoService;
import com.comong.backend.domain.taekwondo.entity.TaekwondoSessionMotion;

public record TaekwondoSessionMotionResponse(
        Long id,
        Long taekwondoMotionId,
        String motionName,
        int routineOrder,
        int durationSec,
        double accuracy,
        int completedReps,
        String feedback,
        String videoUrl,
        String thumbUrl,
        LocalDateTime createdAt) {

    public static TaekwondoSessionMotionResponse from(
            TaekwondoSessionMotion sessionMotion, PerformanceVideoService performanceVideoService) {
        PerformanceVideo performanceVideo = sessionMotion.getPerformanceVideo();
        return new TaekwondoSessionMotionResponse(
                sessionMotion.getId(),
                sessionMotion.getMotion().getId(),
                sessionMotion.getMotion().getName(),
                sessionMotion.getMotion().getRoutineOrder(),
                sessionMotion.getDurationSec(),
                sessionMotion.getAccuracy(),
                sessionMotion.getCompletedReps(),
                sessionMotion.getFeedback(),
                performanceVideo == null
                        ? null
                        : performanceVideoService.toPublicUrl(performanceVideo.getVideoKey()),
                performanceVideo == null
                        ? null
                        : performanceVideoService.toPublicUrl(performanceVideo.getThumbKey()),
                sessionMotion.getCreatedAt());
    }
}
