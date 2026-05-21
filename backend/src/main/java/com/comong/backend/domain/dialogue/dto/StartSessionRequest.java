package com.comong.backend.domain.dialogue.dto;

import jakarta.validation.constraints.NotNull;

import com.comong.backend.domain.dialogue.entity.NpcName;

import io.swagger.v3.oas.annotations.media.Schema;

/** 대화 세션 시작 요청. 어떤 환자가 어떤 NPC 와 대화를 시작하는지 명시한다. */
public record StartSessionRequest(
        @Schema(description = "대화를 시작하는 환자 프로필 ID (본인 소유)", example = "1") @NotNull
                Long patientProfileId,
        @Schema(description = "대화 상대 NPC 이름. 등대지기 영철은 LLM, 마을 주민 5인은 정적 스크립트 (현재 YEONGCHEOL 만 지원).")
                @NotNull
                NpcName npcName) {}
