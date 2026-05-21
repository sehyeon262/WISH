package com.comong.backend.domain.gomoku.repository;

import java.time.LocalDateTime;

public interface GomokuRankingProjection {
    Long getPatientProfileId();

    String getNickname();

    int getTotalGames();

    int getWins();

    int getDraws();

    int getLosses();

    double getWinRate();

    LocalDateTime getLastPlayedAt();
}
