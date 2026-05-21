package com.comong.backend.domain.taekwondo.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import io.swagger.v3.oas.annotations.media.Schema;

public record TaekwondoSessionMotionSaveRequest(
        @Schema(description = "태권도 동작 ID", example = "1") @NotNull Long taekwondoMotionId,
        @Schema(description = "해당 동작 소요 시간(초)", example = "12") @NotNull @PositiveOrZero
                Integer durationSec,
        @Schema(description = "해당 동작 정확도(0~1)", example = "0.91")
                @NotNull
                @DecimalMin("0.0")
                @DecimalMax("1.0")
                Double accuracy,
        @Schema(description = "수행 반복 수", example = "1") @NotNull @PositiveOrZero
                Integer completedReps,
        @Schema(description = "저장 피드백", example = "동작 완료") @NotBlank @Size(max = 255)
                String feedback,
        @Schema(description = "해당 동작에서 처치한 몬스터 수", example = "3") @NotNull @PositiveOrZero
                Integer monstersDefeated,
        @Schema(description = "수행 영상 S3 object key") @Size(max = 1024) String videoKey,
        @Schema(description = "수행 영상 썸네일 S3 object key") @Size(max = 1024) String thumbKey) {}
