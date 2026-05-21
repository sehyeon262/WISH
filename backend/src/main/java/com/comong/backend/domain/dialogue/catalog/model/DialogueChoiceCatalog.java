package com.comong.backend.domain.dialogue.catalog.model;

import java.util.Map;

/**
 * 마을 대화 카탈로그의 최상위 컨테이너.
 *
 * <p>3 개의 맵으로 구성:
 *
 * <ul>
 *   <li>{@code npcs} — NPC 정의 (npcId → NPC 메타)
 *   <li>{@code scripts} — 미니 스크립트 정의 (scriptId → 노드 그래프)
 *   <li>{@code choices} — 모든 선택지의 메타 (choiceIntentId → 임상 메타 + 텍스트)
 * </ul>
 *
 * <p>JSON 리소스 {@code dialogue/choice-catalog.json} 에서 직접 역직렬화된다.
 */
public record DialogueChoiceCatalog(
        Map<String, CatalogNpcDefinition> npcs,
        Map<String, DialogueScript> scripts,
        Map<String, ChoiceDefinition> choices) {}
