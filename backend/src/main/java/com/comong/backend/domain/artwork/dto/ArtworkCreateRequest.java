package com.comong.backend.domain.artwork.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * 작품 저장 요청 메타데이터. multipart 의 {@code request} 파트로 JSON 전송, 이미지 파일은 별도 {@code image} 파트로.
 *
 * <p>{@code sketchCode} 는 자유 그리기 (밑그림 없는 작품) 케이스 지원을 위해 nullable. 도안 기반 작품 생성 시에만 채워서 보낸다. FE 가 도안
 * ID 를 정수로 사용한다 (V7).
 *
 * <p>{@code playDurationSeconds} 음수 방어: DTO 단계에서 {@code @PositiveOrZero} 로 1차 차단하고, {@code Artwork}
 * 빌더에서 invariant 로 한 번 더 확인 (216 MR AI 리뷰 #2 후속).
 */
public record ArtworkCreateRequest(
        @Schema(description = "FE 정적 자산의 도안 식별자 (자유 그리기는 생략)", example = "1") @PositiveOrZero
                Integer sketchCode,
        @Schema(description = "플레이 시간(초)", example = "87") @NotNull @PositiveOrZero
                Integer playDurationSeconds,
        @Schema(description = "작품에 사용된 distinct 색 개수. 도안 팔레트마다 상한이 달라 음수만 차단", example = "5")
                @NotNull
                @PositiveOrZero
                Integer colorCount,
        @Schema(description = "공개 갤러리 노출 여부", example = "false") @NotNull Boolean isPublic) {}
