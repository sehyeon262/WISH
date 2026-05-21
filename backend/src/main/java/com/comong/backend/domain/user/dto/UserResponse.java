package com.comong.backend.domain.user.dto;

import java.time.LocalDateTime;

import com.comong.backend.domain.user.entity.User;
import com.comong.backend.domain.user.entity.UserRole;

public record UserResponse(
        Long id, String email, String nickname, UserRole role, LocalDateTime createdAt) {
    public static UserResponse from(User user) {
        return new UserResponse(
                user.getId(),
                user.getEmail(),
                user.getNickname(),
                user.getRole(),
                user.getCreatedAt());
    }
}
