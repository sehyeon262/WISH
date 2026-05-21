package com.comong.backend.domain.music.entity;

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
@Table(name = "music_result")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class MusicResult {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "patient_profile_id", nullable = false)
    private PatientProfile patientProfile;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "music_chart_id", nullable = false)
    private MusicChart musicChart;

    @Column(nullable = false)
    private int score;

    @Column(name = "max_combo", nullable = false)
    private int maxCombo;

    @Column(name = "perfect_count", nullable = false)
    private int perfectCount;

    @Column(name = "great_count", nullable = false)
    private int greatCount;

    @Column(name = "good_count", nullable = false)
    private int goodCount;

    @Column(name = "miss_count", nullable = false)
    private int missCount;

    @Column(name = "total_notes", nullable = false)
    private int totalNotes;

    @Column(nullable = false)
    private double accuracy;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 1)
    private MusicRank rank;

    @Column(name = "played_duration_ms", nullable = false)
    private int playedDurationMs;

    @Column(name = "played_at", nullable = false, updatable = false)
    private LocalDateTime playedAt;

    @Column(name = "video_key", length = 1024)
    private String videoKey;

    @Column(name = "thumb_key", length = 1024)
    private String thumbKey;

    @Builder
    private MusicResult(
            PatientProfile patientProfile,
            MusicChart musicChart,
            int score,
            int maxCombo,
            int perfectCount,
            int greatCount,
            int goodCount,
            int missCount,
            int totalNotes,
            double accuracy,
            MusicRank rank,
            int playedDurationMs,
            String videoKey,
            String thumbKey) {
        this.patientProfile =
                Objects.requireNonNull(patientProfile, "patientProfile must not be null");
        this.musicChart = Objects.requireNonNull(musicChart, "musicChart must not be null");
        validateNonNegative(score, "score");
        validateNonNegative(maxCombo, "maxCombo");
        validateNonNegative(perfectCount, "perfectCount");
        validateNonNegative(greatCount, "greatCount");
        validateNonNegative(goodCount, "goodCount");
        validateNonNegative(missCount, "missCount");
        validatePositive(totalNotes, "totalNotes");
        validateAccuracy(accuracy, "accuracy");
        validateNonNegative(playedDurationMs, "playedDurationMs");
        this.score = score;
        this.maxCombo = maxCombo;
        this.perfectCount = perfectCount;
        this.greatCount = greatCount;
        this.goodCount = goodCount;
        this.missCount = missCount;
        this.totalNotes = totalNotes;
        this.accuracy = accuracy;
        this.rank = Objects.requireNonNull(rank, "rank must not be null");
        this.playedDurationMs = playedDurationMs;
        this.videoKey = videoKey;
        this.thumbKey = thumbKey;
    }

    @PrePersist
    void prePersist() {
        this.playedAt = LocalDateTime.now();
    }

    private void validateNonNegative(int value, String fieldName) {
        if (value < 0) {
            throw new IllegalArgumentException(fieldName + " must not be negative");
        }
    }

    private void validatePositive(int value, String fieldName) {
        if (value <= 0) {
            throw new IllegalArgumentException(fieldName + " must be positive");
        }
    }

    private void validateAccuracy(double value, String fieldName) {
        if (value < 0.0 || value > 1.0) {
            throw new IllegalArgumentException(fieldName + " must be between 0.0 and 1.0");
        }
    }
}
