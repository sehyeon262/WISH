package com.comong.backend.domain.report.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 주간 리포트 AI 요약 호출 설정 ({@code ai.report.*}).
 *
 * <p>{@link #baseUrl()} 가 비어있으면 호출을 비활성화하고 fallback 응답을 반환한다 (로컬/테스트 환경 부팅 안전핀).
 *
 * <p>Opus 호출이라 dialogue 임베딩 timeout(10s) 보다 길게 잡는다 — 보호자 GET 응답을 동기 대기하기 때문.
 */
@ConfigurationProperties(prefix = "ai.report")
public record AiReportSummaryProperties(String baseUrl, int timeoutSeconds) {

    public boolean isEnabled() {
        return baseUrl != null && !baseUrl.isBlank();
    }
}
