package com.comong.backend.domain.gomoku.dto;

import java.time.LocalDateTime;

import com.comong.backend.domain.gomoku.entity.GomokuStone;

public record GomokuMoveRecord(int row, int col, GomokuStone stone, LocalDateTime playedAt) {}
