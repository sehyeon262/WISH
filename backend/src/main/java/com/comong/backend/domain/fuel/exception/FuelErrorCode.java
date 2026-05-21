package com.comong.backend.domain.fuel.exception;

import org.springframework.http.HttpStatus;

import com.comong.backend.global.exception.ErrorCode;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

@Getter
@RequiredArgsConstructor
public enum FuelErrorCode implements ErrorCode {
    FUEL_ALREADY_COMPLETED(HttpStatus.CONFLICT, "FL-001", "연료 게이지가 이미 100%에 도달했습니다.");

    private final HttpStatus status;
    private final String code;
    private final String message;
}
