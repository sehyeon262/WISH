package com.comong.backend.domain.exercise.dto;

import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * 체조 동작 부분 수정 요청. multipart 의 {@code request} part. 미디어 교체는 multipart 의 {@code thumbnail} / {@code
 * demoVideo} part 로, 미디어 제거(파일 미업로드 + 기존 값 클리어)는 {@code clearThumbnail} / {@code clearDemoVideo}
 * 플래그로 표현한다. 둘 다 미지정이면 기존 값 유지.
 */
public record ExerciseMotionUpdateRequest(
        @Schema(description = "동작명", example = "제자리 걷기")
                @Size(max = 100)
                @Pattern(regexp = ".*\\S.*", message = "공백만 입력할 수 없습니다.")
                String name,
        @Schema(description = "루틴 내 동작 순서", example = "1") @Positive Integer routineOrder,
        @Schema(description = "목표 반복 수", example = "8") @Positive Integer targetReps,
        @Schema(description = "동작 설명", example = "좌우 번갈아 제자리에서 걷는다.")
                @Pattern(regexp = "(?s).*\\S.*", message = "공백만 입력할 수 없습니다.")
                String description,
        @Schema(description = "true 이면 기존 썸네일 제거 (thumbnail part 가 없을 때만 효과)")
                Boolean clearThumbnail,
        @Schema(description = "true 이면 기존 영상 제거 (demoVideo part 가 없을 때만 효과)")
                Boolean clearDemoVideo) {}
