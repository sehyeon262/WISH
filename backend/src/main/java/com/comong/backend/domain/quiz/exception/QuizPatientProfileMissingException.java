package com.comong.backend.domain.quiz.exception;

import com.comong.backend.global.exception.BusinessException;

/** 환자 프로필이 없는 사용자의 방 생성/입장 시도. */
public class QuizPatientProfileMissingException extends BusinessException {

    public QuizPatientProfileMissingException() {
        super(QuizErrorCode.PATIENT_PROFILE_MISSING);
    }
}
