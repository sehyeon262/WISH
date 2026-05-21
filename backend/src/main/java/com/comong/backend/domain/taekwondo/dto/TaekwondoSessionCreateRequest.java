package com.comong.backend.domain.taekwondo.dto;

import jakarta.validation.constraints.NotNull;

import com.comong.backend.domain.taekwondo.entity.Poomsae;

import io.swagger.v3.oas.annotations.media.Schema;

public record TaekwondoSessionCreateRequest(
        @Schema(description = "환자 프로필 ID", example = "1") @NotNull Long patientProfileId,
        @Schema(description = "품새", example = "TAEGEUK_1") @NotNull Poomsae poomsae) {}
