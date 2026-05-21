package com.comong.backend.domain.music.dto;

import java.time.LocalDateTime;

import com.comong.backend.domain.music.entity.MusicResult;

public record MusicResultResponse(
        Long id,
        String chartId,
        int score,
        int maxCombo,
        int perfectCount,
        int greatCount,
        int goodCount,
        int missCount,
        int totalNotes,
        double accuracy,
        String rank,
        int playedDurationMs,
        LocalDateTime playedAt,
        String videoKey,
        String thumbKey,
        boolean isNewBest,
        Integer previousBestScore) {

    public static MusicResultResponse of(
            MusicResult result, boolean isNewBest, Integer previousBestScore) {
        return new MusicResultResponse(
                result.getId(),
                result.getMusicChart().getChartId(),
                result.getScore(),
                result.getMaxCombo(),
                result.getPerfectCount(),
                result.getGreatCount(),
                result.getGoodCount(),
                result.getMissCount(),
                result.getTotalNotes(),
                result.getAccuracy(),
                result.getRank().name(),
                result.getPlayedDurationMs(),
                result.getPlayedAt(),
                result.getVideoKey(),
                result.getThumbKey(),
                isNewBest,
                previousBestScore);
    }
}
