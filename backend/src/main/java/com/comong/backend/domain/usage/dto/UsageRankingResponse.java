package com.comong.backend.domain.usage.dto;

import java.time.LocalDate;
import java.util.List;

public record UsageRankingResponse(LocalDate from, LocalDate to, List<RankingEntry> rankings) {

    public record RankingEntry(
            int rank, long patientProfileId, String nickname, long totalSeconds) {}
}
