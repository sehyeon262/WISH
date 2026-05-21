package com.comong.backend.domain.quiz.exception;

import com.comong.backend.global.exception.BusinessException;

/** 방장 전용 동작(시작/킥 등) 을 비방장이 시도한 경우. */
public class QuizNotRoomHostException extends BusinessException {

    public QuizNotRoomHostException() {
        super(QuizErrorCode.NOT_ROOM_HOST);
    }
}
