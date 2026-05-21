package com.comong.backend.domain.fuel.dto;

import java.util.List;

import io.swagger.v3.oas.annotations.media.Schema;

public record FuelStatusResponse(
        @Schema(description = "화면에 표시할 게이지 퍼센트") int percentage,
        @Schema(description = "환자별 전체 누적 연료량") long totalAmount,
        @Schema(description = "연료 게이지 100% 도달 여부") boolean completed,
        @Schema(description = "연료 전송 기록 (최신순)") List<FuelEventResponse> events) {

    public static FuelStatusResponse of(long totalAmount, List<FuelEventResponse> events) {
        int percentage = (int) Math.min(100, totalAmount);
        return new FuelStatusResponse(percentage, totalAmount, totalAmount >= 100, events);
    }
}
