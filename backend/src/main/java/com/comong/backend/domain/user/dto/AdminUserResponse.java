package com.comong.backend.domain.user.dto;

import java.time.LocalDateTime;

import com.comong.backend.domain.patient.entity.PatientProfile;
import com.comong.backend.domain.user.entity.User;
import com.comong.backend.domain.user.entity.UserRole;

public record AdminUserResponse(
        Long id,
        String email,
        String nickname,
        UserRole role,
        LocalDateTime createdAt,
        Long patientProfileId,
        String patientName,
        String patientNickname) {
    public static AdminUserResponse from(User user, PatientProfile patientProfile) {
        return new AdminUserResponse(
                user.getId(),
                user.getEmail(),
                user.getNickname(),
                user.getRole(),
                user.getCreatedAt(),
                patientProfile != null ? patientProfile.getId() : null,
                patientProfile != null ? patientProfile.getName() : null,
                patientProfile != null ? patientProfile.getNickname() : null);
    }
}
