package com.comong.backend.domain.gomoku.dto;

public record GomokuStatsResponse(
        long totalGames, long wins, long draws, long losses, double winRate) {
    public static GomokuStatsResponse of(long totalGames, long wins, long draws) {
        long losses = Math.max(0, totalGames - wins - draws);
        double winRate = totalGames == 0 ? 0 : (double) wins / totalGames;
        return new GomokuStatsResponse(totalGames, wins, draws, losses, winRate);
    }
}
