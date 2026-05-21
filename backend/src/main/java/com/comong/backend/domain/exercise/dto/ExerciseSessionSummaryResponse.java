package com.comong.backend.domain.exercise.dto;

import java.time.LocalDateTime;

import com.comong.backend.domain.exercise.entity.ExerciseSession;
import com.comong.backend.domain.exercise.entity.ExerciseType;

public record ExerciseSessionSummaryResponse(
        Long id,
        Long patientProfileId,
        ExerciseType exerciseType,
        int durationSec,
        double averageAccuracy,
        int completedMotionCount,
        LocalDateTime createdAt) {

    public static ExerciseSessionSummaryResponse from(ExerciseSession session) {
        return new ExerciseSessionSummaryResponse(
                session.getId(),
                session.getPatientProfile().getId(),
                session.getExerciseType(),
                session.getDurationSec(),
                session.getAverageAccuracy(),
                session.getCompletedMotionCount(),
                session.getCreatedAt());
    }
}
