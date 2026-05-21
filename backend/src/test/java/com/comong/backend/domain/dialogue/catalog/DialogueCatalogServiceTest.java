package com.comong.backend.domain.dialogue.catalog;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.junit.jupiter.api.TestInstance.Lifecycle;
import org.springframework.core.io.DefaultResourceLoader;

import com.comong.backend.domain.dialogue.catalog.model.ChoiceEndingType;
import com.comong.backend.domain.dialogue.catalog.model.ScriptNode;

import tools.jackson.databind.ObjectMapper;

@TestInstance(Lifecycle.PER_CLASS)
class DialogueCatalogServiceTest {

    private DialogueCatalogService service;

    @BeforeAll
    void setup() {
        DialogueCatalogLoader loader =
                new DialogueCatalogLoader(
                        new DefaultResourceLoader(),
                        new ObjectMapper(),
                        "classpath:dialogue/choice-catalog.json");
        service = new DialogueCatalogService(loader);
    }

    @Test
    void findNpc_returnsKnownNpc() {
        assertThat(service.findNpc("monkey_friend"))
                .isPresent()
                .hasValueSatisfying(n -> assertThat(n.displayName()).isEqualTo("코몽"));
    }

    @Test
    void findNpc_returnsEmptyForUnknown() {
        assertThat(service.findNpc("ghost_npc")).isEmpty();
    }

    @Test
    void findScript_returnsKnownScript() {
        assertThat(service.findScript("monkey_injection_fear"))
                .isPresent()
                .hasValueSatisfying(s -> assertThat(s.title()).isEqualTo("시술 무서움"));
    }

    @Test
    void findNode_returnsEntryNodeOfScript() {
        assertThat(service.findNode("monkey_injection_fear", "mky_inj_01_entry"))
                .isPresent()
                .hasValueSatisfying(n -> assertThat(n.questionText()).isEqualTo("오늘 좀 무서운 거 있어?"));
    }

    @Test
    void findChoice_returnsChoiceMetadata() {
        assertThat(service.findChoice("mky_inj_say_hold"))
                .isPresent()
                .hasValueSatisfying(
                        c -> {
                            assertThat(c.isEnding()).isTrue();
                            assertThat(c.endingType()).isEqualTo(ChoiceEndingType.ASK_ADULT_FIRST);
                        });
    }

    @Test
    void scriptIdsOf_returnsScriptsOfNpc() {
        assertThat(service.scriptIdsOf("monkey_friend"))
                .containsExactly("monkey_injection_fear", "monkey_frustration", "monkey_play");
    }

    @Test
    void scriptIdsOf_returnsEmptyForUnknownNpc() {
        assertThat(service.scriptIdsOf("ghost_npc")).isEmpty();
    }

    @Test
    void choicesOf_resolvesChoicesFromNode() {
        ScriptNode entry =
                service.findNode("monkey_injection_fear", "mky_inj_01_entry").orElseThrow();

        assertThat(service.choicesOf(entry))
                .hasSize(3)
                .extracting(c -> c.choiceIntentId())
                .containsExactly("mky_inj_fear", "mky_inj_unknown", "mky_inj_unsure");
    }
}
