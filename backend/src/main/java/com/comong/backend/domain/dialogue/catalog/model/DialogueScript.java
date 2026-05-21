package com.comong.backend.domain.dialogue.catalog.model;

import java.util.Map;

/**
 * 한 NPC 가 진행할 수 있는 단일 미니 스크립트 (3~4턴, 짧은 도메인 대화).
 *
 * <p>한 NPC 는 보통 3개의 script 를 가지며, 환자가 같은 NPC 를 반복 방문할 때 *안 본 script 우선* 으로 선택된다.
 */
public record DialogueScript(
        String scriptId,
        String npcId,
        String title,
        String entryNodeId,
        Map<String, ScriptNode> nodes) {}
