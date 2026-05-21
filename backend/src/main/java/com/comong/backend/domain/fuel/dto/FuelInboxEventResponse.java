package com.comong.backend.domain.fuel.dto;

import java.time.LocalDateTime;

import com.comong.backend.domain.fuel.entity.FuelEvent;

import io.swagger.v3.oas.annotations.media.Schema;

public record FuelInboxEventResponse(
        @Schema(description = "연료 이벤트 ID") Long id,
        @Schema(description = "연료량") int amount,
        @Schema(description = "보호자 응원 메시지") String message,
        @Schema(description = "전송 시각") LocalDateTime createdAt) {

    public static FuelInboxEventResponse from(FuelEvent event) {
        return new FuelInboxEventResponse(
                event.getId(), event.getAmount(), event.getMessage(), event.getCreatedAt());
    }
}
