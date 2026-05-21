package com.comong.backend.domain.artwork.dto;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * 그림 퀴즈 판정 응답.
 *
 * <p>{@code source} 는 판정 출처(claude / fallback)로, fallback 은 GMS 키 미설정·실패 시 FE 가 "AI가 잠시 쉬고 있어요" 같은
 * UX를 보여줄 수 있게 분리해서 노출.
 */
public record ArtGuessResponse(
        @Schema(description = "제시어와 일치한다고 판단했는지", example = "true") boolean isMatch,
        @Schema(description = "AI가 그림에서 본 것 (한국어 단어)", example = "사과") String guess,
        @Schema(description = "0.0 ~ 1.0", example = "0.82") double confidence,
        @Schema(description = "판정 출처", example = "claude") Source source) {

    public enum Source {
        CLAUDE,
        FALLBACK
    }
}
