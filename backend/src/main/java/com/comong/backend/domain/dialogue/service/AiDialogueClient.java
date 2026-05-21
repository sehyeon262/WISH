package com.comong.backend.domain.dialogue.service;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;

import com.comong.backend.domain.dialogue.catalog.model.ChoiceTone;
import com.comong.backend.domain.dialogue.catalog.model.ChoiceValence;
import com.comong.backend.domain.dialogue.config.AiDialogueProperties;
import com.comong.backend.domain.dialogue.entity.DialogueTurn;
import com.comong.backend.domain.dialogue.entity.NpcName;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

@Component
public class AiDialogueClient {

    private static final Logger log = LoggerFactory.getLogger(AiDialogueClient.class);
    private static final String CODE_VERSION = "v2-http11";

    private final AiDialogueProperties properties;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    public AiDialogueClient(AiDialogueProperties properties, ObjectMapper objectMapper) {
        this.properties = properties;
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1).build();
    }

    @Async("aiDialogueTaskExecutor")
    public void embedSessionAsync(
            long patientProfileId, long sessionId, NpcName npcName, List<DialogueTurn> turns) {
        embedSession(patientProfileId, sessionId, npcName, turns);
    }

    public boolean embedSession(
            long patientProfileId, long sessionId, NpcName npcName, List<DialogueTurn> turns) {
        if (!properties.isEnabled()) {
            log.debug("AI dialogue disabled (no base-url) - skip embed for session={}", sessionId);
            return false;
        }
        if (turns == null || turns.isEmpty()) {
            log.debug("Empty turns - skip embed for session={}", sessionId);
            return false;
        }

        Map<String, Object> body = buildPayload(patientProfileId, sessionId, npcName, turns);

        try {
            Map<String, Object> response = postJson("/dialogue/embed-session", body, sessionId);
            Object success = response.get("success");
            if (Boolean.TRUE.equals(success)) {
                log.info("AI embed-session ok session={} turns={}", sessionId, turns.size());
                return true;
            }
            log.warn(
                    "AI embed-session returned non-success session={} body={}",
                    sessionId,
                    response);
            return false;
        } catch (RuntimeException e) {
            log.warn(
                    "AI embed-session call failed session={} reason={}", sessionId, e.getMessage());
            return false;
        }
    }

    public Optional<EmotionSummaryResult> summarizeEmotion(
            long patientProfileId, long sessionId, NpcName npcName, List<DialogueTurn> turns) {
        if (!properties.isEnabled()) {
            log.debug(
                    "AI dialogue disabled (no base-url) - skip emotion summary for session={}",
                    sessionId);
            return Optional.empty();
        }
        if (turns == null || turns.isEmpty()) {
            log.debug("Empty turns - skip emotion summary for session={}", sessionId);
            return Optional.empty();
        }

        Map<String, Object> body = buildPayload(patientProfileId, sessionId, npcName, turns);

        try {
            Map<String, Object> response = postJson("/dialogue/emotion-summary", body, sessionId);
            Object success = response.get("success");
            if (Boolean.FALSE.equals(success)) {
                log.warn(
                        "AI emotion-summary returned failure session={} body={}",
                        sessionId,
                        response);
                return Optional.empty();
            }
            return parseEmotionSummary(sessionId, response);
        } catch (RuntimeException e) {
            log.warn(
                    "AI emotion-summary call failed session={} reason={}",
                    sessionId,
                    e.getMessage());
            return Optional.empty();
        }
    }

    private static Map<String, Object> buildPayload(
            long patientProfileId, long sessionId, NpcName npcName, List<DialogueTurn> turns) {
        return Map.of(
                "patient_profile_id",
                patientProfileId,
                "session_id",
                sessionId,
                "npc_name",
                npcName.name(),
                "turns",
                turns.stream().map(AiDialogueClient::toTurnPayload).toList());
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> postJson(String path, Map<String, Object> body, long sessionId) {
        byte[] jsonBytes;
        try {
            jsonBytes = objectMapper.writeValueAsBytes(body);
        } catch (JacksonException e) {
            throw new IllegalStateException("AI dialogue payload serialize failed", e);
        }

        URI uri = URI.create(properties.baseUrl().replaceAll("/+$", "") + path);
        log.info(
                "[DialogueAI] POST {} session={} bytes={} preview={}",
                uri,
                sessionId,
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
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("AI dialogue request interrupted", e);
        } catch (IOException e) {
            throw new IllegalStateException("AI dialogue request failed", e);
        }

        int status = response.statusCode();
        byte[] responseBytes = response.body();
        if (responseBytes == null || responseBytes.length == 0) {
            log.warn(
                    "AI dialogue empty response [{}] session={} uri={}",
                    CODE_VERSION,
                    sessionId,
                    uri);
            return Map.of("success", false);
        }
        if (status / 100 != 2) {
            String preview = new String(responseBytes, StandardCharsets.UTF_8);
            if (preview.length() > 300) {
                preview = preview.substring(0, 300);
            }
            log.warn(
                    "AI dialogue HTTP {} [{}] session={} uri={} body={}",
                    status,
                    CODE_VERSION,
                    sessionId,
                    uri,
                    preview);
            return Map.of("success", false);
        }

        try {
            return objectMapper.readValue(responseBytes, Map.class);
        } catch (JacksonException e) {
            throw new IllegalStateException("AI dialogue response parse failed", e);
        }
    }

    private static Map<String, Object> toTurnPayload(DialogueTurn turn) {
        return Map.of(
                "question_text",
                turn.getQuestionText(),
                "choice_text",
                turn.getChoiceText(),
                "npc_response",
                turn.getNpcResponseText() == null ? "" : turn.getNpcResponseText());
    }

    private static Optional<EmotionSummaryResult> parseEmotionSummary(
            long sessionId, Map<String, Object> response) {
        if (response == null) {
            return Optional.empty();
        }
        ChoiceValence valence = parseEnum(ChoiceValence.class, response.get("overall_valence"));
        ChoiceTone tone = parseEnum(ChoiceTone.class, response.get("tone"));
        Short intensity = parseIntensity(response.get("intensity"));
        if (valence == null || tone == null || intensity == null) {
            log.warn("AI emotion-summary invalid schema session={} body={}", sessionId, response);
            return Optional.empty();
        }
        return Optional.of(
                new EmotionSummaryResult(
                        valence,
                        tone,
                        intensity,
                        stringList(response.get("concern_flags")),
                        stringList(response.get("protective_factors")),
                        stringValue(response.get("guardian_message")),
                        Boolean.TRUE.equals(response.get("is_fallback"))));
    }

    private static <E extends Enum<E>> E parseEnum(Class<E> enumType, Object value) {
        if (value == null) {
            return null;
        }
        try {
            return Enum.valueOf(enumType, value.toString().trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    private static Short parseIntensity(Object value) {
        if (value instanceof Number number) {
            int parsed = number.intValue();
            return parsed >= 0 && parsed <= 3 ? (short) parsed : null;
        }
        if (value instanceof String text) {
            try {
                int parsed = Integer.parseInt(text.trim());
                return parsed >= 0 && parsed <= 3 ? (short) parsed : null;
            } catch (NumberFormatException ignored) {
                return null;
            }
        }
        return null;
    }

    private static List<String> stringList(Object value) {
        if (!(value instanceof List<?> list)) {
            return List.of();
        }
        return list.stream().map(AiDialogueClient::stringValue).filter(s -> !s.isBlank()).toList();
    }

    private static String stringValue(Object value) {
        return value == null ? "" : value.toString();
    }

    public record EmotionSummaryResult(
            ChoiceValence overallValence,
            ChoiceTone tone,
            short intensity,
            List<String> concernFlags,
            List<String> protectiveFactors,
            String guardianMessage,
            boolean fallback) {}
}
