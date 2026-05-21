package com.comong.backend.domain.exercise.dto;

import com.comong.backend.domain.exercise.entity.ExerciseSession;
import com.comong.backend.domain.exercise.entity.ExerciseSessionMotion;
import com.comong.backend.domain.performance.service.PerformanceVideoService;

public record ExerciseSessionMotionSaveResponse(
        Long sessionId,
        int sessionDurationSec,
        double sessionAverageAccuracy,
        int sessionCompletedMotionCount,
        ExerciseSessionMotionResponse savedMotion) {

    public static ExerciseSessionMotionSaveResponse of(
            ExerciseSession session,
            ExerciseSessionMotion savedMotion,
            PerformanceVideoService performanceVideoService) {
        return new ExerciseSessionMotionSaveResponse(
                session.getId(),
                session.getDurationSec(),
                session.getAverageAccuracy(),
                session.getCompletedMotionCount(),
                ExerciseSessionMotionResponse.from(savedMotion, performanceVideoService));
    }
}
