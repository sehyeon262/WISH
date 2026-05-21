package com.comong.backend.domain.dialogue.catalog;

import java.util.List;
import java.util.Optional;

import org.springframework.stereotype.Service;

import com.comong.backend.domain.dialogue.catalog.model.CatalogNpcDefinition;
import com.comong.backend.domain.dialogue.catalog.model.ChoiceDefinition;
import com.comong.backend.domain.dialogue.catalog.model.DialogueChoiceCatalog;
import com.comong.backend.domain.dialogue.catalog.model.DialogueScript;
import com.comong.backend.domain.dialogue.catalog.model.ScriptNode;

/**
 * 카탈로그 조회 API.
 *
 * <p>대화 흐름 (B2), 정성 요약 (B3), 일별 집계 (B4) 등에서 모두 이 서비스를 통해 카탈로그를 읽는다. 카탈로그는 immutable 이므로 동시 호출 안전.
 *
 * <p>존재하지 않는 ID 조회 시 {@link Optional#empty()} 를 반환 — 호출 측에서 도메인 의미에 맞게 비즈니스 예외로 승격할지 결정.
 */
@Service
public class DialogueCatalogService {

    private final DialogueChoiceCatalog catalog;

    public DialogueCatalogService(DialogueCatalogLoader loader) {
        this.catalog = loader.getCatalog();
    }

    public Optional<CatalogNpcDefinition> findNpc(String npcId) {
        return Optional.ofNullable(catalog.npcs().get(npcId));
    }

    public Optional<DialogueScript> findScript(String scriptId) {
        return Optional.ofNullable(catalog.scripts().get(scriptId));
    }

    public Optional<ScriptNode> findNode(String scriptId, String nodeId) {
        return findScript(scriptId).map(s -> s.nodes().get(nodeId));
    }

    public Optional<ChoiceDefinition> findChoice(String choiceIntentId) {
        return Optional.ofNullable(catalog.choices().get(choiceIntentId));
    }

    /** 한 NPC 가 진행 가능한 스크립트 ID 목록. NPC 가 없으면 빈 리스트. */
    public List<String> scriptIdsOf(String npcId) {
        return findNpc(npcId).map(CatalogNpcDefinition::scripts).orElse(List.of());
    }

    /** 한 노드의 표시 가능 선택지들 (catalog 룩업 완료된 형태). */
    public List<ChoiceDefinition> choicesOf(ScriptNode node) {
        return node.choices().stream().map(catalog.choices()::get).filter(c -> c != null).toList();
    }
}
