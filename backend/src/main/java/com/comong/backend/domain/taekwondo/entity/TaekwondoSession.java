package com.comong.backend.domain.taekwondo.entity;

import java.time.LocalDateTime;
import java.util.Objects;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

import com.comong.backend.domain.patient.entity.PatientProfile;

import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 태권도 게임 세션 결과.
 *
 * <p>체조 {@code ExerciseSession} 과 같은 형태이지만 {@link #monstersDefeated} 추가 — 누적 처치수가 띠 승급 임계값과 비교된다.
 * score 같은 합성 지표는 두지 않고, 정확도는 AI {@code final_score(0~100)} 를 FE 가 /100 변환해서 보낸 0~1 값을 그대로 저장한다.
 */
@Entity
@Getter
@Table(name = "taekwondo_session")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class TaekwondoSession {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "patient_id", nullable = false)
    private PatientProfile patientProfile;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Poomsae poomsae;

    @Column(name = "duration_sec", nullable = false)
    private int durationSec;

    @Column(name = "average_accuracy", nullable = false)
    private double averageAccuracy;

    @Column(name = "completed_motion_count", nullable = false)
    private int completedMotionCount;

    @Column(name = "monsters_defeated", nullable = false)
    private int monstersDefeated;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Builder
    private TaekwondoSession(
            PatientProfile patientProfile,
            Poomsae poomsae,
            int durationSec,
            double averageAccuracy,
            int completedMotionCount,
            int monstersDefeated) {
        this.patientProfile =
                Objects.requireNonNull(patientProfile, "patientProfile must not be null");
        this.poomsae = Objects.requireNonNull(poomsae, "poomsae must not be null");
        validateNonNegative(durationSec, "durationSec");
        validateAccuracy(averageAccuracy, "averageAccuracy");
        validateNonNegative(completedMotionCount, "completedMotionCount");
        validateNonNegative(monstersDefeated, "monstersDefeated");
        this.durationSec = durationSec;
        this.averageAccuracy = averageAccuracy;
        this.completedMotionCount = completedMotionCount;
        this.monstersDefeated = monstersDefeated;
    }

    @PrePersist
    void prePersist() {
        this.createdAt = LocalDateTime.now();
    }

    public void recordMotion(
            int motionDurationSec, double motionAccuracy, int motionMonstersDefeated) {
        validateNonNegative(motionDurationSec, "motionDurationSec");
        validateAccuracy(motionAccuracy, "motionAccuracy");
        validateNonNegative(motionMonstersDefeated, "motionMonstersDefeated");
        double accuracySum = this.averageAccuracy * this.completedMotionCount + motionAccuracy;
        this.durationSec += motionDurationSec;
        this.completedMotionCount += 1;
        this.averageAccuracy = accuracySum / this.completedMotionCount;
        this.monstersDefeated += motionMonstersDefeated;
    }

    private void validateNonNegative(int value, String fieldName) {
        if (value < 0) {
            throw new IllegalArgumentException(fieldName + " must not be negative");
        }
    }

    private void validateAccuracy(double value, String fieldName) {
        if (value < 0.0 || value > 1.0) {
            throw new IllegalArgumentException(fieldName + " must be between 0.0 and 1.0");
        }
    }
}
