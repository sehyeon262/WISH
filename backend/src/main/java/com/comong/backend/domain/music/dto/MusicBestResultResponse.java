package com.comong.backend.domain.music.dto;

import java.time.LocalDateTime;

import com.comong.backend.domain.music.entity.MusicResult;

public record MusicBestResultResponse(
        String chartId,
        int bestScore,
        String bestRank,
        double bestAccuracy,
        long playCount,
        LocalDateTime lastPlayedAt) {

    public static MusicBestResultResponse of(
            MusicResult bestResult, long playCount, LocalDateTime lastPlayedAt) {
        return new MusicBestResultResponse(
                bestResult.getMusicChart().getChartId(),
                bestResult.getScore(),
                bestResult.getRank().name(),
                bestResult.getAccuracy(),
                playCount,
                lastPlayedAt);
    }
}
