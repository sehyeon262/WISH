package com.comong.backend.domain.auth.dto;

import jakarta.validation.constraints.NotBlank;

import io.swagger.v3.oas.annotations.media.Schema;

public record RefreshTokenRequest(
        @Schema(description = "이전에 발급된 refresh token (평문)") @NotBlank String refreshToken) {}
