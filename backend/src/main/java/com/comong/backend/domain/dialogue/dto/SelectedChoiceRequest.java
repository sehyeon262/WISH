package com.comong.backend.domain.dialogue.dto;

import java.util.List;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * 아이가 누른 선택지 단건. {@code choiceIntentId} 외의 분석 메타데이터({@code intensity}, {@code concernFlags}, {@code
 * protectiveFactors})는 FE 의 choice 정의에 박혀 있는 값을 그대로 전달한다 (S14P31E103-555 결정 — BE 는 매핑 미보유, 향후 LLM
 * 보고서가 의미 해석).
 */
public record SelectedChoiceRequest(
        @Schema(description = "선택지 의도 식별자 (FE 카탈로그)", example = "mood_worried")
                @NotBlank
                @Size(max = 64)
                String choiceIntentId,
        @Schema(description = "아이 화면에 노출된 선택지 텍스트", example = "걱정돼요") @NotBlank @Size(max = 256)
                String text,
        @Schema(description = "감정 강도 0~3", example = "2") @Min(0) @Max(3) short intensity,
        @Schema(description = "선택에 부여된 concern 신호 목록", example = "[\"worry_present\"]")
                @NotNull
                @Size(max = 20)
                List<@NotBlank @Size(max = 64) String> concernFlags,
        @Schema(description = "선택에 부여된 보호 요인 목록", example = "[\"emotion_named\"]")
                @NotNull
                @Size(max = 20)
                List<@NotBlank @Size(max = 64) String> protectiveFactors) {}
