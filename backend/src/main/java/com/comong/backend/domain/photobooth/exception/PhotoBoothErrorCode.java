package com.comong.backend.domain.photobooth.exception;

import org.springframework.http.HttpStatus;

import com.comong.backend.global.exception.ErrorCode;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

/**
 * PhotoBooth 도메인 에러 코드. 접두사 {@code PB-}.
 *
 * <p>{@code INVALID_IMAGE} / 업로드 실패 등 스토리지 인프라 관련 코드는 {@link
 * com.comong.backend.global.storage.StorageErrorCode} 참고.
 */
@Getter
@RequiredArgsConstructor
public enum PhotoBoothErrorCode implements ErrorCode {
    PHOTO_BOOTH_NOT_FOUND(HttpStatus.NOT_FOUND, "PB-001", "사진을 찾을 수 없습니다."),
    PHOTO_BOOTH_ACCESS_DENIED(HttpStatus.FORBIDDEN, "PB-002", "사진에 접근할 권한이 없습니다.");

    private final HttpStatus status;
    private final String code;
    private final String message;
}
