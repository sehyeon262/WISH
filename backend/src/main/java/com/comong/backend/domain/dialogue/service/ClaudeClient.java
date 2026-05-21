package com.comong.backend.domain.dialogue.service;

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
 * GMS Anthropic Messages API 호출 어댑터. Claude 의 {@code tool_use} 응답에서 다음 장면 input 만 추출해 반환한다.
 *
 * <p>실패 정책: 5초 timeout / 4xx / 5xx / schema 위반 / tool_use 누락 등 모든 예외 케이스에서 {@link Optional#empty()}
 * 를 반환한다 (호출자는 fallback 으로 위임). 5xx / IO 예외는 1회 재시도.
 *
 * <p>보안: GMS_KEY 는 호출 시점에만 헤더로 주입하며 절대 로깅하지 않는다. raw prompt / response 본문도 저장하지 않는다 (설계 결정).
 */
@Component
public class ClaudeClient {

    private static final Logger log = LoggerFactory.getLogger(ClaudeClient.class);
    private static final String TOOL_NAME = "next_dialogue_scene";
    private static final String TOOL_DESCRIPTION =
            "등대지기 영철의 다음 짧은 질문과 선택지를 생성한다. choices 는 1~3개, secondaryAction 은 만들지 않는다.";

    private final RestClient restClient;
    private final GmsAnthropicProperties properties;

    public ClaudeClient(
            @Qualifier("gmsClaudeRestClient") RestClient restClient,
            GmsAnthropicProperties properties) {
        this.restClient = restClient;
        this.properties = properties;
    }

    /**
     * Claude 에 다음 장면 생성을 요청. 키 미설정이면 즉시 empty (호출자가 fallback). 호출 실패는 1회 재시도 후 empty.
     *
     * @return tool_use 의 input ({@code questionText}, {@code choices}, {@code shouldEndSession})
     */
    public Optional<ClaudeSceneResult> generateNextScene(String systemPrompt, String userMessage) {
        if (!properties.isEnabled()) {
            log.debug("GMS Claude disabled (no api-key) — caller will use fallback");
            return Optional.empty();
        }
        try {
            return Optional.of(callOnce(systemPrompt, userMessage));
        } catch (RuntimeException firstAttemptFailure) {
            log.warn("Claude call failed (will retry once): {}", firstAttemptFailure.getMessage());
            try {
                return Optional.of(callOnce(systemPrompt, userMessage));
            } catch (RuntimeException retryFailure) {
                log.warn("Claude call failed after retry: {}", retryFailure.getMessage());
                return Optional.empty();
            }
        }
    }

    private ClaudeSceneResult callOnce(String systemPrompt, String userMessage) {
        Map<String, Object> requestBody =
                Map.of(
                        "model", properties.model(),
                        "max_tokens", 1024,
                        "system", systemPrompt,
                        "messages", List.of(Map.of("role", "user", "content", userMessage)),
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
                                                "questionText",
                                                        Map.of("type", "string", "maxLength", 30),
                                                "choices",
                                                        Map.of(
                                                                "type",
                                                                "array",
                                                                "minItems",
                                                                0,
                                                                "maxItems",
                                                                3,
                                                                "items",
                                                                Map.of(
                                                                        "type", "object",
                                                                        "properties",
                                                                                Map.of(
                                                                                        "choiceIntentId",
                                                                                                Map
                                                                                                        .of(
                                                                                                                "type",
                                                                                                                "string"),
                                                                                        "text",
                                                                                                Map
                                                                                                        .of(
                                                                                                                "type",
                                                                                                                "string",
                                                                                                                "maxLength",
                                                                                                                18)),
                                                                        "required",
                                                                                List.of(
                                                                                        "choiceIntentId",
                                                                                        "text"))),
                                                "shouldEndSession", Map.of("type", "boolean"),
                                                "npcResponse",
                                                        Map.of(
                                                                "type",
                                                                "array",
                                                                "minItems",
                                                                1,
                                                                "maxItems",
                                                                2,
                                                                "items",
                                                                Map.of(
                                                                        "type",
                                                                        "string",
                                                                        "maxLength",
                                                                        40))),
                                "required",
                                        List.of(
                                                "questionText",
                                                "choices",
                                                "shouldEndSession",
                                                "npcResponse")));
    }

    private ClaudeSceneResult extractToolResult(JsonNode response) {
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

    private ClaudeSceneResult parseInput(JsonNode input) {
        String questionText = textOrThrow(input, "questionText");
        boolean shouldEnd =
                input.has("shouldEndSession") && input.get("shouldEndSession").asBoolean();
        List<ClaudeChoice> choices = parseChoices(input.get("choices"));
        List<String> npcResponse = parseNpcResponse(input.get("npcResponse"));
        return new ClaudeSceneResult(questionText, choices, shouldEnd, npcResponse);
    }

    private List<ClaudeChoice> parseChoices(JsonNode choicesNode) {
        if (choicesNode == null || !choicesNode.isArray()) {
            throw new IllegalStateException("Claude tool_use missing choices array");
        }
        return choicesNode
                .valueStream()
                .map(
                        choice ->
                                new ClaudeChoice(
                                        textOrThrow(choice, "choiceIntentId"),
                                        textOrThrow(choice, "text")))
                .toList();
    }

    private List<String> parseNpcResponse(JsonNode npcResponseNode) {
        if (npcResponseNode == null || !npcResponseNode.isArray()) {
            throw new IllegalStateException("Claude tool_use missing npcResponse array");
        }
        return npcResponseNode.valueStream().map(line -> line.asString("")).toList();
    }

    private static String textOrThrow(JsonNode node, String field) {
        JsonNode value = node.get(field);
        if (value == null || value.isNull()) {
            throw new IllegalStateException("Claude tool_use missing field: " + field);
        }
        return value.asString("");
    }

    /** Claude tool_use 응답의 input — 의미 검증 전 raw 데이터. */
    public record ClaudeSceneResult(
            String questionText,
            List<ClaudeChoice> choices,
            boolean shouldEndSession,
            List<String> npcResponse) {}

    public record ClaudeChoice(String choiceIntentId, String text) {}
}
