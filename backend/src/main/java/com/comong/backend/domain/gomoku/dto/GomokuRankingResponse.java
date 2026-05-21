package com.comong.backend.domain.gomoku.dto;

import java.util.List;

public record GomokuRankingResponse(
        int totalPlayers,
        int minGames,
        List<GomokuRankingEntryResponse> entries,
        GomokuRankingEntryResponse me) {}
