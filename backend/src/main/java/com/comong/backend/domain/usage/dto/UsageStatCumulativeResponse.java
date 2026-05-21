package com.comong.backend.domain.usage.dto;

import io.swagger.v3.oas.annotations.media.Schema;

public record UsageStatCumulativeResponse(
        @Schema(description = "조회 대상 환자 ID") Long patientId,
        @Schema(description = "앱 접속 누적 시간 (초)") long login,
        @Schema(description = "미술 누적 시간 (초)") long art,
        @Schema(description = "음악 누적 시간 (초)") long music,
        @Schema(description = "태권도 누적 시간 (초)") long taekwondo,
        @Schema(description = "체조 누적 시간 (초)") long gymnastics) {}
