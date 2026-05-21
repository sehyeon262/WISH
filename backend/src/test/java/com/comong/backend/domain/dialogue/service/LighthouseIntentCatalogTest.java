package com.comong.backend.domain.dialogue.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Set;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.comong.backend.domain.dialogue.service.LighthouseIntentCatalog.ChoiceIntentMetadata;

class LighthouseIntentCatalogTest {

    private static final Set<String> EXPECTED_INTENTS =
            Set.of(
                    "mood_okay",
                    "mood_worried",
                    "mood_hard",
                    "rest_today",
                    "worry_pain",
                    "worry_unknown",
                    "worry_family",
                    "hard_body",
                    "hard_lonely",
                    "hard_angry",
                    "support_family",
                    "support_medical",
                    "support_draw",
                    "action_breathe",
                    "action_draw",
                    "action_tell");

    private final LighthouseIntentCatalog catalog = new LighthouseIntentCatalog();

    @Test
    @DisplayName(
            "16종 화이트리스트 intent 가 모두 catalog 에 있어야 함 — ClaudeSceneProvider.ALLOWED_INTENTS 와 일치")
    void allLighthouseIntentsAreInCatalog() {
        for (String intent : EXPECTED_INTENTS) {
            assertThat(catalog.lookup(intent))
                    .as("catalog missing entry for " + intent)
                    .isPresent();
        }
    }

    @Test
    @DisplayName(
            "worry_pain 의 metadata 가 FE 카탈로그와 정확히 일치 (intensity=3, pain_concern+procedure_fear, can_name_fear)")
    void worryPain_matchesFrontendCatalog() {
        ChoiceIntentMetadata meta = catalog.lookup("worry_pain").orElseThrow();
        assertThat(meta.intensity()).isEqualTo((short) 3);
        assertThat(meta.concernFlags()).containsExactly("pain_concern", "procedure_fear");
        assertThat(meta.protectiveFactors()).containsExactly("can_name_fear");
    }

    @Test
    @DisplayName("mood_okay 는 강도 0, 빈 concernFlags, positive_mood")
    void moodOkay_isLowIntensityWithPositiveProtective() {
        ChoiceIntentMetadata meta = catalog.lookup("mood_okay").orElseThrow();
        assertThat(meta.intensity()).isEqualTo((short) 0);
        assertThat(meta.concernFlags()).isEmpty();
        assertThat(meta.protectiveFactors()).containsExactly("positive_mood");
    }

    @Test
    @DisplayName("rest_today 도 catalog 에 포함 (첫 화면 secondaryAction 이지만 BE 가 저장 시 metadata 필요)")
    void restToday_inCatalog() {
        ChoiceIntentMetadata meta = catalog.lookup("rest_today").orElseThrow();
        assertThat(meta.intensity()).isEqualTo((short) 1);
        assertThat(meta.concernFlags()).contains("ended_checkin");
    }

    @Test
    @DisplayName("화이트리스트 밖 intent (예: kill_myself) → empty")
    void unknownIntent_returnsEmpty() {
        assertThat(catalog.lookup("kill_myself")).isEmpty();
    }

    @Test
    @DisplayName("마을 주민 intent (예: nurse_body_okay) → empty (BE catalog 미보유, FE 책임)")
    void villagerIntent_returnsEmpty() {
        assertThat(catalog.lookup("nurse_body_okay")).isEmpty();
    }

    @Test
    @DisplayName("intensity 범위는 모두 0~3")
    void allIntensitiesAreInRange() {
        for (String intent : EXPECTED_INTENTS) {
            ChoiceIntentMetadata meta = catalog.lookup(intent).orElseThrow();
            assertThat(meta.intensity())
                    .as("intensity out of range for " + intent)
                    .isBetween((short) 0, (short) 3);
        }
    }

    @Test
    @DisplayName("concernFlags / protectiveFactors 는 null 아니고 String[] 항상 non-null")
    void noNullCollections() {
        for (String intent : EXPECTED_INTENTS) {
            ChoiceIntentMetadata meta = catalog.lookup(intent).orElseThrow();
            assertThat(meta.concernFlags()).as("concernFlags null for " + intent).isNotNull();
            assertThat(meta.protectiveFactors())
                    .as("protectiveFactors null for " + intent)
                    .isNotNull();
            assertThat(meta.concernFlags()).allSatisfy(s -> assertThat(s).isNotBlank());
            assertThat(meta.protectiveFactors()).allSatisfy(s -> assertThat(s).isNotBlank());
        }
    }
}
