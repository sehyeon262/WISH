package com.comong.backend.domain.dialogue.dto;

import com.comong.backend.domain.dialogue.entity.DialogueSession;
import com.comong.backend.domain.dialogue.entity.DialogueStatus;
import com.fasterxml.jackson.annotation.JsonInclude;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * 한 턴 처리 후 응답. 다음 장면을 포함한다 (또는 종료 신호).
 *
 * <p>{@code nextScene} 은 BE-driven NPC 에서만 값이 있다. 마을 주민이면 {@code null} 이고 응답 JSON 에서 omit 된다 — FE 가
 * 자체 스크립트로 다음 scene 을 결정한다.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record SubmitTurnResponse(
        @Schema(description = "세션 ID", example = "42") Long sessionId,
        @Schema(
                        description =
                                "현재 세션 상태 — 종료 시 FINISHED 가 아니라 IN_PROGRESS 유지. 클라이언트가 finish API 를 호출해야 종료.")
                DialogueStatus status,
        @Schema(description = "다음 장면. {@code shouldEndSession=true} 면 FE 는 finish 호출.")
                SceneResponse nextScene) {

    public static SubmitTurnResponse of(DialogueSession session, SceneResponse nextScene) {
        return new SubmitTurnResponse(session.getId(), session.getStatus(), nextScene);
    }
}
