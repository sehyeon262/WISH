package com.comong.backend.domain.gomoku.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

public record GomokuMoveRequest(@Min(0) @Max(14) int row, @Min(0) @Max(14) int col) {}
