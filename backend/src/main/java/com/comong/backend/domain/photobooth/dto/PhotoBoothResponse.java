package com.comong.backend.domain.photobooth.dto;

import java.time.LocalDateTime;

import com.comong.backend.domain.photobooth.entity.PhotoBoothPhoto;
import com.comong.backend.global.storage.ImageStorage;

/**
 * 사진 단건 상세 응답. POST/PATCH 결과 + GET /photo-booths/{id} (본인용) + GET /photo-booths/me 항목.
 *
 * <p>공개 갤러리 (`/photo-booths/public`) 응답에는 작성자(닉네임) 가 추가된 {@link PublicPhotoBoothResponse} 를 사용.
 *
 * <p>{@code imageUrl} 은 응답 직렬화 시점에 {@link ImageStorage#toPublicUrl} 을 거친 값 — S3 백엔드면 짧은 TTL
 * presigned URL, 로컬이면 영구 servlet 경로.
 */
public record PhotoBoothResponse(
        Long id,
        String frameId,
        String imageUrl,
        String thumbnailUrl,
        boolean isPublic,
        LocalDateTime createdAt,
        LocalDateTime updatedAt) {

    public static PhotoBoothResponse from(PhotoBoothPhoto photo, ImageStorage imageStorage) {
        String imageUrl = imageStorage.toPublicUrl(photo.getImageUrl());
        String thumbnailUrl =
                photo.getThumbnailUrl() == null || photo.getThumbnailUrl().isBlank()
                        ? imageUrl
                        : imageStorage.toPublicUrl(photo.getThumbnailUrl());
        return new PhotoBoothResponse(
                photo.getId(),
                photo.getFrameId(),
                imageUrl,
                thumbnailUrl,
                photo.isPublic(),
                photo.getCreatedAt(),
                photo.getUpdatedAt());
    }
}
