package com.comong.backend.domain.music.dto;

import java.time.LocalDateTime;

import com.comong.backend.domain.music.entity.MusicResult;

public record MusicResultDetailResponse(
        Long id,
        String chartId,
        String chartTitle,
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
        String videoUrl,
        String thumbUrl) {

    public static MusicResultDetailResponse of(
            MusicResult result, String videoUrl, String thumbUrl) {
        return new MusicResultDetailResponse(
                result.getId(),
                result.getMusicChart().getChartId(),
                result.getMusicChart().getTitle(),
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
                videoUrl,
                thumbUrl);
    }
}
