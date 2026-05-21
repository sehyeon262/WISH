package com.comong.backend.domain.dialogue.dto;

import jakarta.validation.constraints.NotNull;

import com.comong.backend.domain.dialogue.entity.DialogueFinishReason;

import io.swagger.v3.oas.annotations.media.Schema;

/** 대화 세션 종료 요청. {@code finishReason} 으로 일반 종료/쉬기 종료/타임아웃 을 구분한다. */
public record FinishSessionRequest(
        @Schema(description = "세션 종료 사유", example = "COMPLETED") @NotNull
                DialogueFinishReason finishReason) {}
