package com.comong.backend.domain.dialogue.dto;

import java.util.List;

import com.comong.backend.domain.dialogue.entity.DialogueTurnGeneratedBy;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * NPC 가 아이에게 보여줄 한 장면.
 *
 * <p>{@code secondaryAction} 은 첫 화면(첫 질문)에서만 비어있지 않다. PDF 정책: "오늘은 쉬고 싶어요"는 첫 질문 화면에서만 노출.
 *
 * <p>{@code shouldEndSession} 이 true 면 FE 는 더 이상 turns API 를 호출하지 않고 finish API 로 넘어간다.
 *
 * <p>{@code npcResponse} 는 직전 선택에 대한 NPC 의 짧은 ack 멘트 (1~2 줄). 첫 화면 / 마을 주민 응답에선 비어있을 수 있다.
 */
public record SceneResponse(
        @Schema(description = "NPC 의 질문 텍스트", example = "오늘 기분은 어떠니?") String questionText,
        @Schema(description = "선택지 배열 (최대 3개)") List<ChoiceResponse> choices,
        @Schema(description = "첫 화면 전용 보조 선택지 (오늘은 쉬고 싶어요). 후속 scene 에선 항상 null.", nullable = true)
                ChoiceResponse secondaryAction,
        @Schema(description = "세션 종료 신호. true 면 다음 호출은 finish API.") boolean shouldEndSession,
        @Schema(description = "이 장면을 생성한 출처. CLAUDE/FALLBACK/NPC_SCRIPT.")
                DialogueTurnGeneratedBy generatedBy,
        @Schema(description = "직전 선택에 대한 NPC ack 멘트 (1~2줄). 첫 화면이면 빈 배열.")
                List<String> npcResponse) {}
