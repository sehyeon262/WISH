package com.comong.backend.domain.artwork.dto;

import java.time.LocalDateTime;

import com.comong.backend.domain.artwork.entity.Artwork;
import com.comong.backend.global.storage.ImageStorage;

/**
 * 작품 단건 상세 응답. POST/PATCH 결과 + GET /artworks/{id} (본인용) + GET /artworks/me 항목.
 *
 * <p>공개 갤러리 (`/artworks/public`) 응답에는 작성자(닉네임) 가 추가된 {@link PublicArtworkResponse} 를 사용.
 *
 * <p>{@code imageUrl} 은 응답 직렬화 시점에 {@link ImageStorage#toPublicUrl} 을 거친 값 — S3 백엔드면 짧은 TTL
 * presigned URL, 로컬이면 영구 servlet 경로. 자세한 의도는 {@link ImageStorage} javadoc.
 */
public record ArtworkResponse(
        Long id,
        Integer sketchCode,
        String imageUrl,
        int playDurationSeconds,
        int colorCount,
        boolean isPublic,
        LocalDateTime createdAt,
        LocalDateTime updatedAt) {

    public static ArtworkResponse from(Artwork artwork, ImageStorage imageStorage) {
        return new ArtworkResponse(
                artwork.getId(),
                artwork.getSketchCode(),
                imageStorage.toPublicUrl(artwork.getImageUrl()),
                artwork.getPlayDurationSeconds(),
                artwork.getColorCount(),
                artwork.isPublic(),
                artwork.getCreatedAt(),
                artwork.getUpdatedAt());
    }
}
