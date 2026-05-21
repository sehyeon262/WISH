package com.comong.backend.global.storage;

import org.springframework.http.HttpStatus;

import com.comong.backend.global.exception.ErrorCode;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

/**
 * 스토리지 인프라 에러 코드. 접두사 {@code S-}.
 *
 * <ul>
 *   <li>{@link #INVALID_IMAGE}: 사용자가 보낸 파일이 이미지 검증을 통과하지 못함 (Content-Type / magic-bytes / 확장자
 *       allowlist / 포맷-확장자 매칭 중 하나라도 실패)
 *   <li>{@link #STORAGE_FAILURE}: 서버 측 IO 실패 또는 DB 가 보관한 URL 의 무결성 위반 등 사용자 책임이 아닌 모든 오류
 *   <li>{@link #PAYLOAD_TOO_LARGE}: multipart 한도 초과 — Spring 의 {@code
 *       MaxUploadSizeExceededException} 을 본 코드로 변환하거나, 각 스토리지 구현체가 자체 한도(이미지 10MB / 영상 100MB) 를 코드
 *       단에서 강제할 때 사용한다.
 *   <li>{@link #INVALID_VIDEO}: 사용자가 보낸 파일이 영상 검증을 통과하지 못함 (Content-Type / magic-bytes / 확장자
 *       allowlist / 포맷-확장자 매칭 중 하나라도 실패)
 * </ul>
 */
@Getter
@RequiredArgsConstructor
public enum StorageErrorCode implements ErrorCode {
    INVALID_IMAGE(HttpStatus.BAD_REQUEST, "S-001", "유효한 이미지 파일이 아닙니다."),
    STORAGE_FAILURE(HttpStatus.INTERNAL_SERVER_ERROR, "S-002", "미디어 처리 중 오류가 발생했습니다."),
    PAYLOAD_TOO_LARGE(HttpStatus.PAYLOAD_TOO_LARGE, "S-003", "파일 크기가 한도를 초과했습니다."),
    INVALID_VIDEO(HttpStatus.BAD_REQUEST, "S-004", "유효한 영상 파일이 아닙니다.");

    private final HttpStatus status;
    private final String code;
    private final String message;
}
