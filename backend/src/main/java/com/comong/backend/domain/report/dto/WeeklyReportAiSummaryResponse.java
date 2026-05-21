package com.comong.backend.domain.report.dto;

import java.util.List;

import com.fasterxml.jackson.annotation.JsonInclude;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * 보호자 주간 리포트 AI 요약 응답. AI 서버 {@code /report/summarize} 의 응답을 그대로 전달한다.
 *
 * <p>AI 호출 실패/타임아웃 시 {@link #isFallback()} = true 로 안전 문구 응답이 내려간다 — 리포트 화면은 항상 노출 유지.
 */
@Schema(description = "보호자 주간 리포트 AI 요약")
@JsonInclude(JsonInclude.Include.ALWAYS)
public record WeeklyReportAiSummaryResponse(
        @Schema(description = "3줄 종합 코멘트") List<String> summary,
        @Schema(description = "활동 관찰 1~2개") List<String> activityObservations,
        @Schema(description = "정서/대화 관찰 1~2개") List<String> emotionObservations,
        @Schema(description = "활동-정서 연결 한 문장 (없으면 null)") String connection,
        @Schema(description = "이번 주 함께 해볼 만한 작은 활동 1개") String suggestion,
        @Schema(description = "AI 호출 실패로 안전 문구가 내려간 경우 true") boolean isFallback,
        // DEBUG (임시): fallback 원인 추적용. 운영 안정화 후 제거.
        @Schema(description = "DEBUG: fallback 원인") String debugReason,
        @Schema(description = "DEBUG: AI 원본 응답 일부") String debugRaw) {

    public static WeeklyReportAiSummaryResponse fallback(String reason) {
        return new WeeklyReportAiSummaryResponse(
                List.of(
                        "이번 주 데이터를 한눈에 모아 봤어요.",
                        "활동과 대화 기록이 차곡차곡 쌓이고 있어요.",
                        "다음 주에도 아이의 속도에 맞춰 함께 해주세요."),
                List.of(),
                List.of(),
                null,
                "아이가 가장 좋아한 활동이 무엇이었는지 한 번 물어봐 주세요.",
                true,
                reason,
                null);
    }

    public static WeeklyReportAiSummaryResponse fallback() {
        return fallback("be-default");
    }
}
