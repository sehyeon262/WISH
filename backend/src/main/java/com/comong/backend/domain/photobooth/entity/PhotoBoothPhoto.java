package com.comong.backend.domain.photobooth.entity;

import java.time.LocalDateTime;
import java.util.Objects;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import com.comong.backend.domain.patient.entity.PatientProfile;

import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 포토부스(인생네컷) 결과물. 합성된 최종 PNG 1장과 사용된 프레임 식별자(frameId)를 보관한다. 공개 여부는 갤러리 노출 여부.
 *
 * <p>네컷 원본(사진 8장 또는 선택된 4장)은 따로 저장하지 않는다 — FE 에서 합성한 PNG 한 장만 결과로 관리한다.
 *
 * <p>{@code frameId} 는 FE 정적 자산 키 ("frame-1", "frame-2" 등). DB 외래키 없이 문자열로 저장.
 */
@Entity
@Getter
@Table(name = "photo_booth_photos")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PhotoBoothPhoto {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // 사진 소유자. artworks 와 동일하게 보호자(User) 가 아닌 실제 플레이 주체(PatientProfile) 에 귀속한다.
    // 권한 체크는 photo.patientProfile.user.id 를 인증 사용자와 비교 (service 레이어).
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "patient_profile_id", nullable = false)
    private PatientProfile patientProfile;

    /** 사용된 프레임의 FE 자산 식별자 (예: "frame-1"). 한 번 정해지면 수정 불가. */
    @Column(name = "frame_id", nullable = false, length = 50)
    private String frameId;

    /** 합성된 결과 이미지의 URL. 실제 파일은 별도 스토리지에 저장된다. */
    @Column(name = "image_url", nullable = false, length = 500)
    private String imageUrl;

    @Column(name = "thumbnail_url", length = 500)
    private String thumbnailUrl;

    /** 공개 갤러리 노출 여부. false 면 본인만 조회 가능. */
    @Column(name = "is_public", nullable = false)
    private boolean isPublic;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @Builder
    private PhotoBoothPhoto(
            PatientProfile patientProfile,
            String frameId,
            String imageUrl,
            String thumbnailUrl,
            boolean isPublic) {
        // 빌더 단계 invariant — @ManyToOne(optional=false) / @Column(nullable=false) 만으로는 build()
        // 시점에 null 차단이 안 되므로 fail-fast.
        this.patientProfile =
                Objects.requireNonNull(patientProfile, "patientProfile must not be null");
        this.frameId = Objects.requireNonNull(frameId, "frameId must not be null");
        this.imageUrl = Objects.requireNonNull(imageUrl, "imageUrl must not be null");
        this.thumbnailUrl = thumbnailUrl;
        if (frameId.isBlank()) {
            throw new IllegalArgumentException("frameId must not be blank");
        }
        this.isPublic = isPublic;
    }

    /** PATCH 시맨틱: {@code null} 인 인자는 "변경 없음". 현재는 공개 여부만 변경 가능. */
    public void update(Boolean isPublic) {
        if (isPublic != null) {
            this.isPublic = isPublic;
        }
    }

    /**
     * 주어진 사용자가 본 사진의 소유자인지 판단. {@code patientProfile.user.id} 와 비교한다.
     *
     * <p>{@code userId} 가 null 이면 (비로그인 등) 항상 false. {@code patientProfile} 또는 그 user 가 null 인 비정상
     * 상태도 안전하게 false (DB FK NOT NULL 이라 정상 흐름에선 발생 안 함 — 정합성 안전망).
     *
     * <p><b>LAZY fetch 주의</b>: {@link com.comong.backend.domain.artwork.entity.Artwork#isOwnedBy} 와
     * 동일하게, 권한 체크 이전에 {@code JOIN FETCH photo.patientProfile.user} 로 미리 로딩해야 N+1 을 방지.
     */
    public boolean isOwnedBy(Long userId) {
        if (userId == null) {
            return false;
        }
        if (patientProfile == null) {
            return false;
        }
        if (patientProfile.getUser() == null) {
            return false;
        }
        return userId.equals(patientProfile.getUser().getId());
    }

    @PrePersist
    void prePersist() {
        LocalDateTime now = LocalDateTime.now();
        this.createdAt = now;
        this.updatedAt = now;
    }

    @PreUpdate
    void preUpdate() {
        this.updatedAt = LocalDateTime.now();
    }
}
