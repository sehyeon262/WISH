package com.comong.backend.domain.report.service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import com.comong.backend.domain.report.config.AiReportSummaryProperties;
import com.comong.backend.domain.report.dto.WeeklyReportAiSummaryResponse;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

/**
 * AI 서버의 {@code POST /report/summarize} 어댑터. 동기 호출 — 보호자 GET 응답을 대기하기 때문.
 *
 * <p>구현 노트: Spring RestClient + JdkClientHttpRequestFactory 조합으로 호출하면 dev 환경에서 FastAPI 가 body=null
 * 로 받아 422 missing-body 응답을 반환하는 케이스가 재현됨 (Map/String/byte[] 셋 다 동일). 원인을 단정하기 어려워 Spring 추상화 우회하고
 * java.net.http.HttpClient 로 직접 송신한다. 안정화 후 원인 규명되면 다시 Spring 으로 통일 검토.
 *
 * <p>실패(타임아웃/5xx/파싱)는 모두 로깅만 하고 {@link WeeklyReportAiSummaryResponse#fallback} 으로 복구.
 */
@Component
public class AiReportSummaryClient {

    private static final Logger log = LoggerFactory.getLogger(AiReportSummaryClient.class);

    // 버전 마커 — debugReason 에 박혀 dev 에 실제 반영된 코드 버전을 식별.
    private static final String CODE_VERSION = "v7-http11";

    private final AiReportSummaryProperties properties;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    public AiReportSummaryClient(AiReportSummaryProperties properties, ObjectMapper objectMapper) {
        this.properties = properties;
        this.objectMapper = objectMapper;
        // HTTP/2 기본값 사용 시 uvicorn(HTTP/1.1 only) 과 자동 협상에서 body 가 유실되는 케이스가
        // 보고된 적 있어 HTTP/1.1 로 강제.
        this.httpClient = HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1).build();
    }

    public WeeklyReportAiSummaryResponse summarize(Map<String, Object> payload) {
        if (!properties.isEnabled()) {
            log.warn("AI report summary disabled (no base-url) — returning fallback");
            return WeeklyReportAiSummaryResponse.fallback("be:disabled[" + CODE_VERSION + "]");
        }

        byte[] jsonBytes;
        try {
            jsonBytes = objectMapper.writeValueAsBytes(payload);
        } catch (JacksonException e) {
            log.warn("AI report summary payload serialize failed: {}", e.getMessage());
            return WeeklyReportAiSummaryResponse.fallback(
                    "be:serialize-failed[" + CODE_VERSION + "]:" + e.getMessage());
        }

        URI uri = URI.create(properties.baseUrl().replaceAll("/+$", "") + "/report/summarize");
        log.info(
                "[ReportSummary] POST {} bytes={} preview={}",
                uri,
                jsonBytes.length,
                new String(jsonBytes, 0, Math.min(jsonBytes.length, 120), StandardCharsets.UTF_8));

        HttpRequest request =
                HttpRequest.newBuilder()
                        .uri(uri)
                        .timeout(Duration.ofSeconds(properties.timeoutSeconds()))
                        .header("Content-Type", "application/json")
                        .header("Accept", "application/json")
                        .POST(HttpRequest.BodyPublishers.ofByteArray(jsonBytes))
                        .build();

        HttpResponse<byte[]> response;
        try {
            response = httpClient.send(request, HttpResponse.BodyHandlers.ofByteArray());
        } catch (Exception e) {
            log.warn("AI report summary call failed: {}", e.getMessage());
            return WeeklyReportAiSummaryResponse.fallback(
                    "be:call-failed["
                            + CODE_VERSION
                            + "][bytes="
                            + jsonBytes.length
                            + "]:"
                            + e.getClass().getSimpleName()
                            + ":"
                            + e.getMessage());
        }

        int status = response.statusCode();
        byte[] respBytes = response.body();
        if (status / 100 != 2) {
            String preview = new String(respBytes, StandardCharsets.UTF_8);
            if (preview.length() > 300) preview = preview.substring(0, 300);
            String reqPreview =
                    new String(
                            jsonBytes, 0, Math.min(jsonBytes.length, 80), StandardCharsets.UTF_8);
            log.warn("AI report summary HTTP {} uri={} body={}", status, uri, preview);
            return WeeklyReportAiSummaryResponse.fallback(
                    "be:http-"
                            + status
                            + "["
                            + CODE_VERSION
                            + "][uri="
                            + uri
                            + "][bytes="
                            + jsonBytes.length
                            + "][reqHead="
                            + reqPreview
                            + "]:"
                            + preview);
        }

        Map<String, Object> body;
        try {
            body = objectMapper.readValue(respBytes, Map.class);
        } catch (Exception e) {
            log.warn("AI report summary response parse failed: {}", e.getMessage());
            return WeeklyReportAiSummaryResponse.fallback(
                    "be:parse-failed[" + CODE_VERSION + "]:" + e.getMessage());
        }

        return mapToResponse(body);
    }

    private static WeeklyReportAiSummaryResponse mapToResponse(Map<String, Object> body) {
        List<String> summary = toStringList(body.get("summary"));
        List<String> activity = toStringList(body.get("activity_observations"));
        List<String> emotion = toStringList(body.get("emotion_observations"));
        Object connectionRaw = body.get("connection");
        String connection = (connectionRaw instanceof String s && !s.isBlank()) ? s : null;
        Object suggestionRaw = body.get("suggestion");
        String suggestion = suggestionRaw instanceof String s ? s : "";
        boolean isFallback = Boolean.TRUE.equals(body.get("is_fallback"));
        Object debugReasonRaw = body.get("debug_reason");
        String debugReason = debugReasonRaw instanceof String s ? s : null;
        Object debugRawRaw = body.get("debug_raw");
        String debugRaw = debugRawRaw instanceof String s ? s : null;

        if (summary.isEmpty() || suggestion.isBlank()) {
            log.warn("AI report summary missing required fields, using fallback");
            return WeeklyReportAiSummaryResponse.fallback(
                    "be:missing-fields[" + CODE_VERSION + "]");
        }
        return new WeeklyReportAiSummaryResponse(
                summary,
                activity,
                emotion,
                connection,
                suggestion,
                isFallback,
                debugReason,
                debugRaw);
    }

    private static List<String> toStringList(Object value) {
        if (value instanceof List<?> raw) {
            return raw.stream().filter(v -> v instanceof String).map(v -> (String) v).toList();
        }
        return List.of();
    }
}
