package com.comong.backend.domain.music.config;

import java.time.Duration;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

/**
 * YouTube Data API v3 호출용 RestClient 빈. API 키는 호출 시점에 쿼리 파라미터로 주입한다 (헤더가 아닌 {@code key=...} 표준).
 *
 * <p>JDK HttpClient 기반 sync 호출, ClaudeClientConfig 와 동일한 패턴.
 */
@Configuration
@EnableConfigurationProperties(YoutubeProperties.class)
public class YoutubeClientConfig {

    @Bean("youtubeRestClient")
    public RestClient youtubeRestClient(YoutubeProperties properties) {
        JdkClientHttpRequestFactory requestFactory = new JdkClientHttpRequestFactory();
        requestFactory.setReadTimeout(Duration.ofSeconds(properties.timeoutSeconds()));
        return RestClient.builder()
                .baseUrl(properties.baseUrl())
                .requestFactory(requestFactory)
                .build();
    }
}
