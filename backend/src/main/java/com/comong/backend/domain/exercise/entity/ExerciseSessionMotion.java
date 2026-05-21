package com.comong.backend.domain.exercise.entity;

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

@Entity
@Getter
@Table(name = "exercise_session_motion")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ExerciseSessionMotion {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "session_id", nullable = false)
    private ExerciseSession session;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "exercise_motion_id", nullable = false)
    private ExerciseMotion exerciseMotion;

    @Column(name = "duration_sec", nullable = false)
    private int durationSec;

    @Column(nullable = false)
    private double accuracy;

    @Column(name = "completed_reps", nullable = false)
    private int completedReps;

    @Column(nullable = false, length = 255)
    private String feedback;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "performance_video_id")
    private PerformanceVideo performanceVideo;

    @Column(name = "pose_replay", columnDefinition = "TEXT")
    private String poseReplay;

    @Column(name = "compact_pose_replay", columnDefinition = "TEXT")
    private String compactPoseReplay;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Builder
    private ExerciseSessionMotion(
            ExerciseSession session,
            ExerciseMotion exerciseMotion,
            int durationSec,
            double accuracy,
            int completedReps,
            String feedback,
            PerformanceVideo performanceVideo,
            String poseReplay,
            String compactPoseReplay) {
        this.session = Objects.requireNonNull(session, "session must not be null");
        this.exerciseMotion =
                Objects.requireNonNull(exerciseMotion, "exerciseMotion must not be null");
        validateExerciseType(session, exerciseMotion);
        validateNonNegative(durationSec, "durationSec");
        validateAccuracy(accuracy);
        validateNonNegative(completedReps, "completedReps");
        this.durationSec = durationSec;
        this.accuracy = accuracy;
        this.completedReps = completedReps;
        this.feedback = Objects.requireNonNull(feedback, "feedback must not be null");
        this.performanceVideo = performanceVideo;
        this.poseReplay = normalizeNullableText(poseReplay);
        this.compactPoseReplay = normalizeNullableText(compactPoseReplay);
    }

    public boolean hasPoseReplay() {
        return (poseReplay != null && !poseReplay.isBlank())
                || (compactPoseReplay != null && !compactPoseReplay.isBlank());
    }

    @PrePersist
    void prePersist() {
        this.createdAt = LocalDateTime.now();
    }

    private void validateExerciseType(ExerciseSession session, ExerciseMotion exerciseMotion) {
        if (session.getExerciseType() != exerciseMotion.getExerciseType()) {
            throw new IllegalArgumentException(
                    "session and exerciseMotion exerciseType must match");
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

    private String normalizeNullableText(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value;
    }
}
