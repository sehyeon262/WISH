package com.comong.backend.domain.dialogue.catalog.model;

import java.util.List;

/**
 * 카탈로그에서 한 NPC 의 메타 정의.
 *
 * <p>{@code scripts} 는 해당 NPC 가 진행할 수 있는 미니 스크립트 ID 목록 (보통 3개).
 */
public record CatalogNpcDefinition(
        String npcId, String displayName, String tone, List<String> scripts) {}
