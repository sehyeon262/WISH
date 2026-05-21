package com.comong.backend.domain.notification.dto;

import java.time.LocalDateTime;

import com.comong.backend.domain.notification.entity.DevicePlatform;
import com.comong.backend.domain.notification.entity.GuardianDeviceToken;

public record DeviceTokenResponse(
        Long id,
        DevicePlatform platform,
        boolean active,
        LocalDateTime createdAt,
        LocalDateTime updatedAt) {

    public static DeviceTokenResponse from(GuardianDeviceToken deviceToken) {
        return new DeviceTokenResponse(
                deviceToken.getId(),
                deviceToken.getPlatform(),
                deviceToken.isActive(),
                deviceToken.getCreatedAt(),
                deviceToken.getUpdatedAt());
    }
}
