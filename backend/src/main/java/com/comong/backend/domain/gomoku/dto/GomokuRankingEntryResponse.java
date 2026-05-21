package com.comong.backend.domain.gomoku.dto;

import java.time.LocalDateTime;

import com.comong.backend.domain.gomoku.repository.GomokuRankingProjection;

public record GomokuRankingEntryResponse(
        int rank,
        Long patientProfileId,
        String nickname,
        int totalGames,
        int wins,
        int draws,
        int losses,
        double winRate,
        LocalDateTime lastPlayedAt,
        boolean isMe) {
    public static GomokuRankingEntryResponse of(
            GomokuRankingProjection projection, int rank, Long myPatientProfileId) {
        boolean isMe =
                myPatientProfileId != null
                        && myPatientProfileId.equals(projection.getPatientProfileId());
        return new GomokuRankingEntryResponse(
                rank,
                projection.getPatientProfileId(),
                projection.getNickname(),
                projection.getTotalGames(),
                projection.getWins(),
                projection.getDraws(),
                projection.getLosses(),
                projection.getWinRate(),
                projection.getLastPlayedAt(),
                isMe);
    }
}
