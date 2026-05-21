package com.comong.backend.domain.quiz.exception;

import com.comong.backend.global.exception.BusinessException;

/** 방 정원 초과로 입장이 거부된 경우. */
public class QuizRoomFullException extends BusinessException {

    public QuizRoomFullException() {
        super(QuizErrorCode.ROOM_FULL);
    }
}
