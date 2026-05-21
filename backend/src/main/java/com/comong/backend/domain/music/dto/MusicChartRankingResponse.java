package com.comong.backend.domain.music.dto;

import java.util.List;

public record MusicChartRankingResponse(
        String chartId,
        String chartTitle,
        int totalPlayers,
        List<MusicRankingEntryResponse> entries,
        MusicMyRankingResponse me) {}
