package com.comong.backend.domain.admin.dto;

import java.time.LocalDateTime;

public record GuardianNotificationResponse(
        Long patientId,
        String patientName,
        String guardianEmail,
        String type,
        String message,
        LocalDateTime sentAt) {}
