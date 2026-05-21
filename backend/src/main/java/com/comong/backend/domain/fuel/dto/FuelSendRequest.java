package com.comong.backend.domain.fuel.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import io.swagger.v3.oas.annotations.media.Schema;

public record FuelSendRequest(
        @Schema(description = "전송할 연료량 (1~100)", example = "20") @NotNull @Min(1) @Max(100)
                Integer amount,
        @Schema(description = "보호자 응원 메시지", example = "오늘도 정말 잘하고 있어!") @NotBlank @Size(max = 100)
                String message) {

    public String normalizedMessage() {
        return message.trim();
    }
}
