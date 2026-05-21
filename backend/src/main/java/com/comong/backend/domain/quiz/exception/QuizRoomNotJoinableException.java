package com.comong.backend.domain.quiz.exception;

import com.comong.backend.global.exception.BusinessException;

/** PLAYING / FINISHED 상태 방에 신규 입장 시도. */
public class QuizRoomNotJoinableException extends BusinessException {

    public QuizRoomNotJoinableException() {
        super(QuizErrorCode.ROOM_NOT_JOINABLE);
    }
}
