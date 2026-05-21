package com.comong.backend.domain.dialogue.dto;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * 응답 톤 분포 — 보호자 화면 "응답 톤 비율" 위젯의 데이터.
 *
 * <p>3 카테고리의 raw 카운트만 제공. 비율 계산은 FE 에서 (긍정·보통 = {@code positive + neutral} / 총합).
 */
public record ValenceDistributionResponse(
        @Schema(description = "긍정 응답 (건설적 대처) 카운트") int positive,
        @Schema(description = "보통 응답 (경계·휴식·불확실) 카운트") int neutral,
        @Schema(description = "부정 응답 (디스트레스 표현) 카운트") int negative) {

    public int total() {
        return positive + neutral + negative;
    }
}
