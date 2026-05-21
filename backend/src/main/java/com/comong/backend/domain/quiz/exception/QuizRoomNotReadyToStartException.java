package com.comong.backend.domain.quiz.exception;

import com.comong.backend.global.exception.BusinessException;

/** 방장 게임 시작 시도 시 인원 부족 등 시작 조건 미충족. */
public class QuizRoomNotReadyToStartException extends BusinessException {

    public QuizRoomNotReadyToStartException() {
        super(QuizErrorCode.ROOM_NOT_READY_TO_START);
    }
}
