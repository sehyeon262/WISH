package com.comong.backend.domain.taekwondo.dto;

import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * 태권도 동작 부분 수정 요청. 미디어 교체는 multipart {@code thumbnail} / {@code demoVideo} part 로, 미디어 제거(파일 미업로드 +
 * 기존 값 클리어)는 {@code clearThumbnail} / {@code clearDemoVideo} 플래그로 표현한다. 둘 다 미지정이면 기존 값 유지.
 */
public record TaekwondoMotionUpdateRequest(
        @Schema(description = "동작명", example = "기본준비")
                @Size(max = 100)
                @Pattern(regexp = ".*\\S.*", message = "공백만 입력할 수 없습니다.")
                String name,
        @Schema(description = "루틴 내 동작 순서", example = "1") @Positive Integer routineOrder,
        @Schema(description = "목표 반복 수", example = "1") @Positive Integer targetReps,
        @Schema(description = "동작 설명", example = "기본 준비 자세를 잡는다.")
                @Pattern(regexp = "(?s).*\\S.*", message = "공백만 입력할 수 없습니다.")
                String description,
        @Schema(description = "true 이면 기존 썸네일 제거 (thumbnail part 가 없을 때만 효과)")
                Boolean clearThumbnail,
        @Schema(description = "true 이면 기존 영상 제거 (demoVideo part 가 없을 때만 효과)")
                Boolean clearDemoVideo) {}
