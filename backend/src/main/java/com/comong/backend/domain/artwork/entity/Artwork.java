package com.comong.backend.domain.artwork.entity;

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
 * 사용자가 색칠한 작품. 도안(sketchCode 정수 코드로 FE 정적 자산과 매칭)과 합성된 결과 이미지(imageUrl), 누적 플레이 시간, 공개 여부를 보관한다.
 *
 * <p>영역별 색상 데이터는 저장하지 않는다. FE 가 imageUrl PNG 를 캔버스에 깔고 덧칠/빈 칸 형태로 수정 UX 를 처리한다.
 */
@Entity
@Getter
@Table(name = "artworks")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Artwork {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // 작품 소유자. 보호자 계정(User) 가 아니라 실제 플레이 주체인 PatientProfile 에 귀속한다.
    // 현재 정책은 보호자 1명당 환자 1명(1:1) 이지만, 1:N 으로 열릴 때 기존 작품의 환자 귀속을
    // 추론할 수 없는 마이그레이션 함정을 방지하기 위해 처음부터 patient_profile_id 로 잡는다.
    // 권한 체크는 artwork.patientProfile.user.id 를 인증 사용자와 비교 (service 레이어).
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "patient_profile_id", nullable = false)
    private PatientProfile patientProfile;

    /**
     * FE 정적 자산의 도안 식별자 (정수 코드). 자유 그리기 (밑그림 없는 작품) 케이스에서는 {@code null}. 도안 기반 작품의 경우 한 번 정해진 코드는
     * 재사용/변경 금지.
     */
    @Column(name = "sketch_code")
    private Integer sketchCode;

    /** 합성된 결과 이미지의 URL. 실제 파일은 별도 스토리지에 저장된다. */
    @Column(name = "image_url", nullable = false, length = 500)
    private String imageUrl;

    /** 누적 플레이 시간(초). 수정 세션이 추가될 때마다 누적된다. */
    @Column(name = "play_duration_seconds", nullable = false)
    private int playDurationSeconds;

    /**
     * 작품에서 최종적으로 사용된 distinct 색 개수. 색칠 씬은 도안 팔레트 distinct, 자유드로잉은 12 색 팔레트 중 픽셀에 남은 색 개수를 FE 가 보낸다.
     * 도안마다 팔레트 크기가 달라 상한값은 두지 않고 음수만 차단한다.
     */
    @Column(name = "color_count", nullable = false)
    private int colorCount;

    /** 공개 갤러리 노출 여부. false 면 본인만 조회 가능. */
    @Column(name = "is_public", nullable = false)
    private boolean isPublic;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @Builder
    private Artwork(
            PatientProfile patientProfile,
            Integer sketchCode,
            String imageUrl,
            int playDurationSeconds,
            int colorCount,
            boolean isPublic) {
        // 빌더 단계 invariant — @ManyToOne(optional=false) / @Column(nullable=false) 만으로는 build()
        // 시점에 null 차단이 안 되므로 fail-fast. sketchCode 는 V5 부터 자유 그리기 지원 위해 nullable 이라 제외.
        this.patientProfile =
                Objects.requireNonNull(patientProfile, "patientProfile must not be null");
        this.imageUrl = Objects.requireNonNull(imageUrl, "imageUrl must not be null");
        // 도메인 invariant: 누적 카운터라 음수는 논리 오류 (216 MR AI 리뷰 #2 후속).
        if (playDurationSeconds < 0) {
            throw new IllegalArgumentException("플레이 시간은 0 이상이어야 합니다.");
        }
        if (colorCount < 0) {
            throw new IllegalArgumentException("색 개수는 0 이상이어야 합니다.");
        }
        this.sketchCode = sketchCode;
        this.playDurationSeconds = playDurationSeconds;
        this.colorCount = colorCount;
        this.isPublic = isPublic;
    }

    /**
     * PATCH 시맨틱: {@code null} 인 인자는 "변경 없음" 으로 간주하고 기존 값을 유지한다. {@code sketchCode} / {@code
     * imageUrl} / {@code patientProfile} 은 본 메서드로 변경하지 않는다 (각각 고정 / 별도 메서드 / 도메인 정책).
     *
     * <p>{@code colorCount} 는 누적이 아닌 "이번 저장 시점 최종 색 개수" 절대값으로 교체한다 (FE 가 캔버스 전체 스캔 결과를 보냄). 음수 방어는
     * 빌더와 동일한 invariant 로 통일.
     */
    public void update(Boolean isPublic, Integer colorCount) {
        if (isPublic != null) {
            this.isPublic = isPublic;
        }
        if (colorCount != null) {
            if (colorCount < 0) {
                throw new IllegalArgumentException("색 개수는 0 이상이어야 합니다.");
            }
            this.colorCount = colorCount;
        }
    }

    /** 이미지 교체 — PATCH 시 새 이미지가 업로드된 경우 호출. 기존 URL 의 스토리지 파일 삭제는 호출자(service) 책임. */
    public void replaceImage(String newImageUrl) {
        this.imageUrl = newImageUrl;
    }

    /**
     * 누적 플레이 시간 더하기. 호출자 (수정 API) 가 받는 {@code additionalPlayDurationSeconds} 가 음수면 logic error 라
     * IllegalArgumentException.
     */
    public void addPlayDuration(int additionalSeconds) {
        if (additionalSeconds < 0) {
            throw new IllegalArgumentException("추가 플레이 시간은 0 이상이어야 합니다.");
        }
        this.playDurationSeconds += additionalSeconds;
    }

    /**
     * 주어진 사용자가 본 작품의 소유자인지 판단. {@code patientProfile.user.id} 와 비교한다.
     *
     * <p>{@code userId} 가 null 이면 (비로그인 등) 항상 false. {@code patientProfile} 또는 그 user 가 null 인 비정상
     * 상태도 안전하게 false (DB FK NOT NULL 이라 정상 흐름에선 발생 안 함 — 정합성 안전망).
     *
     * <p><b>LAZY fetch 주의 (N+1)</b>: {@code patientProfile} 과 그 안의 {@code user} 모두 LAZY 매핑이라, 영속성
     * 컨텍스트에서 분리된 {@code Artwork} 또는 명시적 fetch 없이 가져온 {@code Artwork} 에 대해 호출하면 user/patient 로딩
     * SELECT 가 추가 발생한다. 권한 체크를 다수 작품에 반복할 가능성이 있는 경로 (예: 비공개 갤러리 필터링) 에서는 호출 전에 {@code JOIN FETCH}
     * artwork.patientProfile.user 또는 {@code @EntityGraph} 로 미리 로딩해야 N+1 을 막는다. 단건 조회/수정/삭제는 추가 1 쿼리
     * 정도라 무시 가능.
     *
     * <p>권한 체크 컴포넌트 ({@link com.comong.backend.domain.artwork.service.ArtworkAccessChecker}) 가
     * 사용한다.
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
