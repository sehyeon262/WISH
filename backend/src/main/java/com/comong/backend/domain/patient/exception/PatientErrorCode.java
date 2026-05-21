package com.comong.backend.domain.patient.exception;

import org.springframework.http.HttpStatus;

import com.comong.backend.global.exception.ErrorCode;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

@Getter
@RequiredArgsConstructor
public enum PatientErrorCode implements ErrorCode {
    PATIENT_PROFILE_NOT_FOUND(HttpStatus.NOT_FOUND, "P-001", "환자 프로필을 찾을 수 없습니다."),
    PATIENT_PROFILE_ALREADY_EXISTS(HttpStatus.CONFLICT, "P-002", "이미 등록된 환자 프로필이 있습니다.");

    private final HttpStatus status;
    private final String code;
    private final String message;
}
