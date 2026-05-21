package com.comong.backend.domain.gomoku.entity;

public enum GomokuStone {
    BLACK,
    WHITE;

    public GomokuStone opponent() {
        return this == BLACK ? WHITE : BLACK;
    }
}
