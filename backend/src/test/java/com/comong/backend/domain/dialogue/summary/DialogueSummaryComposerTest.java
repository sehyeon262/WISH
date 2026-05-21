package com.comong.backend.domain.dialogue.summary;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.junit.jupiter.api.TestInstance.Lifecycle;
import org.springframework.core.io.DefaultResourceLoader;

import com.comong.backend.domain.dialogue.catalog.DialogueCatalogLoader;
import com.comong.backend.domain.dialogue.catalog.DialogueCatalogService;
import com.comong.backend.domain.dialogue.entity.DialogueSession;
import com.comong.backend.domain.dialogue.entity.DialogueTurn;
import com.comong.backend.domain.dialogue.entity.DialogueTurnGeneratedBy;
import com.comong.backend.domain.dialogue.entity.NpcName;
import com.comong.backend.domain.patient.entity.Gender;
import com.comong.backend.domain.patient.entity.PatientProfile;
import com.comong.backend.domain.user.entity.User;
import com.comong.backend.domain.user.entity.UserRole;

import tools.jackson.databind.ObjectMapper;

@TestInstance(Lifecycle.PER_CLASS)
class DialogueSummaryComposerTest {

    private DialogueSummaryComposer composer;
    private PatientProfile profileStub;

    @BeforeAll
    void setup() {
        DialogueCatalogLoader loader =
                new DialogueCatalogLoader(
                        new DefaultResourceLoader(),
                        new ObjectMapper(),
                        "classpath:dialogue/choice-catalog.json");
        DialogueCatalogService catalogService = new DialogueCatalogService(loader);
        this.composer = new DialogueSummaryComposer(catalogService);

        User user =
                User.builder()
                        .email("p@example.com")
                        .nickname("p")
                        .password("hashed")
                        .role(UserRole.USER)
                        .build();
        this.profileStub =
                PatientProfile.builder()
                        .user(user)
                        .name("아이")
                        .nickname("아이")
                        .birthDate(LocalDate.of(2020, 1, 1))
                        .gender(Gender.MALE)
                        .build();
    }

    @Test
    void emptyTurns_returnsStartedMessage() {
        DialogueSession session = villageSession("monkey_injection_fear");

        String summary = composer.composeSessionSummary(session, List.of());

        assertThat(summary).isEqualTo("오늘 코몽와 대화를 시작했어요.");
    }

    @Test
    void singleEndingTurn_includesKeyChoiceProtectiveAndAdvice() {
        DialogueSession session = villageSession("monkey_injection_fear");
        // mky_inj_say_hold (ASK_ADULT_FIRST) 를 마지막 턴으로 사용
        DialogueTurn turn = villageTurn(session, 0, "mky_inj_say_hold", "「손 잡고 있어줘」라고 할래요");

        String summary = composer.composeSessionSummary(session, List.of(turn));

        assertThat(summary).contains("오늘 코몽와 시술 무서움 이야기를 나눴어요.");
        assertThat(summary).contains("\"「손 잡고 있어줘」라고 할래요\"");
        // turn 의 protective 가 [verbal_expression, support_need_named, family_support_preference]
        // 모두 빈도 1 — 첫 번째 마주친 키 (HashMap 순서) — 어떤 라벨이든 라벨 매핑은 제공돼야 함
        assertThat(summary).contains("모습을 보였어요");
        assertThat(summary).contains("함께 해볼 수 있는 활동: 옆에 있어달라는 마음을 들어주세요.");
    }

    @Test
    void endingTypeAdviceFromCatalog_REST_ONLY() {
        DialogueSession session = villageSession("monkey_injection_fear");
        // mky_inj_just_go → REST_ONLY
        DialogueTurn turn = villageTurn(session, 0, "mky_inj_just_go", "그냥 가서 손 잡을래요");

        String summary = composer.composeSessionSummary(session, List.of(turn));

        assertThat(summary).contains("함께 해볼 수 있는 활동: 잠시 옆에 함께 머물러주세요.");
    }

    @Test
    void multipleTurns_picksKeyChoiceWithMostProtective() {
        DialogueSession session = villageSession("monkey_injection_fear");
        // turn1: mky_inj_unsure (보호요인 0)
        // turn2: mky_inj_say_hold (보호요인 3) — 이게 key 가 되어야 함
        DialogueTurn t1 = villageTurn(session, 0, "mky_inj_unsure", "잘 모르겠어요");
        DialogueTurn t2 = villageTurn(session, 1, "mky_inj_say_hold", "「손 잡고 있어줘」라고 할래요");

        String summary = composer.composeSessionSummary(session, List.of(t1, t2));

        assertThat(summary).contains("\"「손 잡고 있어줘」라고 할래요\"");
        // 마지막 turn 의 endingType (ASK_ADULT_FIRST)
        assertThat(summary).contains("옆에 있어달라는 마음을 들어주세요.");
    }

    @Test
    void dailySummary_emptySessionsList() {
        String summary = composer.composeDailySummary(List.of(), Map.of());

        assertThat(summary).isEqualTo("오늘 마을에 들르지 않았어요.");
    }

    @Test
    void dailySummary_singleSession_includesNpcAndTopicAndAdvice() {
        DialogueSession session = villageSession("monkey_injection_fear");
        DialogueTurn turn = villageTurn(session, 0, "mky_inj_say_hold", "「손 잡고 있어줘」라고 할래요");
        DialogueSession spy = withId(session, 1L);

        String summary =
                composer.composeDailySummary(List.of(spy), Map.of(spy.getId(), List.of(turn)));

        assertThat(summary).startsWith("오늘 코몽");
        assertThat(summary).contains("시술 무서움");
        // ASK_ADULT_FIRST advice 가 본문에 박힘
        assertThat(summary).contains("옆에 있어달라는 마음을 들어주세요.");
    }

    @Test
    void dailySummary_multipleSessions_picksHeaviestEndingAdvice() {
        // 두 세션: 하나는 ASK_MEDICAL_FIRST (weight 100), 다른 하나는 REST_ONLY (weight 40)
        // 더 무거운 것 (의료) 의 advice 가 선택돼야 함
        DialogueSession s1 = villageSession("monkey_injection_fear");
        DialogueSession s2 = villageSession("monkey_play");
        DialogueTurn t1 =
                villageTurn(s1, 0, "mky_inj_ask_teacher", "선생님께 물어볼래요"); // ASK_MEDICAL_FIRST
        DialogueTurn t2 = villageTurn(s2, 0, "mky_play_with_me", "옆에 와주세요"); // REST_ONLY

        DialogueSession spy1 = withId(s1, 10L);
        DialogueSession spy2 = withId(s2, 11L);
        Map<Long, List<DialogueTurn>> turnMap =
                Map.of(spy1.getId(), List.of(t1), spy2.getId(), List.of(t2));

        String summary = composer.composeDailySummary(List.of(spy1, spy2), turnMap);

        assertThat(summary).contains("다음 진료 때 함께 짧게 이야기해보세요.");
    }

    @Test
    void resolveRecommendedActivity_singleSession_returnsAdviceFromCatalog() {
        DialogueSession session = villageSession("monkey_injection_fear");
        DialogueTurn turn = villageTurn(session, 0, "mky_inj_say_hold", "「손 잡고 있어줘」라고 할래요");
        DialogueSession spy = withId(session, 1L);

        Optional<String> advice =
                composer.resolveRecommendedActivity(
                        List.of(spy), Map.of(spy.getId(), List.of(turn)));

        assertThat(advice).contains("옆에 있어달라는 마음을 들어주세요.");
    }

    @Test
    void unknownEndingType_fallsBackToNoPressureMessage() {
        // catalog 에 없는 choiceIntentId — endingType resolve 실패 → NO_PRESSURE default
        DialogueSession session = villageSession("monkey_injection_fear");
        DialogueTurn t = villageTurn(session, 0, "ghost_choice_id", "유령 선택지");

        String summary = composer.composeSessionSummary(session, List.of(t));

        assertThat(summary).contains("함께 해볼 수 있는 활동: 오늘은 아이의 속도에 맞춰주세요.");
    }

    // ===== helpers =====

    private DialogueSession villageSession(String scriptId) {
        return DialogueSession.builder()
                .patientProfile(profileStub)
                .npcName(NpcName.SEORIN)
                .scriptId(scriptId)
                .build();
    }

    private DialogueTurn villageTurn(
            DialogueSession session, int stepIndex, String choiceIntentId, String choiceText) {
        // catalog 에서 메타를 가져와서 빌더에 채움 — 무결성 일치
        // 단, 일부 테스트는 의도적으로 catalog 에 없는 ID 를 사용하므로 catalog 가져오지 않고 stub
        return DialogueTurn.builder()
                .session(session)
                .stepIndex(stepIndex)
                .questionText("질문")
                .choiceIntentId(choiceIntentId)
                .choiceText(choiceText)
                .intensity((short) 1)
                .concernFlags(List.of())
                .protectiveFactors(
                        List.of(
                                "verbal_expression",
                                "support_need_named",
                                "family_support_preference"))
                .generatedBy(DialogueTurnGeneratedBy.NPC_SCRIPT)
                .build();
    }

    /**
     * DialogueSession 의 id 는 protected 라 직접 set 불가. 테스트용으로 Mockito 의 spy 를 사용해 getId() 만 override.
     */
    private DialogueSession withId(DialogueSession session, Long id) {
        DialogueSession spy = mock(DialogueSession.class);
        when(spy.getId()).thenReturn(id);
        when(spy.getNpcName()).thenReturn(session.getNpcName());
        when(spy.getScriptId()).thenReturn(session.getScriptId());
        when(spy.getPatientProfile()).thenReturn(session.getPatientProfile());
        when(spy.getStatus()).thenReturn(session.getStatus());
        return spy;
    }
}
