package com.comong.backend.domain.quiz.exception;

import com.comong.backend.global.exception.BusinessException;

/** 참가 중이 아닌 방에 대한 동작 시도 (예: STOMP CONNECT 시 멤버 검증 실패). */
public class QuizNotInRoomException extends BusinessException {

    public QuizNotInRoomException() {
        super(QuizErrorCode.NOT_IN_ROOM);
    }
}
