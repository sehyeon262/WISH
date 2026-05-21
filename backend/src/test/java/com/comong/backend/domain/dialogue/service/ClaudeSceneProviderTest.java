package com.comong.backend.domain.dialogue.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.comong.backend.domain.dialogue.dto.SceneResponse;
import com.comong.backend.domain.dialogue.entity.DialogueSession;
import com.comong.backend.domain.dialogue.entity.DialogueTurn;
import com.comong.backend.domain.dialogue.entity.DialogueTurnGeneratedBy;
import com.comong.backend.domain.dialogue.service.ClaudeClient.ClaudeChoice;
import com.comong.backend.domain.dialogue.service.ClaudeClient.ClaudeSceneResult;

/**
 * {@link ClaudeSceneProvider} 단위 테스트. {@link ClaudeClient} 를 모킹해 비즈니스 검증 로직을 격리 검증.
 *
 * <p>HTTP 호출이나 GMS 응답 파싱은 본 테스트 범위 밖.
 */
class ClaudeSceneProviderTest {

    private ClaudeClient claudeClient;
    private ClaudeSceneProvider provider;
    private DialogueSession session;

    @BeforeEach
    void setUp() {
        claudeClient = mock(ClaudeClient.class);
        provider = new ClaudeSceneProvider(claudeClient);
        session = mock(DialogueSession.class);
        when(session.getId()).thenReturn(42L);
    }

    @Test
    @DisplayName("정상 응답 → CLAUDE 출처의 SceneResponse 변환 (npcResponse 포함)")
    void happyPath_returnsClaudeSceneResponse() {
        ClaudeSceneResult raw =
                new ClaudeSceneResult(
                        "무엇이 가장 걱정되니?",
                        List.of(
                                new ClaudeChoice("talk_body", "몸 얘기"),
                                new ClaudeChoice("talk_peer", "친구 얘기")),
                        false,
                        List.of("걱정이 찾아왔구나."));
        when(claudeClient.generateNextScene(anyString(), anyString())).thenReturn(Optional.of(raw));

        Optional<SceneResponse> result = provider.nextScene(session, List.of(turn("entry_talk")));

        assertThat(result).isPresent();
        SceneResponse scene = result.get();
        assertThat(scene.questionText()).isEqualTo("무엇이 가장 걱정되니?");
        assertThat(scene.choices()).hasSize(2);
        assertThat(scene.choices().get(0).choiceIntentId()).isEqualTo("talk_body");
        assertThat(scene.secondaryAction()).isNull();
        assertThat(scene.shouldEndSession()).isFalse();
        assertThat(scene.generatedBy()).isEqualTo(DialogueTurnGeneratedBy.CLAUDE);
        assertThat(scene.npcResponse()).containsExactly("걱정이 찾아왔구나.");
    }

    @Test
    @DisplayName("ClaudeClient 가 empty 반환 시 (키 미설정 / HTTP 실패) → empty")
    void claudeClientEmpty_returnsEmpty() {
        when(claudeClient.generateNextScene(anyString(), anyString())).thenReturn(Optional.empty());

        Optional<SceneResponse> result = provider.nextScene(session, List.of());

        assertThat(result).isEmpty();
    }

    @Test
    @DisplayName("questionText 가 30자 초과 → empty")
    void questionTextTooLong_returnsEmpty() {
        String longQ = "가".repeat(31);
        ClaudeSceneResult raw =
                new ClaudeSceneResult(
                        longQ,
                        List.of(new ClaudeChoice("worry_pain", "아픈 게 걱정돼요")),
                        false,
                        List.of("걱정이 찾아왔구나."));
        when(claudeClient.generateNextScene(anyString(), anyString())).thenReturn(Optional.of(raw));

        assertThat(provider.nextScene(session, List.of(turn("mood_worried")))).isEmpty();
    }

    @Test
    @DisplayName("questionText 에 금지어(우울증) 포함 → empty")
    void questionTextWithForbiddenTerm_returnsEmpty() {
        ClaudeSceneResult raw =
                new ClaudeSceneResult(
                        "오늘 우울증 상태야?",
                        List.of(new ClaudeChoice("worry_pain", "아픈 게 걱정돼요")),
                        false,
                        List.of("걱정이 찾아왔구나."));
        when(claudeClient.generateNextScene(anyString(), anyString())).thenReturn(Optional.of(raw));

        assertThat(provider.nextScene(session, List.of(turn("mood_worried")))).isEmpty();
    }

    @Test
    @DisplayName("종료 신호 아닌데 choices 가 비어있음 → empty (PDF: 1~3개)")
    void emptyChoicesNonTerminal_returnsEmpty() {
        ClaudeSceneResult raw =
                new ClaudeSceneResult("괜찮니?", List.of(), false, List.of("걱정이 찾아왔구나."));
        when(claudeClient.generateNextScene(anyString(), anyString())).thenReturn(Optional.of(raw));

        assertThat(provider.nextScene(session, List.of(turn("mood_worried")))).isEmpty();
    }

    @Test
    @DisplayName("choices 가 4개 이상 → empty (PDF: 1~3개)")
    void tooManyChoices_returnsEmpty() {
        ClaudeSceneResult raw =
                new ClaudeSceneResult(
                        "괜찮니?",
                        List.of(
                                new ClaudeChoice("worry_pain", "아픈 게 걱정돼요"),
                                new ClaudeChoice("worry_unknown", "잘 모르겠어요"),
                                new ClaudeChoice("worry_family", "가족이 걱정돼요"),
                                new ClaudeChoice("hard_body", "몸이 힘들어요")),
                        false,
                        List.of("걱정이 찾아왔구나."));
        when(claudeClient.generateNextScene(anyString(), anyString())).thenReturn(Optional.of(raw));

        assertThat(provider.nextScene(session, List.of(turn("mood_worried")))).isEmpty();
    }

    @Test
    @DisplayName("choice text 가 18자 초과 → empty")
    void choiceTextTooLong_returnsEmpty() {
        String longText = "긴".repeat(19);
        ClaudeSceneResult raw =
                new ClaudeSceneResult(
                        "괜찮니?",
                        List.of(new ClaudeChoice("worry_pain", longText)),
                        false,
                        List.of("걱정이 찾아왔구나."));
        when(claudeClient.generateNextScene(anyString(), anyString())).thenReturn(Optional.of(raw));

        assertThat(provider.nextScene(session, List.of(turn("mood_worried")))).isEmpty();
    }

    @Test
    @DisplayName("choice text 에 금지어(진단) 포함 → empty")
    void choiceTextWithForbiddenTerm_returnsEmpty() {
        ClaudeSceneResult raw =
                new ClaudeSceneResult(
                        "괜찮니?",
                        List.of(new ClaudeChoice("worry_pain", "진단 받았어요")),
                        false,
                        List.of("걱정이 찾아왔구나."));
        when(claudeClient.generateNextScene(anyString(), anyString())).thenReturn(Optional.of(raw));

        assertThat(provider.nextScene(session, List.of(turn("mood_worried")))).isEmpty();
    }

    @Test
    @DisplayName("rest_today 가 choices 에 등장 → empty (PDF: 후속 질문에서 금지)")
    void restTodayInChoices_returnsEmpty() {
        ClaudeSceneResult raw =
                new ClaudeSceneResult(
                        "괜찮니?",
                        List.of(
                                new ClaudeChoice("worry_pain", "아픈 게 걱정돼요"),
                                new ClaudeChoice("rest_today", "오늘은 쉬고 싶어요")),
                        false,
                        List.of("걱정이 찾아왔구나."));
        when(claudeClient.generateNextScene(anyString(), anyString())).thenReturn(Optional.of(raw));

        assertThat(provider.nextScene(session, List.of(turn("mood_worried")))).isEmpty();
    }

    // ===== 새 검증: 화이트리스트 / 전이규칙 / npcResponse =====

    @Test
    @DisplayName("화이트리스트 밖 choiceIntentId → empty (예: kill_myself)")
    void choiceIntentIdNotInWhitelist_returnsEmpty() {
        ClaudeSceneResult raw =
                new ClaudeSceneResult(
                        "괜찮니?",
                        List.of(new ClaudeChoice("kill_myself", "스스로 해치고 싶어요")),
                        false,
                        List.of("걱정이 찾아왔구나."));
        when(claudeClient.generateNextScene(anyString(), anyString())).thenReturn(Optional.of(raw));

        assertThat(provider.nextScene(session, List.of(turn("mood_worried")))).isEmpty();
    }

    @Test
    @DisplayName("전이규칙 위반 — mood_worried 직후 hard_body 같은 다른 갈래 ID → empty")
    void transitionRuleViolation_returnsEmpty() {
        // hard_body 는 화이트리스트 안이지만 mood_worried 후 흐름엔 해당 안 됨 (worry_* 만 허용)
        ClaudeSceneResult raw =
                new ClaudeSceneResult(
                        "지금 가장 힘든 건?",
                        List.of(new ClaudeChoice("hard_body", "몸이 힘들어요")),
                        false,
                        List.of("걱정이 찾아왔구나."));
        when(claudeClient.generateNextScene(anyString(), anyString())).thenReturn(Optional.of(raw));

        assertThat(provider.nextScene(session, List.of(turn("mood_worried")))).isEmpty();
    }

    @Test
    @DisplayName("종료 직전 선택(action_breathe) 후 Claude 가 추가 선택지 만들면 → empty (BE 가 종료해야)")
    void claudeProducesChoicesAfterTerminalChoice_returnsEmpty() {
        // action_breathe 는 종료 직전. allowedNext 가 빈 set 이라 어떤 choice 도 안 통과.
        ClaudeSceneResult raw =
                new ClaudeSceneResult(
                        "더 해볼래?",
                        List.of(new ClaudeChoice("support_medical", "선생님께 말할래요")),
                        false,
                        List.of("좋구나."));
        when(claudeClient.generateNextScene(anyString(), anyString())).thenReturn(Optional.of(raw));

        assertThat(provider.nextScene(session, List.of(turn("action_breathe")))).isEmpty();
    }

    @Test
    @DisplayName("종료 신호(shouldEndSession=true)인데 choices 가 채워져 있음 → empty (모순)")
    void shouldEndSessionTrueWithChoices_returnsEmpty() {
        ClaudeSceneResult raw =
                new ClaudeSceneResult(
                        "",
                        List.of(new ClaudeChoice("worry_pain", "아픈 게 걱정돼요")),
                        true,
                        List.of("좋구나."));
        when(claudeClient.generateNextScene(anyString(), anyString())).thenReturn(Optional.of(raw));

        assertThat(provider.nextScene(session, List.of(turn("mood_worried")))).isEmpty();
    }

    @Test
    @DisplayName("종료 신호 + 빈 choices + 정상 npcResponse → 통과 (정상 종료)")
    void shouldEndSessionTrueWithEmptyChoices_passes() {
        ClaudeSceneResult raw =
                new ClaudeSceneResult("", List.of(), true, List.of("선생님께 말해도 된단다."));
        when(claudeClient.generateNextScene(anyString(), anyString())).thenReturn(Optional.of(raw));

        Optional<SceneResponse> result =
                provider.nextScene(session, List.of(turn("support_medical")));
        assertThat(result).isPresent();
        assertThat(result.get().shouldEndSession()).isTrue();
        assertThat(result.get().choices()).isEmpty();
    }

    @Test
    @DisplayName("npcResponse 비어있음 → empty (필수)")
    void emptyNpcResponse_returnsEmpty() {
        ClaudeSceneResult raw =
                new ClaudeSceneResult(
                        "괜찮니?",
                        List.of(new ClaudeChoice("worry_pain", "아픈 게 걱정돼요")),
                        false,
                        List.of());
        when(claudeClient.generateNextScene(anyString(), anyString())).thenReturn(Optional.of(raw));

        assertThat(provider.nextScene(session, List.of(turn("mood_worried")))).isEmpty();
    }

    @Test
    @DisplayName("npcResponse 한 줄이 40자 초과 → empty")
    void npcResponseTooLong_returnsEmpty() {
        String longLine = "긴".repeat(41);
        ClaudeSceneResult raw =
                new ClaudeSceneResult(
                        "괜찮니?",
                        List.of(new ClaudeChoice("worry_pain", "아픈 게 걱정돼요")),
                        false,
                        List.of(longLine));
        when(claudeClient.generateNextScene(anyString(), anyString())).thenReturn(Optional.of(raw));

        assertThat(provider.nextScene(session, List.of(turn("mood_worried")))).isEmpty();
    }

    @Test
    @DisplayName("새로 추가된 금지어(참아야 해) 가 npcResponse 에 등장 → empty")
    void npcResponseWithNewForbiddenTerm_paranya_returnsEmpty() {
        ClaudeSceneResult raw =
                new ClaudeSceneResult(
                        "괜찮니?",
                        List.of(new ClaudeChoice("worry_pain", "아픈 게 걱정돼요")),
                        false,
                        List.of("참아야 해. 곧 괜찮아질 거야."));
        when(claudeClient.generateNextScene(anyString(), anyString())).thenReturn(Optional.of(raw));

        assertThat(provider.nextScene(session, List.of(turn("mood_worried")))).isEmpty();
    }

    @Test
    @DisplayName("새로 추가된 금지어(긍정적으로 생각) 가 questionText 에 등장 → empty")
    void questionTextWithNewForbiddenTerm_positive_returnsEmpty() {
        ClaudeSceneResult raw =
                new ClaudeSceneResult(
                        "긍정적으로 생각해볼래?",
                        List.of(new ClaudeChoice("worry_pain", "아픈 게 걱정돼요")),
                        false,
                        List.of("좋아."));
        when(claudeClient.generateNextScene(anyString(), anyString())).thenReturn(Optional.of(raw));

        assertThat(provider.nextScene(session, List.of(turn("mood_worried")))).isEmpty();
    }

    @Test
    @DisplayName("npcResponse 에 금지어(우울) 포함 → empty")
    void npcResponseWithForbiddenTerm_returnsEmpty() {
        ClaudeSceneResult raw =
                new ClaudeSceneResult(
                        "괜찮니?",
                        List.of(new ClaudeChoice("worry_pain", "아픈 게 걱정돼요")),
                        false,
                        List.of("우울한 마음이 있구나."));
        when(claudeClient.generateNextScene(anyString(), anyString())).thenReturn(Optional.of(raw));

        assertThat(provider.nextScene(session, List.of(turn("mood_worried")))).isEmpty();
    }

    @Test
    @DisplayName("ClaudeSceneProvider 호출 자체가 일어나는지 (verify)")
    void emptyTurns_stillCallsClaude() {
        ClaudeSceneResult raw =
                new ClaudeSceneResult(
                        "오늘 기분은 어떠니?",
                        List.of(
                                new ClaudeChoice("rest_quiet", "조용히 있을래요"),
                                new ClaudeChoice("activity_music", "음악 들을래요")),
                        false,
                        List.of("좋구나."));
        when(claudeClient.generateNextScene(anyString(), anyString())).thenReturn(Optional.of(raw));

        // turns 비어있을 때 prevChoiceIntentId=null → ALLOWED_INTENTS 전체 허용
        Optional<SceneResponse> result = provider.nextScene(session, List.of());

        assertThat(result).isPresent();
        verify(claudeClient, times(1)).generateNextScene(anyString(), anyString());
    }

    // ===== helper =====

    private DialogueTurn turn(String choiceIntentId) {
        DialogueTurn t = mock(DialogueTurn.class);
        when(t.getQuestionText()).thenReturn("...");
        when(t.getChoiceText()).thenReturn("...");
        when(t.getChoiceIntentId()).thenReturn(choiceIntentId);
        return t;
    }
}
