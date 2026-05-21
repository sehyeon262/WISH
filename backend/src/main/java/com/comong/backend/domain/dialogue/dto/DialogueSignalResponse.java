package com.comong.backend.domain.dialogue.dto;

import io.swagger.v3.oas.annotations.media.Schema;

/** 보호자 화면 시그널 카드 한 개. concern (🟠) / protective (🟢) 두 종류로 분리. */
public record DialogueSignalResponse(
        @Schema(description = "concern (우려) 또는 protective (보호)", example = "protective")
                SignalKind kind,
        @Schema(description = "flag 키 (분석용)", example = "support_seeking") String flag,
        @Schema(description = "한국어 라벨 (FE 표시용)", example = "도움 찾기") String label,
        @Schema(description = "이 시그널이 발생한 NPC display name", example = "코몽") String npc) {

    public enum SignalKind {
        CONCERN,
        PROTECTIVE
    }
}
