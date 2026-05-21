package com.comong.backend.domain.gomoku.exception;

import org.springframework.http.HttpStatus;

import com.comong.backend.global.exception.ErrorCode;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

@Getter
@RequiredArgsConstructor
public enum GomokuErrorCode implements ErrorCode {
    GOMOKU_ROOM_NOT_FOUND(HttpStatus.NOT_FOUND, "GM-001", "오목 방을 찾을 수 없습니다."),
    GOMOKU_INVALID_ROOM_STATE(HttpStatus.BAD_REQUEST, "GM-002", "현재 오목 방 상태에서 수행할 수 없습니다."),
    GOMOKU_NOT_PARTICIPANT(HttpStatus.FORBIDDEN, "GM-003", "오목 방 참가자가 아닙니다."),
    GOMOKU_NOT_YOUR_TURN(HttpStatus.BAD_REQUEST, "GM-004", "현재 차례가 아닙니다."),
    GOMOKU_INVALID_MOVE(HttpStatus.BAD_REQUEST, "GM-005", "둘 수 없는 위치입니다."),
    GOMOKU_ROOM_FULL(HttpStatus.BAD_REQUEST, "GM-006", "이미 가득 찬 오목 방입니다."),
    GOMOKU_SELF_PLAY_NOT_ALLOWED(HttpStatus.BAD_REQUEST, "GM-007", "자신의 방에는 입장할 수 없습니다."),
    GOMOKU_MESSAGE_BLANK(HttpStatus.BAD_REQUEST, "GM-008", "메시지 내용이 비어 있습니다."),
    GOMOKU_MESSAGE_TOO_LONG(HttpStatus.BAD_REQUEST, "GM-009", "메시지 길이는 200자 이하여야 합니다."),
    GOMOKU_MESSAGE_RATE_LIMITED(
            HttpStatus.TOO_MANY_REQUESTS, "GM-010", "메시지가 너무 빠르게 전송되었어요. 잠시 후 다시 시도해 주세요."),
    GOMOKU_MESSAGE_NOT_ALLOWED(HttpStatus.BAD_REQUEST, "GM-011", "현재 상태에서는 메시지를 전송할 수 없어요.");

    private final HttpStatus status;
    private final String code;
    private final String message;
}
