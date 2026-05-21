package com.comong.backend.domain.notification.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import com.comong.backend.domain.notification.entity.DevicePlatform;

import io.swagger.v3.oas.annotations.media.Schema;

public record DeviceTokenRegisterRequest(
        @Schema(description = "FCM device token", example = "fcm-token") @NotBlank @Size(max = 4096)
                String token,
        @Schema(description = "Device platform", example = "WEB") @NotNull DevicePlatform platform,
        @Schema(description = "Browser user agent", example = "Mozilla/5.0") @Size(max = 512)
                String userAgent,
        @Schema(description = "Optional patient profile id for ownership validation", example = "1")
                Long patientProfileId) {}
