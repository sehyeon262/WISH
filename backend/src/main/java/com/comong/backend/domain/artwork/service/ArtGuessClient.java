package com.comong.backend.domain.artwork.service;

import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import com.comong.backend.domain.dialogue.config.GmsAnthropicProperties;

import tools.jackson.databind.JsonNode;

/**
 * 그림 퀴즈 판정용 GMS Anthropic(Claude vision) 어댑터.
 *
 * <p>{@link com.comong.backend.domain.dialogue.service.ClaudeClient} 와 같은 게이트웨이/모델/타임아웃을 공유하지만
 * multimodal (image + text) 콘텐츠를 보내고 {@code judge_drawing_guess} tool_use 응답에서 판정만 추출한다.
 *
 * <p>실패 정책: 키 미설정·timeout·schema 위반 모두 {@link Optional#empty()} → 호출자가 fallback 으로 응답. 5xx 일시 장애는
 * 1회 재시도.
 */
@Component
public class ArtGuessClient {

    private static final Logger log = LoggerFactory.getLogger(ArtGuessClient.class);
    private static final String TOOL_NAME = "judge_drawing_guess";
    private static final String TOOL_DESCRIPTION = "아이가 그린 그림을 보고 제시어와 일치하는지 친절하게 판정한다.";
    private static final String SYSTEM_PROMPT =
            """
            너는 아이가 그린 그림을 보고 제시어와 비교해 친절하게 알아맞히는 도우미야.
            아이의 그림은 단순하고 추상적일 수 있으니 너그럽게, 형태·특징이 비슷하면 인정해줘.
            반드시 judge_drawing_guess 도구로만 응답해.
            - isMatch: 제시어처럼 보이면 true, 다르게 보이면 false
            - guess: 그림에서 네가 본 것을 한국어로 한 단어(2~6자)
            - confidence: 0.0~1.0 (얼마나 확신하는지)
            """;

    private final RestClient restClient;
    private final GmsAnthropicProperties properties;

    public ArtGuessClient(
            @Qualifier("gmsClaudeRestClient") RestClient restClient,
            GmsAnthropicProperties properties) {
        this.restClient = restClient;
        this.properties = properties;
    }

    /**
     * 그림 + 제시어를 Claude 에 보내 판정 결과를 받음. 키 미설정/실패 시 empty (호출자가 fallback).
     *
     * @param prompt FE 에서 고른 제시어 (한국어 단어)
     * @param imageBytes PNG 바이트
     * @param mediaType {@code image/png} 등
     */
    public Optional<ArtGuessResult> guess(String prompt, byte[] imageBytes, String mediaType) {
        if (!properties.isEnabled()) {
            log.debug("GMS Claude disabled — fallback 사용");
            return Optional.empty();
        }
        try {
            return Optional.of(callOnce(prompt, imageBytes, mediaType));
        } catch (RuntimeException firstAttemptFailure) {
            log.warn("Claude vision call failed (1회 재시도): {}", firstAttemptFailure.getMessage());
            try {
                return Optional.of(callOnce(prompt, imageBytes, mediaType));
            } catch (RuntimeException retryFailure) {
                log.warn("Claude vision retry 실패: {}", retryFailure.getMessage());
                return Optional.empty();
            }
        }
    }

    private ArtGuessResult callOnce(String prompt, byte[] imageBytes, String mediaType) {
        String base64Image = Base64.getEncoder().encodeToString(imageBytes);
        String userText = "제시어: \"" + prompt + "\"\n위 그림을 보고 제시어가 맞는지 판단해줘.";

        Map<String, Object> imageBlock =
                Map.of(
                        "type",
                        "image",
                        "source",
                        Map.of(
                                "type", "base64",
                                "media_type", mediaType,
                                "data", base64Image));
        Map<String, Object> textBlock = Map.of("type", "text", "text", userText);

        Map<String, Object> requestBody =
                Map.of(
                        "model", properties.model(),
                        "max_tokens", 512,
                        "system", SYSTEM_PROMPT,
                        "messages",
                                List.of(
                                        Map.of(
                                                "role",
                                                "user",
                                                "content",
                                                List.of(imageBlock, textBlock))),
                        "tools", List.of(toolDefinition()),
                        "tool_choice", Map.of("type", "tool", "name", TOOL_NAME));

        JsonNode response =
                restClient
                        .post()
                        .uri("/messages")
                        .header("x-api-key", properties.apiKey())
                        .body(requestBody)
                        .retrieve()
                        .body(JsonNode.class);
        return extractToolResult(response);
    }

    private Map<String, Object> toolDefinition() {
        return Map.of(
                "name", TOOL_NAME,
                "description", TOOL_DESCRIPTION,
                "input_schema",
                        Map.of(
                                "type", "object",
                                "properties",
                                        Map.of(
                                                "isMatch", Map.of("type", "boolean"),
                                                "guess", Map.of("type", "string", "maxLength", 20),
                                                "confidence",
                                                        Map.of(
                                                                "type", "number",
                                                                "minimum", 0,
                                                                "maximum", 1)),
                                "required", List.of("isMatch", "guess", "confidence")));
    }

    private ArtGuessResult extractToolResult(JsonNode response) {
        if (response == null || !response.has("content")) {
            throw new IllegalStateException("Claude response missing content");
        }
        JsonNode content = response.get("content");
        for (JsonNode item : content) {
            if (item.has("type")
                    && "tool_use".equals(item.get("type").asString(""))
                    && item.has("input")) {
                return parseInput(item.get("input"));
            }
        }
        throw new IllegalStateException("Claude response missing tool_use block");
    }

    private ArtGuessResult parseInput(JsonNode input) {
        if (!input.has("isMatch") || !input.has("guess") || !input.has("confidence")) {
            throw new IllegalStateException("Claude tool_use input missing required fields");
        }
        boolean isMatch = input.get("isMatch").asBoolean();
        String guess = input.get("guess").asString("");
        double confidence = input.get("confidence").asDouble();
        return new ArtGuessResult(isMatch, guess, confidence);
    }

    /** Claude tool_use input — 판정 raw 결과. */
    public record ArtGuessResult(boolean isMatch, String guess, double confidence) {}
}
