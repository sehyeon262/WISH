package com.comong.backend.domain.photobooth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * 인생네컷 결과 저장 요청 메타데이터. multipart 의 {@code request} 파트로 JSON 전송, 합성된 PNG 는 별도 {@code image} 파트로.
 *
 * <p>{@code frameId} 는 FE 정적 자산의 프레임 식별자 ("frame-1" 등). 한 번 저장되면 변경 불가.
 */
public record PhotoBoothCreateRequest(
        @Schema(description = "사용한 프레임 식별자 (FE 자산 키)", example = "frame-1")
                @NotBlank
                @Size(max = 50)
                String frameId,
        @Schema(description = "공개 갤러리 노출 여부", example = "false") @NotNull Boolean isPublic) {}
