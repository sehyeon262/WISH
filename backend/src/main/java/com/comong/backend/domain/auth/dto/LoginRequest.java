package com.comong.backend.domain.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

import io.swagger.v3.oas.annotations.media.Schema;

public record LoginRequest(
        @Schema(description = "이메일", example = "user@comong.com") @NotBlank @Email String email,
        @Schema(description = "비밀번호", example = "P@ssw0rd!") @NotBlank String password) {}
