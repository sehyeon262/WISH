package com.comong.backend.domain.taekwondo.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import com.comong.backend.domain.taekwondo.entity.Poomsae;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * 태권도 동작 생성 요청. multipart 의 {@code request} part 에 JSON 으로 담겨 들어온다. 썸네일 / 영상 파일은 별도 multipart part
 * 로 받는다.
 */
public record TaekwondoMotionCreateRequest(
        @Schema(description = "품새", example = "TAEGEUK_1") @NotNull Poomsae poomsae,
        @Schema(description = "동작명", example = "기본준비") @NotBlank @Size(max = 100) String name,
        @Schema(description = "루틴 내 동작 순서", example = "1") @NotNull @Positive Integer routineOrder,
        @Schema(description = "목표 반복 수", example = "1") @NotNull @Positive Integer targetReps,
        @Schema(description = "동작 설명", example = "기본 준비 자세를 잡는다.") @NotBlank String description) {}
