package com.comong.backend.domain.dialogue.entity;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import java.util.List;

import jakarta.persistence.EntityManager;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;

import com.comong.backend.domain.dialogue.catalog.model.ChoiceTone;
import com.comong.backend.domain.dialogue.catalog.model.ChoiceValence;
import com.comong.backend.domain.dialogue.catalog.model.SentimentTone;
import com.comong.backend.domain.dialogue.catalog.model.SentimentWord;
import com.comong.backend.domain.dialogue.repository.DialogueSessionRepository;
import com.comong.backend.domain.dialogue.repository.DialogueTurnRepository;
import com.comong.backend.domain.patient.entity.Gender;
import com.comong.backend.domain.patient.entity.PatientProfile;
import com.comong.backend.domain.patient.repository.PatientProfileRepository;
import com.comong.backend.domain.user.entity.User;
import com.comong.backend.domain.user.entity.UserRole;
import com.comong.backend.domain.user.repository.UserRepository;
import com.comong.backend.support.IntegrationTestSupport;

/**
 * {@link DialogueTurn} 의 JSONB 컬럼 ({@code concern_flags}, {@code protective_factors}) 이 Hibernate 6
 * 의 {@code @JdbcTypeCode(SqlTypes.JSON)} 매핑으로 PostgreSQL JSONB 와 정확히 round-trip 되는지 검증한다. flush +
 * clear 로 1차 캐시를 비워 실제 DB 재읽기를 강제한다.
 */
@Transactional
class DialogueTurnJsonbRoundTripTest extends IntegrationTestSupport {

    @Autowired private DialogueTurnRepository dialogueTurnRepository;
    @Autowired private DialogueSessionRepository dialogueSessionRepository;
    @Autowired private PatientProfileRepository patientProfileRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private EntityManager entityManager;

    private DialogueSession session;

    @BeforeEach
    void setUp() {
        User user =
                userRepository.save(
                        User.builder()
                                .email("dialogue-jsonb@example.com")
                                .nickname("dialogue-jsonb")
                                .password("hashed")
                                .role(UserRole.USER)
                                .build());
        PatientProfile profile =
                patientProfileRepository.save(
                        PatientProfile.builder()
                                .user(user)
                                .name("Patient")
                                .nickname("patient")
                                .birthDate(LocalDate.of(2020, 1, 1))
                                .gender(Gender.MALE)
                                .build());
        session =
                dialogueSessionRepository.save(
                        DialogueSession.builder()
                                .patientProfile(profile)
                                .npcName(NpcName.YEONGCHEOL)
                                .build());
    }

    @AfterEach
    void cleanUp() {
        // ON DELETE CASCADE 가 dialogue_sessions/turns 를 정리하지만,
        // 다음 테스트의 격리를 위해 명시적으로 비운다.
        dialogueTurnRepository.deleteAll();
        dialogueSessionRepository.deleteAll();
        patientProfileRepository.deleteAll();
        userRepository.deleteAll();
    }

    @Test
    @DisplayName("다중 원소 JSONB 리스트 round-trip (FE 의 concernFlags/protectiveFactors 일반 케이스)")
    void multiElementListRoundTrip() {
        Long turnId =
                saveTurn(
                        List.of("pain_concern", "procedure_fear"),
                        List.of("can_name_fear", "emotion_named"));

        DialogueTurn loaded = reloadFromDb(turnId);

        assertThat(loaded.getConcernFlags()).containsExactly("pain_concern", "procedure_fear");
        assertThat(loaded.getProtectiveFactors()).containsExactly("can_name_fear", "emotion_named");
    }

    @Test
    @DisplayName("빈 리스트 round-trip — JSONB '[]' 로 저장된 후 빈 List 로 회복")
    void emptyListRoundTrip() {
        Long turnId = saveTurn(List.of(), List.of());

        DialogueTurn loaded = reloadFromDb(turnId);

        assertThat(loaded.getConcernFlags()).isEmpty();
        assertThat(loaded.getProtectiveFactors()).isEmpty();
    }

    @Test
    @DisplayName("단일 원소 round-trip — 단일 element 도 1-element List 로 정확히 회복")
    void singleElementRoundTrip() {
        Long turnId = saveTurn(List.of("loneliness"), List.of("adult_support_plan"));

        DialogueTurn loaded = reloadFromDb(turnId);

        assertThat(loaded.getConcernFlags()).containsExactly("loneliness");
        assertThat(loaded.getProtectiveFactors()).containsExactly("adult_support_plan");
    }

    @Test
    @DisplayName("순서가 다른 두 List 가 동일 입력 순서대로 round-trip — JSONB 배열 순서 보존")
    void preservesInsertionOrder() {
        Long turnId = saveTurn(List.of("c", "a", "b"), List.of("z", "y", "x"));

        DialogueTurn loaded = reloadFromDb(turnId);

        assertThat(loaded.getConcernFlags()).containsExactly("c", "a", "b");
        assertThat(loaded.getProtectiveFactors()).containsExactly("z", "y", "x");
    }

    @Test
    @DisplayName(
            "V31 catalog 메타 — valence/tone enum + topicKeywords/sentimentWords JSONB round-trip")
    void v31CatalogMetadataRoundTrip() {
        Long turnId =
                saveTurnWithCatalogMetadata(
                        ChoiceValence.NEGATIVE,
                        ChoiceTone.WORRIED,
                        List.of("주사", "손잡기"),
                        List.of(
                                new SentimentWord("무서워요", SentimentTone.NEGATIVE),
                                new SentimentWord("든든해요", SentimentTone.POSITIVE)));

        DialogueTurn loaded = reloadFromDb(turnId);

        assertThat(loaded.getValence()).isEqualTo(ChoiceValence.NEGATIVE);
        assertThat(loaded.getTone()).isEqualTo(ChoiceTone.WORRIED);
        assertThat(loaded.getTopicKeywords()).containsExactly("주사", "손잡기");
        assertThat(loaded.getSentimentWords()).hasSize(2);
        assertThat(loaded.getSentimentWords().get(0).phrase()).isEqualTo("무서워요");
        assertThat(loaded.getSentimentWords().get(0).tone()).isEqualTo(SentimentTone.NEGATIVE);
    }

    @Test
    @DisplayName("V31 catalog 메타 — valence/tone null 허용 (legacy turn 호환)")
    void v31CatalogMetadataNullableForLegacy() {
        Long turnId = saveTurn(List.of(), List.of());

        DialogueTurn loaded = reloadFromDb(turnId);

        assertThat(loaded.getValence()).isNull();
        assertThat(loaded.getTone()).isNull();
        // 빈 JSONB 가 빈 List 로 회복
        assertThat(loaded.getTopicKeywords()).isEmpty();
        assertThat(loaded.getSentimentWords()).isEmpty();
    }

    private Long saveTurn(List<String> concernFlags, List<String> protectiveFactors) {
        DialogueTurn turn =
                DialogueTurn.builder()
                        .session(session)
                        .stepIndex(0)
                        .questionText("오늘 기분은 어떠니?")
                        .choiceIntentId("mood_okay")
                        .choiceText("괜찮아요")
                        .intensity((short) 0)
                        .concernFlags(concernFlags)
                        .protectiveFactors(protectiveFactors)
                        .generatedBy(DialogueTurnGeneratedBy.NPC_SCRIPT)
                        .build();
        DialogueTurn saved = dialogueTurnRepository.save(turn);
        return saved.getId();
    }

    private Long saveTurnWithCatalogMetadata(
            ChoiceValence valence,
            ChoiceTone tone,
            List<String> topicKeywords,
            List<SentimentWord> sentimentWords) {
        DialogueTurn turn =
                DialogueTurn.builder()
                        .session(session)
                        .stepIndex(0)
                        .questionText("오늘 좀 무서운 거 있어?")
                        .choiceIntentId("mky_inj_fear")
                        .choiceText("주사가 무서워요")
                        .intensity((short) 3)
                        .concernFlags(List.of("procedure_fear", "pain_concern"))
                        .protectiveFactors(List.of("can_name_fear", "emotion_named"))
                        .valence(valence)
                        .tone(tone)
                        .topicKeywords(topicKeywords)
                        .sentimentWords(sentimentWords)
                        .generatedBy(DialogueTurnGeneratedBy.NPC_SCRIPT)
                        .build();
        DialogueTurn saved = dialogueTurnRepository.save(turn);
        return saved.getId();
    }

    /** 1차 캐시를 비워서 실제 DB 에서 다시 읽도록 강제. */
    private DialogueTurn reloadFromDb(Long turnId) {
        entityManager.flush();
        entityManager.clear();
        return dialogueTurnRepository.findById(turnId).orElseThrow();
    }
}
