package com.comong.backend.domain.dialogue.dto;

import io.swagger.v3.oas.annotations.media.Schema;

/** 화면에 노출되는 선택지 단건. */
public record ChoiceResponse(
        @Schema(description = "선택지 의도 식별자", example = "mood_worried") String choiceIntentId,
        @Schema(description = "선택지 표시 텍스트", example = "걱정돼요") String text) {

    public static ChoiceResponse of(String choiceIntentId, String text) {
        return new ChoiceResponse(choiceIntentId, text);
    }
}
