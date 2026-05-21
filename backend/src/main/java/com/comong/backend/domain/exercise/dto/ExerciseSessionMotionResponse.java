package com.comong.backend.domain.exercise.dto;

import java.time.LocalDateTime;

import com.comong.backend.domain.exercise.entity.ExerciseSessionMotion;
import com.comong.backend.domain.performance.entity.PerformanceVideo;
import com.comong.backend.domain.performance.service.PerformanceVideoService;

public record ExerciseSessionMotionResponse(
        Long id,
        Long exerciseMotionId,
        String motionName,
        int routineOrder,
        int durationSec,
        double accuracy,
        int completedReps,
        String feedback,
        String videoUrl,
        String thumbUrl,
        boolean replayAvailable,
        LocalDateTime createdAt) {

    public static ExerciseSessionMotionResponse from(
            ExerciseSessionMotion sessionMotion, PerformanceVideoService performanceVideoService) {
        PerformanceVideo performanceVideo = sessionMotion.getPerformanceVideo();
        return new ExerciseSessionMotionResponse(
                sessionMotion.getId(),
                sessionMotion.getExerciseMotion().getId(),
                sessionMotion.getExerciseMotion().getName(),
                sessionMotion.getExerciseMotion().getRoutineOrder(),
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
                sessionMotion.hasPoseReplay(),
                sessionMotion.getCreatedAt());
    }

    public static ExerciseSessionMotionResponse from(
            ExerciseSessionMotionResponseRow row, PerformanceVideoService performanceVideoService) {
        return new ExerciseSessionMotionResponse(
                row.id(),
                row.exerciseMotionId(),
                row.motionName(),
                row.routineOrder(),
                row.durationSec(),
                row.accuracy(),
                row.completedReps(),
                row.feedback(),
                row.videoKey() == null ? null : performanceVideoService.toPublicUrl(row.videoKey()),
                row.thumbKey() == null ? null : performanceVideoService.toPublicUrl(row.thumbKey()),
                row.replayAvailable(),
                row.createdAt());
    }
}
