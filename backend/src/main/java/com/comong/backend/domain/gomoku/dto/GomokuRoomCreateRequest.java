package com.comong.backend.domain.gomoku.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import com.comong.backend.domain.gomoku.entity.GomokuRuleSet;

public record GomokuRoomCreateRequest(
        @NotNull GomokuRuleSet ruleSet,
        @Min(10) @Max(300) int timerSeconds,
        @Size(max = 80) @Pattern(regexp = "^[A-Za-z0-9_-]*$") String textureKey) {}
