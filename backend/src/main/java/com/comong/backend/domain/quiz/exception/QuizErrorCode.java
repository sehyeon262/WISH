package com.comong.backend.domain.quiz.exception;

import org.springframework.http.HttpStatus;

import com.comong.backend.global.exception.ErrorCode;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

/**
 * 그림 퀴즈 멀티플레이 도메인 에러 코드 (S14P31E103-820).
 *
 * <p>코드 prefix Q- 는 본 도메인 전용. REST + STOMP ERROR 프레임 양쪽에서 같은 코드를 사용한다.
 */
@Getter
@RequiredArgsConstructor
public enum QuizErrorCode implements ErrorCode {
    ROOM_NOT_FOUND(HttpStatus.NOT_FOUND, "Q-001", "방을 찾을 수 없습니다."),
    ROOM_FULL(HttpStatus.CONFLICT, "Q-002", "방 정원이 가득 찼습니다."),
    ROOM_NOT_JOINABLE(HttpStatus.CONFLICT, "Q-003", "현재 입장할 수 없는 방입니다."),
    ALREADY_IN_ROOM(HttpStatus.CONFLICT, "Q-004", "이미 입장한 방이 있습니다."),
    PATIENT_PROFILE_MISSING(HttpStatus.CONFLICT, "Q-005", "환자 프로필이 등록되어 있어야 합니다."),
    NOT_ROOM_HOST(HttpStatus.FORBIDDEN, "Q-006", "방장만 수행할 수 있습니다."),
    NOT_IN_ROOM(HttpStatus.FORBIDDEN, "Q-007", "참가 중인 방이 아닙니다."),
    ROOM_NOT_READY_TO_START(HttpStatus.CONFLICT, "Q-008", "방 시작 조건을 만족하지 않습니다.");

    private final HttpStatus status;
    private final String code;
    private final String message;
}
