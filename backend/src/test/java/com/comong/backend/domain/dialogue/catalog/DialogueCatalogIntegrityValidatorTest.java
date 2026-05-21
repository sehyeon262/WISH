package com.comong.backend.domain.dialogue.catalog;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import com.comong.backend.domain.dialogue.catalog.model.CatalogNpcDefinition;
import com.comong.backend.domain.dialogue.catalog.model.ChoiceDefinition;
import com.comong.backend.domain.dialogue.catalog.model.ChoiceEndingType;
import com.comong.backend.domain.dialogue.catalog.model.ChoiceTone;
import com.comong.backend.domain.dialogue.catalog.model.ChoiceValence;
import com.comong.backend.domain.dialogue.catalog.model.DialogueChoiceCatalog;
import com.comong.backend.domain.dialogue.catalog.model.DialogueScript;
import com.comong.backend.domain.dialogue.catalog.model.ScriptNode;

class DialogueCatalogIntegrityValidatorTest {

    @Test
    void emptyCatalog_passes() {
        DialogueChoiceCatalog catalog = new DialogueChoiceCatalog(Map.of(), Map.of(), Map.of());

        List<String> issues = new DialogueCatalogIntegrityValidator(catalog).validate();

        assertThat(issues).isEmpty();
    }

    @Test
    void minimalValidCatalog_passes() {
        ChoiceDefinition ending = endingChoice("c_end");
        ScriptNode entry = new ScriptNode("n1", "q?", List.of("..."), List.of("c_end"));
        DialogueScript script =
                new DialogueScript("s1", "npc1", "title", "n1", Map.of("n1", entry));
        CatalogNpcDefinition npc = new CatalogNpcDefinition("npc1", "N", "tone", List.of("s1"));

        DialogueChoiceCatalog catalog =
                new DialogueChoiceCatalog(
                        Map.of("npc1", npc), Map.of("s1", script), Map.of("c_end", ending));

        List<String> issues = new DialogueCatalogIntegrityValidator(catalog).validate();

        assertThat(issues).isEmpty();
    }

    @Test
    void detectsNpcReferencingMissingScript() {
        CatalogNpcDefinition npc =
                new CatalogNpcDefinition("npc1", "N", "tone", List.of("missing_script"));

        DialogueChoiceCatalog catalog =
                new DialogueChoiceCatalog(Map.of("npc1", npc), Map.of(), Map.of());

        List<String> issues = new DialogueCatalogIntegrityValidator(catalog).validate();

        assertThat(issues).anyMatch(i -> i.contains("missing scriptId 'missing_script'"));
    }

    @Test
    void detectsMissingEntryNode() {
        DialogueScript script = new DialogueScript("s1", "npc1", "title", "nope_entry", Map.of());

        DialogueChoiceCatalog catalog =
                new DialogueChoiceCatalog(Map.of(), Map.of("s1", script), Map.of());

        List<String> issues = new DialogueCatalogIntegrityValidator(catalog).validate();

        assertThat(issues).anyMatch(i -> i.contains("entryNodeId 'nope_entry' is missing"));
    }

    @Test
    void detectsNodeReferencingMissingChoice() {
        ScriptNode entry = new ScriptNode("n1", "q?", List.of(), List.of("missing_choice"));
        DialogueScript script =
                new DialogueScript("s1", "npc1", "title", "n1", Map.of("n1", entry));

        DialogueChoiceCatalog catalog =
                new DialogueChoiceCatalog(Map.of(), Map.of("s1", script), Map.of());

        List<String> issues = new DialogueCatalogIntegrityValidator(catalog).validate();

        assertThat(issues).anyMatch(i -> i.contains("missing choiceIntentId 'missing_choice'"));
    }

    @Test
    void detectsIntermediateChoiceWithNullNextNode() {
        ChoiceDefinition broken =
                new ChoiceDefinition(
                        "c1",
                        "text",
                        null,
                        false,
                        ChoiceValence.NEUTRAL,
                        ChoiceTone.CALM,
                        0,
                        List.of(),
                        List.of(),
                        List.of(),
                        List.of(),
                        null,
                        null,
                        null);
        ScriptNode entry = new ScriptNode("n1", "q?", List.of(), List.of("c1"));
        DialogueScript script =
                new DialogueScript("s1", "npc1", "title", "n1", Map.of("n1", entry));

        DialogueChoiceCatalog catalog =
                new DialogueChoiceCatalog(Map.of(), Map.of("s1", script), Map.of("c1", broken));

        List<String> issues = new DialogueCatalogIntegrityValidator(catalog).validate();

        assertThat(issues).anyMatch(i -> i.contains("isEnding=false but nextNodeId is null"));
    }

    @Test
    void detectsEndingChoiceWithoutEndingType() {
        ChoiceDefinition broken =
                new ChoiceDefinition(
                        "c_end",
                        "text",
                        null,
                        true,
                        ChoiceValence.POSITIVE,
                        ChoiceTone.CALM,
                        0,
                        List.of(),
                        List.of(),
                        List.of(),
                        List.of(),
                        null,
                        List.of("bye"),
                        "close");
        ScriptNode entry = new ScriptNode("n1", "q?", List.of(), List.of("c_end"));
        DialogueScript script =
                new DialogueScript("s1", "npc1", "title", "n1", Map.of("n1", entry));

        DialogueChoiceCatalog catalog =
                new DialogueChoiceCatalog(Map.of(), Map.of("s1", script), Map.of("c_end", broken));

        List<String> issues = new DialogueCatalogIntegrityValidator(catalog).validate();

        assertThat(issues).anyMatch(i -> i.contains("isEnding=true but endingType is null"));
    }

    @Test
    void detectsCycle() {
        ChoiceDefinition cAtoB = intermediateChoice("c_a_to_b", "n_b");
        ChoiceDefinition cBtoA = intermediateChoice("c_b_to_a", "n_a");

        ScriptNode nodeA = new ScriptNode("n_a", "q?", List.of(), List.of("c_a_to_b"));
        ScriptNode nodeB = new ScriptNode("n_b", "q?", List.of(), List.of("c_b_to_a"));
        DialogueScript script =
                new DialogueScript(
                        "s1", "npc1", "title", "n_a", Map.of("n_a", nodeA, "n_b", nodeB));

        DialogueChoiceCatalog catalog =
                new DialogueChoiceCatalog(
                        Map.of(),
                        Map.of("s1", script),
                        Map.of("c_a_to_b", cAtoB, "c_b_to_a", cBtoA));

        List<String> issues = new DialogueCatalogIntegrityValidator(catalog).validate();

        assertThat(issues).anyMatch(i -> i.contains("cycle"));
    }

    @Test
    void detectsUnreachableNode() {
        ChoiceDefinition ending = endingChoice("c_end");
        ScriptNode entry = new ScriptNode("n_entry", "q?", List.of(), List.of("c_end"));
        ScriptNode orphan = new ScriptNode("n_orphan", "q?", List.of(), List.of("c_end"));
        DialogueScript script =
                new DialogueScript(
                        "s1",
                        "npc1",
                        "title",
                        "n_entry",
                        Map.of("n_entry", entry, "n_orphan", orphan));

        DialogueChoiceCatalog catalog =
                new DialogueChoiceCatalog(Map.of(), Map.of("s1", script), Map.of("c_end", ending));

        List<String> issues = new DialogueCatalogIntegrityValidator(catalog).validate();

        assertThat(issues).anyMatch(i -> i.contains("'n_orphan' is unreachable"));
    }

    private static ChoiceDefinition endingChoice(String id) {
        return new ChoiceDefinition(
                id,
                "text",
                null,
                true,
                ChoiceValence.POSITIVE,
                ChoiceTone.CALM,
                0,
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                ChoiceEndingType.REST_ONLY,
                List.of("bye"),
                "close");
    }

    private static ChoiceDefinition intermediateChoice(String id, String nextNodeId) {
        return new ChoiceDefinition(
                id,
                "text",
                nextNodeId,
                false,
                ChoiceValence.NEUTRAL,
                ChoiceTone.CALM,
                0,
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                null,
                null,
                null);
    }
}
