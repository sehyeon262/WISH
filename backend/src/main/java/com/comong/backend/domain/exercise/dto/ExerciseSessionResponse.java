package com.comong.backend.domain.exercise.dto;

import java.time.LocalDateTime;
import java.util.List;

import com.comong.backend.domain.exercise.entity.ExerciseSession;
import com.comong.backend.domain.exercise.entity.ExerciseType;

public record ExerciseSessionResponse(
        Long id,
        Long patientProfileId,
        ExerciseType exerciseType,
        int durationSec,
        double averageAccuracy,
        int completedMotionCount,
        LocalDateTime createdAt,
        List<ExerciseSessionMotionResponse> motions) {

    public static ExerciseSessionResponse of(
            ExerciseSession session, List<ExerciseSessionMotionResponse> motions) {
        return new ExerciseSessionResponse(
                session.getId(),
                session.getPatientProfile().getId(),
                session.getExerciseType(),
                session.getDurationSec(),
                session.getAverageAccuracy(),
                session.getCompletedMotionCount(),
                session.getCreatedAt(),
                motions);
    }
}
