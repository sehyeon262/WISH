package com.comong.backend.domain.notification.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import io.swagger.v3.oas.annotations.media.Schema;

public record DeviceTokenDeactivateRequest(
        @Schema(description = "FCM device token", example = "fcm-token") @NotBlank @Size(max = 4096)
                String token) {}
