package com.comong.backend.domain.report.config;

import java.time.Duration;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

/**
 * 주간 리포트 AI 요약용 RestClient 빈. {@link AiReportSummaryProperties#baseUrl()} 가 비어있어도 항상 빈은 생성한다 — 호출
 * 시점에 {@link AiReportSummaryProperties#isEnabled()} 로 분기.
 *
 * <p>임베딩(fire-and-forget) 과 달리 보호자 GET 응답을 동기 대기하므로 timeout 을 30~35초 정도로 잡는다. AiDialogueRestClient
 * 와는 별도 빈으로 운영해서 timeout 만 따로 조정 가능.
 */
@Configuration
@EnableConfigurationProperties(AiReportSummaryProperties.class)
public class AiReportSummaryClientConfig {

    @Bean("aiReportSummaryRestClient")
    public RestClient aiReportSummaryRestClient(AiReportSummaryProperties properties) {
        JdkClientHttpRequestFactory requestFactory = new JdkClientHttpRequestFactory();
        requestFactory.setReadTimeout(Duration.ofSeconds(properties.timeoutSeconds()));
        return RestClient.builder()
                .baseUrl(properties.isEnabled() ? properties.baseUrl() : "http://localhost:0")
                .defaultHeader("Content-Type", MediaType.APPLICATION_JSON_VALUE)
                .defaultHeader("Accept", MediaType.APPLICATION_JSON_VALUE)
                .requestFactory(requestFactory)
                .build();
    }
}
