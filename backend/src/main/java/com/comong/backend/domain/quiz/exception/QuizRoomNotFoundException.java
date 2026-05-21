package com.comong.backend.domain.quiz.exception;

import com.comong.backend.global.exception.BusinessException;

/** 입장 코드/방 ID 로 방을 찾지 못한 경우. */
public class QuizRoomNotFoundException extends BusinessException {

    public QuizRoomNotFoundException() {
        super(QuizErrorCode.ROOM_NOT_FOUND);
    }
}
