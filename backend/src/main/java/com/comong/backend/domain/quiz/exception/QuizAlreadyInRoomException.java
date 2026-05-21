package com.comong.backend.domain.quiz.exception;

import com.comong.backend.global.exception.BusinessException;

/** 이미 어느 방에 들어가 있는 유저가 새 방을 만들거나 다른 방에 입장하려는 경우. */
public class QuizAlreadyInRoomException extends BusinessException {

    public QuizAlreadyInRoomException() {
        super(QuizErrorCode.ALREADY_IN_ROOM);
    }
}
