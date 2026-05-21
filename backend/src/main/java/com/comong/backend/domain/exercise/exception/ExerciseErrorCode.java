package com.comong.backend.domain.exercise.exception;

import org.springframework.http.HttpStatus;

import com.comong.backend.global.exception.ErrorCode;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

@Getter
@RequiredArgsConstructor
public enum ExerciseErrorCode implements ErrorCode {
    EXERCISE_MOTION_NOT_FOUND(HttpStatus.NOT_FOUND, "EX-001", "체조 동작을 찾을 수 없습니다."),
    EXERCISE_MOTION_ROUTINE_ORDER_DUPLICATED(
            HttpStatus.CONFLICT, "EX-002", "같은 체조 타입에 이미 등록된 동작 순서입니다."),
    EXERCISE_MOTION_IN_USE(HttpStatus.CONFLICT, "EX-003", "수행 기록에서 사용 중인 체조 동작은 삭제할 수 없습니다."),
    EXERCISE_SESSION_MOTION_TYPE_MISMATCH(
            HttpStatus.BAD_REQUEST, "EX-004", "세션 체조 타입과 동작 체조 타입이 일치하지 않습니다."),
    EXERCISE_SESSION_NOT_FOUND(HttpStatus.NOT_FOUND, "EX-005", "체조 세션을 찾을 수 없습니다."),
    EXERCISE_MOTION_REORDER_SET_MISMATCH(
            HttpStatus.BAD_REQUEST, "EX-006", "순서를 변경할 체조 동작 목록이 현재 목록과 일치하지 않습니다.");

    private final HttpStatus status;
    private final String code;
    private final String message;
}
