package com.comong.backend.domain.dialogue.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.comong.backend.domain.dialogue.config.AiDialogueProperties;
import com.comong.backend.domain.dialogue.entity.DialogueTurn;
import com.comong.backend.domain.dialogue.entity.NpcName;

import tools.jackson.databind.ObjectMapper;

class AiDialogueClientTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    @DisplayName("base-url is empty: embed call is skipped")
    void skipsWhenBaseUrlEmpty() {
        AiDialogueClient client =
                new AiDialogueClient(new AiDialogueProperties("", 5), objectMapper);

        client.embedSessionAsync(7L, 42L, NpcName.YEONGCHEOL, List.of(mock(DialogueTurn.class)));
    }

    @Test
    @DisplayName("base-url is empty: emotion-summary call is skipped")
    void skipsEmotionSummaryWhenBaseUrlEmpty() {
        AiDialogueClient client =
                new AiDialogueClient(new AiDialogueProperties("", 5), objectMapper);

        Optional<AiDialogueClient.EmotionSummaryResult> result =
                client.summarizeEmotion(
                        7L, 42L, NpcName.YEONGCHEOL, List.of(mock(DialogueTurn.class)));

        assertThat(result).isEmpty();
    }

    @Test
    @DisplayName("empty turns: embed call is skipped")
    void skipsWhenTurnsEmpty() {
        AiDialogueClient client =
                new AiDialogueClient(
                        new AiDialogueProperties("http://ai-test:8001/api/v1", 5), objectMapper);

        client.embedSessionAsync(7L, 42L, NpcName.YEONGCHEOL, List.of());
    }

    @Test
    @DisplayName("null turns: embed call is skipped")
    void skipsWhenTurnsNull() {
        AiDialogueClient client =
                new AiDialogueClient(
                        new AiDialogueProperties("http://ai-test:8001/api/v1", 5), objectMapper);

        client.embedSessionAsync(7L, 7L, NpcName.JOEUN, null);
    }

    @Test
    @DisplayName("empty turns: emotion-summary call is skipped")
    void skipsEmotionSummaryWhenTurnsEmpty() {
        AiDialogueClient client =
                new AiDialogueClient(
                        new AiDialogueProperties("http://ai-test:8001/api/v1", 5), objectMapper);

        Optional<AiDialogueClient.EmotionSummaryResult> result =
                client.summarizeEmotion(7L, 42L, NpcName.YEONGCHEOL, List.of());

        assertThat(result).isEmpty();
    }
}
