package com.comong.backend.domain.artwork.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * 그림 퀴즈 판정 요청 메타데이터. multipart 의 {@code request} 파트로 JSON 전송, 그림 PNG 는 별도 {@code image} 파트.
 *
 * <p>{@code prompt} 는 FE 가 자체 풀에서 골라 보내는 한국어 단어로, 길이 제한은 보수적으로 1~30자.
 */
public record ArtGuessRequest(
        @Schema(description = "아이에게 보여준 제시어 (예: 사과)", example = "사과")
                @NotBlank
                @Size(min = 1, max = 30)
                String prompt) {}
