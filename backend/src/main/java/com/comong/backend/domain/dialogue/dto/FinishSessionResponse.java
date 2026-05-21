package com.comong.backend.domain.dialogue.dto;

import java.util.List;

import com.comong.backend.domain.dialogue.entity.DialogueSession;
import com.comong.backend.domain.dialogue.entity.DialogueStatus;
import com.fasterxml.jackson.annotation.JsonInclude;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * 세션 종료 응답. 짧은 마무리 대사 ({@code closingLines}) 만 반환 — 마음엽서 / caregiverFacingNote 는 내려주지 않는다.
 *
 * <p>{@code closingLines} 는 BE-driven NPC 에서만 값이 있다. 마을 주민이면 {@code null} 이고 응답 JSON 에서 omit — FE 가
 * 자체 마무리 대사를 표시한다.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record FinishSessionResponse(
        @Schema(description = "세션 ID") Long sessionId,
        @Schema(description = "세션 상태 (항상 FINISHED)") DialogueStatus status,
        @Schema(description = "NPC 마무리 대사 (1~2 줄)") List<String> closingLines) {

    public static FinishSessionResponse of(DialogueSession session, List<String> closingLines) {
        return new FinishSessionResponse(session.getId(), session.getStatus(), closingLines);
    }
}
