package com.comong.backend.domain.exercise.entity;

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

@Entity
@Getter
@Table(name = "exercise_session")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ExerciseSession {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "patient_id", nullable = false)
    private PatientProfile patientProfile;

    @Enumerated(EnumType.STRING)
    @Column(name = "exercise_type", nullable = false, length = 20)
    private ExerciseType exerciseType;

    @Column(name = "duration_sec", nullable = false)
    private int durationSec;

    @Column(name = "average_accuracy", nullable = false)
    private double averageAccuracy;

    @Column(name = "completed_motion_count", nullable = false)
    private int completedMotionCount;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Builder
    private ExerciseSession(
            PatientProfile patientProfile,
            ExerciseType exerciseType,
            int durationSec,
            double averageAccuracy,
            int completedMotionCount) {
        this.patientProfile =
                Objects.requireNonNull(patientProfile, "patientProfile must not be null");
        this.exerciseType = Objects.requireNonNull(exerciseType, "exerciseType must not be null");
        validateNonNegative(durationSec, "durationSec");
        validateAccuracy(averageAccuracy, "averageAccuracy");
        validateNonNegative(completedMotionCount, "completedMotionCount");
        this.durationSec = durationSec;
        this.averageAccuracy = averageAccuracy;
        this.completedMotionCount = completedMotionCount;
    }

    @PrePersist
    void prePersist() {
        this.createdAt = LocalDateTime.now();
    }

    public void recordMotion(int motionDurationSec, double motionAccuracy) {
        validateNonNegative(motionDurationSec, "motionDurationSec");
        validateAccuracy(motionAccuracy, "motionAccuracy");
        double accuracySum = this.averageAccuracy * this.completedMotionCount + motionAccuracy;
        this.durationSec += motionDurationSec;
        this.completedMotionCount += 1;
        this.averageAccuracy = accuracySum / this.completedMotionCount;
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
