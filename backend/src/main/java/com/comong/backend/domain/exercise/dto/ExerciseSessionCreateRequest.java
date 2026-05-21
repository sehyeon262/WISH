package com.comong.backend.domain.exercise.dto;

import jakarta.validation.constraints.NotNull;

import com.comong.backend.domain.exercise.entity.ExerciseType;

import io.swagger.v3.oas.annotations.media.Schema;

public record ExerciseSessionCreateRequest(
        @Schema(description = "환자 프로필 ID", example = "1") @NotNull Long patientProfileId,
        @Schema(description = "체조 타입", example = "TOP") @NotNull ExerciseType exerciseType) {}
