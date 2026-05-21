package com.comong.backend.domain.taekwondo.entity;

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
import jakarta.persistence.Table;

import com.comong.backend.domain.performance.entity.PerformanceVideo;

import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 태권도 세션 안 동작별 결과. 체조 {@code ExerciseSessionMotion} 과 동일 구조.
 *
 * <p>세션과 동작의 {@link Poomsae} 가 일치하는지 빌드 시 검증한다 (TK-004).
 */
@Entity
@Getter
@Table(name = "taekwondo_session_motion")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class TaekwondoSessionMotion {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "session_id", nullable = false)
    private TaekwondoSession session;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "motion_id", nullable = false)
    private TaekwondoMotion motion;

    @Column(name = "duration_sec", nullable = false)
    private int durationSec;

    @Column(nullable = false)
    private double accuracy;

    @Column(name = "completed_reps", nullable = false)
    private int completedReps;

    @Column(nullable = false, length = 255)
    private String feedback;

    @Column(name = "monsters_defeated", nullable = false)
    private int monstersDefeated;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "performance_video_id")
    private PerformanceVideo performanceVideo;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Builder
    private TaekwondoSessionMotion(
            TaekwondoSession session,
            TaekwondoMotion motion,
            int durationSec,
            double accuracy,
            int completedReps,
            String feedback,
            int monstersDefeated,
            PerformanceVideo performanceVideo) {
        this.session = Objects.requireNonNull(session, "session must not be null");
        this.motion = Objects.requireNonNull(motion, "motion must not be null");
        validatePoomsae(session, motion);
        validateNonNegative(durationSec, "durationSec");
        validateAccuracy(accuracy);
        validateNonNegative(completedReps, "completedReps");
        validateNonNegative(monstersDefeated, "monstersDefeated");
        this.durationSec = durationSec;
        this.accuracy = accuracy;
        this.completedReps = completedReps;
        this.feedback = Objects.requireNonNull(feedback, "feedback must not be null");
        this.monstersDefeated = monstersDefeated;
        this.performanceVideo = performanceVideo;
    }

    @PrePersist
    void prePersist() {
        this.createdAt = LocalDateTime.now();
    }

    private void validatePoomsae(TaekwondoSession session, TaekwondoMotion motion) {
        if (session.getPoomsae() != motion.getPoomsae()) {
            throw new IllegalArgumentException("session and motion poomsae must match");
        }
    }

    private void validateNonNegative(int value, String fieldName) {
        if (value < 0) {
            throw new IllegalArgumentException(fieldName + " must not be negative");
        }
    }

    private void validateAccuracy(double value) {
        if (value < 0.0 || value > 1.0) {
            throw new IllegalArgumentException("accuracy must be between 0.0 and 1.0");
        }
    }
}
