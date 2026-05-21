package com.comong.backend.domain.realtime.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import com.comong.backend.domain.realtime.exception.RealtimeErrorCode;
import com.comong.backend.global.exception.BusinessException;

/**
 * LiveKit Cloud 연결 설정 ({@code livekit.*}).
 *
 * <p>로컬/테스트 부팅 편의를 위해 애플리케이션 시작 시점에는 강제 실패시키지 않고, 토큰 발급 유스케이스 진입 시 명확한 비즈니스 에러로 검증한다.
 */
@ConfigurationProperties(prefix = "livekit")
public record LiveKitProperties(String url, String apiKey, String apiSecret) {

    private static final String PLACEHOLDER_PREFIX = "change-me";

    public void validateConfigured() {
        if (isBlank(url) || isBlank(apiKey) || isBlank(apiSecret)) {
            throw new BusinessException(RealtimeErrorCode.LIVEKIT_NOT_CONFIGURED);
        }
        if (isPlaceholder(url) || isPlaceholder(apiKey) || isPlaceholder(apiSecret)) {
            throw new BusinessException(RealtimeErrorCode.LIVEKIT_NOT_CONFIGURED);
        }
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private static boolean isPlaceholder(String value) {
        return value.contains(PLACEHOLDER_PREFIX);
    }
}
