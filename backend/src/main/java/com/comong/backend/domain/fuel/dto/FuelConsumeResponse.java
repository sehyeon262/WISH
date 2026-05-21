package com.comong.backend.domain.fuel.dto;

import io.swagger.v3.oas.annotations.media.Schema;

public record FuelConsumeResponse(@Schema(description = "이번 요청에서 새로 확인 처리된 이벤트 수") int count) {}
