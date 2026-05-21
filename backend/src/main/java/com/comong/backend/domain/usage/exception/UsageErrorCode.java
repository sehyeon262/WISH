package com.comong.backend.domain.usage.exception;

import org.springframework.http.HttpStatus;

import com.comong.backend.global.exception.ErrorCode;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

/**
 * Usage 도메인 (활동 시간 추적/통계) 에러 코드. 접두사 {@code US-} — 신규 도메인 prefix 로 팀 합의.
 *
 * <p>본 도메인은 두 단계로 채워진다:
 *
 * <ul>
 *   <li>S14P31E103-541: LoginSession (접속 세션 raw)
 *   <li>S14P31E103-542: DailyUsageStat 일별 집계 배치
 *   <li>S14P31E103-543: 통계 조회 API
 * </ul>
 */
@Getter
@RequiredArgsConstructor
public enum UsageErrorCode implements ErrorCode {
    LOGIN_SESSION_NOT_FOUND(HttpStatus.NOT_FOUND, "US-001", "접속 세션을 찾을 수 없습니다.");

    private final HttpStatus status;
    private final String code;
    private final String message;
}
