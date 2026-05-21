package com.comong.backend.domain.usage.dto;

import java.time.LocalDate;
import java.util.List;

public record UsageAverageResponse(
        LocalDate from,
        LocalDate to,
        long activePatients,
        UsageAverage login,
        List<ContentUsageAverage> contentAverages) {

    public record UsageAverage(long totalSeconds, long averageSeconds) {}

    public record ContentUsageAverage(
            String contentType, String label, long totalSeconds, long averageSeconds) {}
}
