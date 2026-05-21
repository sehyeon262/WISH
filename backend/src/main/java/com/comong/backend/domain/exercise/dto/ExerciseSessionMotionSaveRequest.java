package com.comong.backend.domain.exercise.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import io.swagger.v3.oas.annotations.media.Schema;

public record ExerciseSessionMotionSaveRequest(
        @Schema(description = "Exercise motion ID", example = "1") @NotNull Long exerciseMotionId,
        @Schema(description = "Motion duration in seconds", example = "12") @NotNull @PositiveOrZero
                Integer durationSec,
        @Schema(description = "Motion accuracy from 0 to 1", example = "0.91")
                @NotNull
                @DecimalMin("0.0")
                @DecimalMax("1.0")
                Double accuracy,
        @Schema(description = "Completed repetition count", example = "8") @NotNull @PositiveOrZero
                Integer completedReps,
        @Schema(description = "Saved feedback", example = "Raise your knee higher.")
                @NotBlank
                @Size(max = 255)
                String feedback,
        @Schema(description = "Performance video S3 object key") @Size(max = 1024) String videoKey,
        @Schema(description = "Performance thumbnail S3 object key") @Size(max = 1024)
                String thumbKey,
        @Schema(description = "30fps pose replay data for this motion") @Valid
                ExerciseMotionReplayData poseReplay,
        @Schema(description = "5~10fps AI compact pose replay data for comparison") @Valid
                ExerciseMotionReplayData compactPoseReplay) {}
