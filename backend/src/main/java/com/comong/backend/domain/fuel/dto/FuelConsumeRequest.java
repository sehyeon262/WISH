package com.comong.backend.domain.fuel.dto;

import java.util.List;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

import io.swagger.v3.oas.annotations.media.Schema;

public record FuelConsumeRequest(
        @Schema(description = "확인 완료 처리할 연료 이벤트 ID 목록", example = "[1,2,3]") @NotEmpty
                List<@NotNull Long> ids) {}
