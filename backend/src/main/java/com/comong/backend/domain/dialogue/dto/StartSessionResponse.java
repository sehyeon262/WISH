package com.comong.backend.domain.dialogue.dto;

import com.comong.backend.domain.dialogue.entity.DialogueSession;
import com.comong.backend.domain.dialogue.entity.DialogueStatus;
import com.fasterxml.jackson.annotation.JsonInclude;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * 세션 시작 응답. 세션 식별자와 첫 장면을 함께 반환한다.
 *
 * <p>{@code scene} 은 BE-driven NPC (등대지기) 에서만 값이 있다. 마을 주민(FE-driven)이면 {@code null} 이고 {@link
 * JsonInclude} 정책으로 응답 JSON 에서 omit 된다.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record StartSessionResponse(
        @Schema(description = "발급된 세션 ID", example = "42") Long sessionId,
        @Schema(description = "현재 세션 상태") DialogueStatus status,
        @Schema(description = "첫 장면 (마을 주민이면 omit)") SceneResponse scene) {

    public static StartSessionResponse of(DialogueSession session, SceneResponse scene) {
        return new StartSessionResponse(session.getId(), session.getStatus(), scene);
    }
}
