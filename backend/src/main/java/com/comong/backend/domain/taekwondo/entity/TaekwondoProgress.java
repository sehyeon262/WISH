package com.comong.backend.domain.taekwondo.entity;

import java.time.LocalDateTime;
import java.util.Objects;
import java.util.Optional;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import com.comong.backend.domain.patient.entity.PatientProfile;

import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 환자별 태권도 진행 상태 스냅샷 (1:1).
 *
 * <p>현재 띠와 누적 카운터를 들고 있다. 환자의 첫 동작 저장 시점에 lazy 로 INSERT 되며 ({@link #firstSession}), 이후 매 동작 저장 트랜잭션
 * 안에서 {@link #applyMotion} 으로 누적값이 갱신된다. 승급 판정/적용은 서비스 레이어가 {@link Belt#canPromoteWith(int)} 와
 * {@link #promote} 를 조합하여 진행한다.
 */
@Entity
@Getter
@Table(
        name = "taekwondo_progress",
        uniqueConstraints = {
            @UniqueConstraint(name = "uk_taekwondo_progress_patient", columnNames = "patient_id")
        })
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class TaekwondoProgress {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "patient_id", nullable = false)
    private PatientProfile patientProfile;

    @Enumerated(EnumType.STRING)
    @Column(name = "current_belt", nullable = false, length = 20)
    private Belt currentBelt;

    @Column(name = "total_monsters_defeated", nullable = false)
    private int totalMonstersDefeated;

    @Column(name = "session_count", nullable = false)
    private int sessionCount;

    @Column(name = "last_promoted_at")
    private LocalDateTime lastPromotedAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    private TaekwondoProgress(PatientProfile patientProfile) {
        this.patientProfile =
                Objects.requireNonNull(patientProfile, "patientProfile must not be null");
        this.currentBelt = Belt.WHITE;
        this.totalMonstersDefeated = 0;
        this.sessionCount = 0;
        this.lastPromotedAt = null;
    }

    /** 환자의 첫 태권도 세션 시점에 lazy 로 생성되는 진행 상태 (흰 띠 + 누적 0). */
    public static TaekwondoProgress firstSession(PatientProfile patientProfile) {
        return new TaekwondoProgress(patientProfile);
    }

    /**
     * 한 동작 결과를 누적 카운터에 반영. 동작 단위 저장으로 전환되어, monsters 누적은 매 동작마다 일어나지만 sessionCount 는 세션의 첫 동작 저장
     * 시점에만 1 증가한다 — 빈 세션만 만들고 아무 동작도 안 한 경우는 시도로 치지 않는다. 승급 판정은 호출자가 별도로 수행한다.
     */
    public void applyMotion(int motionMonstersDefeated, boolean firstMotionOfSession) {
        if (motionMonstersDefeated < 0) {
            throw new IllegalArgumentException("motionMonstersDefeated must not be negative");
        }
        this.totalMonstersDefeated += motionMonstersDefeated;
        if (firstMotionOfSession) {
            this.sessionCount += 1;
        }
    }

    /**
     * 다음 단계 띠로 승급. 호출 전 누적 처치수가 다음 띠 임계값을 만족하는지 자체 재검증한다 (Race Condition 방어: 호출자 권한 검사 이후 다른 트랜잭션이
     * 동일 progress 를 갱신하더라도 현재 상태로 재판정).
     *
     * @return 승급 직전의 이전 띠 (BeltHistory.fromBelt 적재용)
     * @throws IllegalStateException 다음 띠가 없거나 임계값 미달 시
     */
    public Belt promote() {
        if (!this.currentBelt.canPromoteWith(this.totalMonstersDefeated)) {
            throw new IllegalStateException(
                    "cannot promote: totalMonstersDefeated does not satisfy next belt requirement");
        }
        Belt previousBelt = this.currentBelt;
        Belt nextBelt = this.currentBelt.next().orElseThrow();
        this.currentBelt = nextBelt;
        this.lastPromotedAt = LocalDateTime.now();
        return previousBelt;
    }

    public Optional<LocalDateTime> getLastPromotedAt() {
        return Optional.ofNullable(lastPromotedAt);
    }

    @PrePersist
    void prePersist() {
        this.updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    void preUpdate() {
        this.updatedAt = LocalDateTime.now();
    }
}
