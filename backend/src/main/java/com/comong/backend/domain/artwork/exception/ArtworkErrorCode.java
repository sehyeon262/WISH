package com.comong.backend.domain.artwork.exception;

import org.springframework.http.HttpStatus;

import com.comong.backend.global.exception.ErrorCode;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

/**
 * Artwork 도메인 에러 코드. 접두사 {@code AR-} 사용 — 신규 도메인 접두사로 팀 합의 후 확정.
 *
 * <p>{@code INVALID_IMAGE} / 업로드 실패 등 스토리지 인프라 관련 코드는 {@link
 * com.comong.backend.global.storage.StorageErrorCode} 참고.
 */
@Getter
@RequiredArgsConstructor
public enum ArtworkErrorCode implements ErrorCode {
    ARTWORK_NOT_FOUND(HttpStatus.NOT_FOUND, "AR-001", "작품을 찾을 수 없습니다."),
    ARTWORK_ACCESS_DENIED(HttpStatus.FORBIDDEN, "AR-002", "작품에 접근할 권한이 없습니다.");

    private final HttpStatus status;
    private final String code;
    private final String message;
}
