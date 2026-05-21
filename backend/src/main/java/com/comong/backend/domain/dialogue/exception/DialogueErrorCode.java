package com.comong.backend.domain.dialogue.exception;

import org.springframework.http.HttpStatus;

import com.comong.backend.global.exception.ErrorCode;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

/** Dialogue 도메인 에러 코드. 접두사 {@code DL-} 사용 — NPC 와의 턴 기반 대화 (등대지기 + 마을 주민 5인) 도메인. */
@Getter
@RequiredArgsConstructor
public enum DialogueErrorCode implements ErrorCode {
    SESSION_NOT_FOUND(HttpStatus.NOT_FOUND, "DL-001", "대화 세션을 찾을 수 없습니다."),
    SESSION_ACCESS_DENIED(HttpStatus.FORBIDDEN, "DL-002", "대화 세션에 접근할 권한이 없습니다."),
    SESSION_ALREADY_FINISHED(HttpStatus.CONFLICT, "DL-003", "이미 종료된 대화 세션입니다."),
    SESSION_TURN_DUPLICATE(HttpStatus.CONFLICT, "DL-004", "동일한 턴이 이미 저장되어 있습니다."),
    INVALID_CHOICE_FOR_STEP(HttpStatus.BAD_REQUEST, "DL-006", "이 단계에서는 선택할 수 없는 선택지입니다.");

    private final HttpStatus status;
    private final String code;
    private final String message;
}
