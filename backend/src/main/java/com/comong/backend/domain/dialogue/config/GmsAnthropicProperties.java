package com.comong.backend.domain.dialogue.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * GMS Anthropic Claude 설정 ({@code gms.anthropic.*}).
 *
 * <p>{@link #apiKey()} 가 비어있으면 Claude 호출을 비활성화한다 (FallbackSceneProvider 로 100% 처리). 로컬/테스트 환경에서 키
 * 없이도 컨텍스트가 부팅되도록 하기 위함.
 */
@ConfigurationProperties(prefix = "gms.anthropic")
public record GmsAnthropicProperties(
        String apiKey, String baseUrl, String model, String version, int timeoutSeconds) {

    /** 키가 설정되어 있어야 Claude 호출 시도. 미설정이면 항상 fallback. */
    public boolean isEnabled() {
        return apiKey != null && !apiKey.isBlank();
    }
}
