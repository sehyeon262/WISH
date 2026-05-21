package com.comong.backend.domain.dialogue.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * 한 턴(질문 → 선택)의 결과 제출 요청.
 *
 * <p>{@code questionText} 는 직전 화면에 노출되었던 질문을 FE 가 그대로 echo 한다. 등대지기는 BE 가 직전 응답으로 내려준 값, 마을 주민은 FE
 * 자체 스크립트의 질문 — 양쪽 다 FE 가 보내는 것으로 통일해 BE 가 매 턴마다 라우팅 테이블을 replay 하는 부담을 없앤다.
 */
public record SubmitTurnRequest(
        @Schema(description = "직전 화면의 질문 텍스트 (FE echo)", example = "오늘 기분은 어떠니?")
                @NotBlank
                @Size(max = 1024)
                String questionText,
        @Schema(description = "아이가 누른 선택지 정보") @NotNull @Valid SelectedChoiceRequest selectedChoice,
        @Schema(description = "NPC response text generated after the child answer")
                @Size(max = 2048)
                String npcResponseText) {}
