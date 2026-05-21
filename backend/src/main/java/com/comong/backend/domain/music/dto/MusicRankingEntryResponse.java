package com.comong.backend.domain.music.dto;

import java.time.LocalDateTime;

public record MusicRankingEntryResponse(
        int rank,
        Long patientProfileId,
        String nickname,
        int score,
        double accuracy,
        int maxCombo,
        String rankGrade,
        LocalDateTime playedAt,
        boolean isMe) {}
