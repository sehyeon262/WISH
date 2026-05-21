package com.comong.backend.domain.realtime.exception;

import org.springframework.http.HttpStatus;

import com.comong.backend.global.exception.ErrorCode;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

/** Realtime 도메인 (LiveKit 실시간 모니터링) 에러 코드. 접두사 {@code RT-} — 실시간 기능 전용 prefix. */
@Getter
@RequiredArgsConstructor
public enum RealtimeErrorCode implements ErrorCode {
    LIVEKIT_NOT_CONFIGURED(HttpStatus.SERVICE_UNAVAILABLE, "RT-001", "LiveKit 설정이 완료되지 않았습니다."),
    LOGIN_SESSION_ALREADY_ENDED(HttpStatus.CONFLICT, "RT-002", "이미 종료된 접속 세션입니다."),
    LIVEKIT_TOKEN_ISSUE_FAILED(HttpStatus.SERVICE_UNAVAILABLE, "RT-003", "LiveKit 토큰 발급에 실패했습니다."),
    INVALID_CONTENT_TYPE(HttpStatus.BAD_REQUEST, "RT-004", "실시간 콘텐츠 타입이 아닙니다.");

    private final HttpStatus status;
    private final String code;
    private final String message;
}
