package com.comong.backend.domain.photobooth.dto;

import java.time.LocalDateTime;

import com.comong.backend.domain.photobooth.entity.PhotoBoothPhoto;
import com.comong.backend.global.storage.ImageStorage;

/**
 * 공개 갤러리 항목 응답. 비로그인 노출이라 patient_profile / user 식별 정보를 최소화 — 작성자는 환자 프로필 nickname 만 노출. 내부 순차 PK
 * (patientProfileId 등) 는 enumeration / 가입 추세 추정 같은 메타정보 누출 위험이 있어 응답에서 제외.
 *
 * <p>{@link PhotoBoothPhoto#getPatientProfile()} 를 lazy 로 끌어오므로, 호출 service 가 JOIN FETCH 로 미리 로딩한
 * 상태여야 N+1 없음.
 *
 * <p>{@code imageUrl} 은 {@link ImageStorage#toPublicUrl} 을 거친 값.
 */
public record PublicPhotoBoothResponse(
        Long id,
        String frameId,
        String imageUrl,
        String thumbnailUrl,
        LocalDateTime createdAt,
        Author author) {

    public record Author(String nickname) {}

    public static PublicPhotoBoothResponse from(PhotoBoothPhoto photo, ImageStorage imageStorage) {
        String imageUrl = imageStorage.toPublicUrl(photo.getImageUrl());
        String thumbnailUrl =
                photo.getThumbnailUrl() == null || photo.getThumbnailUrl().isBlank()
                        ? imageUrl
                        : imageStorage.toPublicUrl(photo.getThumbnailUrl());
        return new PublicPhotoBoothResponse(
                photo.getId(),
                photo.getFrameId(),
                imageUrl,
                thumbnailUrl,
                photo.getCreatedAt(),
                new Author(photo.getPatientProfile().getNickname()));
    }
}
