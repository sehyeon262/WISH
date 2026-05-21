package com.comong.backend.domain.user.exception;

import org.springframework.http.HttpStatus;

import com.comong.backend.global.exception.ErrorCode;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

@Getter
@RequiredArgsConstructor
public enum UserErrorCode implements ErrorCode {
    USER_NOT_FOUND(HttpStatus.NOT_FOUND, "U-001", "사용자를 찾을 수 없습니다."),
    EMAIL_DUPLICATED(HttpStatus.CONFLICT, "U-002", "이미 사용 중인 이메일입니다."),
    NICKNAME_DUPLICATED(HttpStatus.CONFLICT, "U-003", "이미 사용 중인 닉네임입니다."),
    CANNOT_CHANGE_OWN_ROLE(HttpStatus.BAD_REQUEST, "U-004", "본인의 권한은 변경할 수 없습니다."),
    LAST_ADMIN_DEMOTION_FORBIDDEN(HttpStatus.BAD_REQUEST, "U-005", "마지막 관리자 계정은 권한을 강등할 수 없습니다.");

    private final HttpStatus status;
    private final String code;
    private final String message;
}
