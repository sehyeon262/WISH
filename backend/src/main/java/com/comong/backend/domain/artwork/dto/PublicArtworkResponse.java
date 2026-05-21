package com.comong.backend.domain.artwork.dto;

import java.time.LocalDateTime;

import com.comong.backend.domain.artwork.entity.Artwork;
import com.comong.backend.global.storage.ImageStorage;

/**
 * 공개 갤러리 항목 응답. 비로그인 노출이라 patient_profile / user 식별 정보를 최소화 — 작성자는 환자 프로필 nickname 만 노출. 내부 순차 PK
 * (patientProfileId 등) 는 enumeration / 가입 추세 추정 같은 메타정보 누출 위험이 있어 응답에서 제외.
 *
 * <p>{@link Artwork#getPatientProfile()} 를 lazy 로 끌어오므로, 호출 service 가 JOIN FETCH 로 미리 로딩한 상태여야 N+1
 * 없음 (목록 조회 시).
 *
 * <p>{@code imageUrl} 은 {@link ImageStorage#toPublicUrl} 을 거친 값 — S3 백엔드면 presigned URL.
 */
public record PublicArtworkResponse(
        Long id,
        Integer sketchCode,
        String imageUrl,
        int playDurationSeconds,
        int colorCount,
        LocalDateTime createdAt,
        Author author) {

    public record Author(String nickname) {}

    public static PublicArtworkResponse from(Artwork artwork, ImageStorage imageStorage) {
        return new PublicArtworkResponse(
                artwork.getId(),
                artwork.getSketchCode(),
                imageStorage.toPublicUrl(artwork.getImageUrl()),
                artwork.getPlayDurationSeconds(),
                artwork.getColorCount(),
                artwork.getCreatedAt(),
                new Author(artwork.getPatientProfile().getNickname()));
    }
}
