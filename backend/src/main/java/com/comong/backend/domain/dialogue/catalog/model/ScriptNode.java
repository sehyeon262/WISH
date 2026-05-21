package com.comong.backend.domain.dialogue.catalog.model;

import java.util.List;

/**
 * 스크립트 내 한 노드 (질문 + 선택지 ID 배열).
 *
 * <p>{@code choices} 의 ID 는 카탈로그의 {@code choices} 맵을 참조한다 (참조 무결성은 로딩 시 검증).
 */
public record ScriptNode(
        String nodeId, String questionText, List<String> npcLines, List<String> choices) {}
