package com.comong.backend.domain.music.dto;

import java.time.LocalDateTime;

public record MusicMyRankingResponse(
        Integer rank,
        Integer bestScore,
        Double bestAccuracy,
        Integer bestMaxCombo,
        String bestRankGrade,
        LocalDateTime bestPlayedAt) {

    public static MusicMyRankingResponse empty() {
        return new MusicMyRankingResponse(null, null, null, null, null, null);
    }
}
