package com.comong.backend.domain.gomoku.dto;

import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record GomokuRoomJoinRequest(
        @Size(max = 80) @Pattern(regexp = "^[A-Za-z0-9_-]*$") String textureKey) {}
