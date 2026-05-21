package com.comong.backend.domain.exercise.dto;

import java.util.List;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

import com.comong.backend.domain.exercise.entity.ExerciseType;

public record ExerciseMotionReorderRequest(
        @NotNull ExerciseType exerciseType, @NotEmpty List<@NotNull Long> motionIds) {}
