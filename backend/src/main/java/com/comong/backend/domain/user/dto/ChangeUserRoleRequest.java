package com.comong.backend.domain.user.dto;

import jakarta.validation.constraints.NotNull;

import com.comong.backend.domain.user.entity.UserRole;

public record ChangeUserRoleRequest(@NotNull UserRole role) {}
