package com.comong.backend.domain.exercise.dto;

import java.time.LocalDateTime;

public record ExerciseSessionMotionResponseRow(
        Long id,
        Long exerciseMotionId,
        String motionName,
        int routineOrder,
        int durationSec,
        double accuracy,
        int completedReps,
        String feedback,
        String videoKey,
        String thumbKey,
        boolean replayAvailable,
        LocalDateTime createdAt) {}
