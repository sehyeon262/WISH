package com.comong.backend.domain.dialogue.dto;

import io.swagger.v3.oas.annotations.media.Schema;

/** 보호자 화면 "오늘 만난 친구들" 위젯의 행 한 개. */
public record NpcVisitedResponse(
        @Schema(description = "NPC enum 이름", example = "SEORIN") String npcName,
        @Schema(description = "표시명", example = "코몽") String displayName,
        @Schema(description = "다룬 도메인 / script 제목", example = "시술 무서움") String scriptTitle,
        @Schema(description = "해당 NPC·도메인 조합의 오늘 세션 수", example = "1") int sessionCount) {}
