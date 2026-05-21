package com.comong.backend.domain.dialogue.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * AI 서버 RAG/임베딩 호출 설정 ({@code ai.dialogue.*}).
 *
 * <p>{@link #baseUrl()} 가 비어있으면 AI 서버 호출을 비활성화한다. 로컬/테스트 환경에서 AI 서버 없이도 컨텍스트가 부팅되도록 하기 위함 ({@link
 * GmsAnthropicProperties} 와 동일 패턴).
 */
@ConfigurationProperties(prefix = "ai.dialogue")
public record AiDialogueProperties(String baseUrl, int timeoutSeconds) {

    public boolean isEnabled() {
        return baseUrl != null && !baseUrl.isBlank();
    }
}
