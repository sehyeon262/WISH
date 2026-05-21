package com.comong.backend.domain.dialogue.config;

import java.time.Duration;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

/**
 * GMS Anthropic Claude 호출용 RestClient 빈. timeout / 기본 헤더(Content-Type)를 셋업하고 GMS_KEY 헤더는 호출 시점에 동적
 * 주입한다 (configuration 단계에서 박지 않음 — 키 회전 시 재시작 비용 회피).
 *
 * <p>JDK HttpClient 기반 ({@link JdkClientHttpRequestFactory}) 으로 외부 의존성 없이 sync 호출.
 */
@Configuration
@EnableConfigurationProperties(GmsAnthropicProperties.class)
public class ClaudeClientConfig {

    @Bean("gmsClaudeRestClient")
    public RestClient gmsClaudeRestClient(GmsAnthropicProperties properties) {
        JdkClientHttpRequestFactory requestFactory = new JdkClientHttpRequestFactory();
        // ConnectTimeout 은 JDK HttpClient.Builder 에서 결정되므로 ReadTimeout 만 적용 (Spring 의 abstraction).
        requestFactory.setReadTimeout(Duration.ofSeconds(properties.timeoutSeconds()));
        return RestClient.builder()
                .baseUrl(properties.baseUrl())
                .defaultHeader("Content-Type", MediaType.APPLICATION_JSON_VALUE)
                .defaultHeader("anthropic-version", properties.version())
                .requestFactory(requestFactory)
                .build();
    }
}
