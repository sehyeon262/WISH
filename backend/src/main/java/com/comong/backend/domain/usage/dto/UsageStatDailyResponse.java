package com.comong.backend.domain.usage.dto;

import java.time.LocalDate;
import java.util.List;

import io.swagger.v3.oas.annotations.media.Schema;

public record UsageStatDailyResponse(
        @Schema(description = "조회 대상 환자 ID") Long patientId,
        @Schema(description = "조회 시작일 (포함)") LocalDate from,
        @Schema(description = "조회 종료일 (포함, 기본값 오늘)") LocalDate to,
        @Schema(description = "일별 사용 시간 (초)") List<Item> items) {

    public record Item(
            @Schema(description = "기준 날짜") LocalDate date,
            @Schema(description = "앱 접속 시간 (초)") long login,
            @Schema(description = "미술 시간 (초)") long art,
            @Schema(description = "음악 시간 (초)") long music,
            @Schema(description = "태권도 시간 (초)") long taekwondo,
            @Schema(description = "체조 시간 (초)") long gymnastics) {}
}
