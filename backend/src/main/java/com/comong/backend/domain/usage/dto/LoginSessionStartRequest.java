package com.comong.backend.domain.usage.dto;

import jakarta.validation.constraints.NotNull;

import io.swagger.v3.oas.annotations.media.Schema;

public record LoginSessionStartRequest(
        @Schema(description = "세션 대상 환자 프로필 ID (본인 소유)", example = "1") @NotNull
                Long patientProfileId) {}
