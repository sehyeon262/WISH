package com.comong.backend.domain.exercise.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import com.comong.backend.domain.exercise.entity.ExerciseType;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * 체조 동작 생성 요청. multipart 의 {@code request} part 에 JSON 으로 담겨 들어온다. 썸네일 / 영상 파일은 별도 multipart part 로
 * 받는다 ({@link com.comong.backend.domain.exercise.controller.ExerciseMotionController}).
 */
public record ExerciseMotionCreateRequest(
        @Schema(description = "체조 타입", example = "TOP") @NotNull ExerciseType exerciseType,
        @Schema(description = "동작명", example = "제자리 걷기") @NotBlank @Size(max = 100) String name,
        @Schema(description = "루틴 내 동작 순서", example = "1") @NotNull @Positive Integer routineOrder,
        @Schema(description = "목표 반복 수", example = "8") @NotNull @Positive Integer targetReps,
        @Schema(description = "동작 설명", example = "좌우 번갈아 제자리에서 걷는다.") @NotBlank
                String description) {}
