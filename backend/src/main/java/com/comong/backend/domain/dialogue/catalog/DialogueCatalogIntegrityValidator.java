package com.comong.backend.domain.dialogue.catalog;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import com.comong.backend.domain.dialogue.catalog.model.CatalogNpcDefinition;
import com.comong.backend.domain.dialogue.catalog.model.ChoiceDefinition;
import com.comong.backend.domain.dialogue.catalog.model.DialogueChoiceCatalog;
import com.comong.backend.domain.dialogue.catalog.model.DialogueScript;
import com.comong.backend.domain.dialogue.catalog.model.ScriptNode;

/**
 * 카탈로그 무결성 검증.
 *
 * <p>아래 항목을 검사하며, 하나라도 위반 시 모든 위반 사항을 모아 {@link CatalogIntegrityException} 으로 던진다.
 *
 * <ul>
 *   <li>NPC 가 참조한 scriptId 가 모두 존재
 *   <li>스크립트의 entryNode 가 nodes 에 존재
 *   <li>노드의 choices 가 모두 catalog.choices 에 존재
 *   <li>중간 선택지 (isEnding=false) 의 nextNodeId 가 같은 스크립트의 노드에 존재
 *   <li>엔딩 선택지 (isEnding=true) 는 nextNodeId == null AND endingType/endingNpcLines/closingLine 존재
 *   <li>스크립트 그래프에 사이클 없음
 *   <li>모든 노드가 entryNode 에서 도달 가능
 *   <li>모든 종착점이 엔딩 선택지로 끝남 (dangling 노드 없음)
 * </ul>
 */
class DialogueCatalogIntegrityValidator {

    private final DialogueChoiceCatalog catalog;
    private final List<String> issues = new ArrayList<>();

    DialogueCatalogIntegrityValidator(DialogueChoiceCatalog catalog) {
        this.catalog = catalog;
    }

    /** 검증을 수행하고 발견된 모든 이슈를 반환. 비어 있으면 무결성 통과. */
    List<String> validate() {
        validateNpcScriptRefs();
        for (DialogueScript script : catalog.scripts().values()) {
            validateScript(script);
        }
        return List.copyOf(issues);
    }

    private void validateNpcScriptRefs() {
        for (CatalogNpcDefinition npc : catalog.npcs().values()) {
            for (String scriptId : npc.scripts()) {
                if (!catalog.scripts().containsKey(scriptId)) {
                    issues.add(
                            "npc '"
                                    + npc.npcId()
                                    + "' references missing scriptId '"
                                    + scriptId
                                    + "'");
                }
            }
        }
    }

    private void validateScript(DialogueScript script) {
        Map<String, ScriptNode> nodes = script.nodes();
        if (!nodes.containsKey(script.entryNodeId())) {
            issues.add(
                    "script '"
                            + script.scriptId()
                            + "' entryNodeId '"
                            + script.entryNodeId()
                            + "' is missing from nodes");
            return;
        }
        for (ScriptNode node : nodes.values()) {
            validateNodeChoices(script, node);
        }
        validateReachabilityAndCycles(script);
    }

    private void validateNodeChoices(DialogueScript script, ScriptNode node) {
        for (String choiceId : node.choices()) {
            ChoiceDefinition choice = catalog.choices().get(choiceId);
            if (choice == null) {
                issues.add(
                        "script '"
                                + script.scriptId()
                                + "' node '"
                                + node.nodeId()
                                + "' references missing choiceIntentId '"
                                + choiceId
                                + "'");
                continue;
            }
            validateChoiceShape(script, node, choice);
        }
    }

    private void validateChoiceShape(
            DialogueScript script, ScriptNode node, ChoiceDefinition choice) {
        String ctx =
                "script '"
                        + script.scriptId()
                        + "' node '"
                        + node.nodeId()
                        + "' choice '"
                        + choice.choiceIntentId()
                        + "'";
        if (choice.isEnding()) {
            if (choice.nextNodeId() != null) {
                issues.add(ctx + ": isEnding=true but nextNodeId is not null");
            }
            if (choice.endingType() == null) {
                issues.add(ctx + ": isEnding=true but endingType is null");
            }
            if (choice.endingNpcLines() == null || choice.endingNpcLines().isEmpty()) {
                issues.add(ctx + ": isEnding=true but endingNpcLines is empty");
            }
            if (choice.closingLine() == null || choice.closingLine().isBlank()) {
                issues.add(ctx + ": isEnding=true but closingLine is blank");
            }
        } else {
            if (choice.nextNodeId() == null) {
                issues.add(ctx + ": isEnding=false but nextNodeId is null");
            } else if (!script.nodes().containsKey(choice.nextNodeId())) {
                issues.add(
                        ctx
                                + ": nextNodeId '"
                                + choice.nextNodeId()
                                + "' is not a node of this script");
            }
            if (choice.endingType() != null) {
                issues.add(ctx + ": isEnding=false but endingType is set");
            }
        }
    }

    private void validateReachabilityAndCycles(DialogueScript script) {
        Set<String> visited = new HashSet<>();
        Set<String> stack = new HashSet<>();
        dfs(script, script.entryNodeId(), visited, stack);

        for (String nodeId : script.nodes().keySet()) {
            if (!visited.contains(nodeId)) {
                issues.add(
                        "script '"
                                + script.scriptId()
                                + "' node '"
                                + nodeId
                                + "' is unreachable from entry");
            }
        }
    }

    private void dfs(DialogueScript script, String nodeId, Set<String> visited, Set<String> stack) {
        if (stack.contains(nodeId)) {
            issues.add(
                    "script '" + script.scriptId() + "' has a cycle through node '" + nodeId + "'");
            return;
        }
        if (!visited.add(nodeId)) {
            return;
        }
        stack.add(nodeId);

        ScriptNode node = script.nodes().get(nodeId);
        if (node == null) {
            stack.remove(nodeId);
            return;
        }
        for (String choiceId : node.choices()) {
            ChoiceDefinition choice = catalog.choices().get(choiceId);
            if (choice == null || choice.isEnding() || choice.nextNodeId() == null) {
                continue;
            }
            dfs(script, choice.nextNodeId(), visited, stack);
        }
        stack.remove(nodeId);
    }
}
