package com.comong.backend.domain.music.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * YouTube Data API v3 프록시 설정 ({@code youtube.*}).
 *
 * <p>{@link #apiKey()} 가 비어있으면 검색이 비활성화된다 (서비스가 비어있는 결과를 반환). 로컬/테스트 환경에서 키 없이도 부팅이 가능하도록 하기 위함.
 */
@ConfigurationProperties(prefix = "youtube")
public record YoutubeProperties(String apiKey, String baseUrl, int timeoutSeconds) {

    public boolean isEnabled() {
        return apiKey != null && !apiKey.isBlank();
    }
}
