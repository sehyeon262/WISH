package com.comong.backend.domain.dialogue.dto;

import java.time.LocalDate;
import java.util.List;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * 보호자 화면 "지난 주 응답 톤 변화" 그래프 데이터. 각 일별 *긍정+보통 비율 %* (점수 아님).
 *
 * <p>임상 진단 회피를 위해 *비율* 로 표현 — y축이 "감정 점수" 가 아니라 "응답 톤 비율".
 */
public record WeeklyDialogueTrendResponse(
        @Schema(description = "7일치 일별 포인트 (오래된 순)") List<TrendPoint> points) {

    public record TrendPoint(
            @Schema(description = "날짜 (KST)", example = "2026-05-14") LocalDate date,
            @Schema(description = "긍정+보통 응답 비율 (%, 0~100). 세션 없으면 null", nullable = true)
                    Integer positiveNeutralPercent,
            @Schema(description = "해당 일자 세션 개수", example = "2") int sessionCount) {}
}
