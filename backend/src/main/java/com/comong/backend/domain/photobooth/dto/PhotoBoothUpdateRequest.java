package com.comong.backend.domain.photobooth.dto;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * 사진 수정 요청. PATCH 시맨틱: {@code null} 인 필드는 변경 없음. 현재는 공개 여부만 변경 가능.
 *
 * <p>{@code frameId} / {@code imageUrl} 은 본 메서드로 변경하지 않는다 — 각각 한 번 정해진 후 고정.
 */
public record PhotoBoothUpdateRequest(
        @Schema(description = "공개 여부 변경 (변경 없으면 생략)", example = "true") Boolean isPublic) {}
