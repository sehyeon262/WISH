package com.comong.backend.domain.music.entity;

import java.time.LocalDateTime;
import java.util.Objects;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Getter
@Table(
        name = "music_chart",
        uniqueConstraints = {
            @UniqueConstraint(name = "uk_music_chart_chart_id", columnNames = "chart_id")
        })
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class MusicChart {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "chart_id", nullable = false, length = 100)
    private String chartId;

    @Column(nullable = false, length = 100)
    private String title;

    @Column(nullable = false)
    private int bpm;

    @Column(name = "duration_ms", nullable = false)
    private int durationMs;

    @Column(name = "audio_url", nullable = false, length = 500)
    private String audioUrl;

    @Column(name = "cover_url", nullable = false, length = 500)
    private String coverUrl;

    @Column(name = "total_notes", nullable = false)
    private int totalNotes;

    @Column(name = "notes_json", columnDefinition = "TEXT")
    private String notesJson;

    @Column(name = "is_active", nullable = false)
    private boolean active;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Builder
    private MusicChart(
            String chartId,
            String title,
            int bpm,
            int durationMs,
            String audioUrl,
            String coverUrl,
            int totalNotes,
            String notesJson,
            boolean active) {
        this.chartId = Objects.requireNonNull(chartId, "chartId must not be null");
        this.title = Objects.requireNonNull(title, "title must not be null");
        validatePositive(bpm, "bpm");
        validatePositive(durationMs, "durationMs");
        this.bpm = bpm;
        this.durationMs = durationMs;
        this.audioUrl = Objects.requireNonNull(audioUrl, "audioUrl must not be null");
        this.coverUrl = Objects.requireNonNull(coverUrl, "coverUrl must not be null");
        validatePositive(totalNotes, "totalNotes");
        this.totalNotes = totalNotes;
        this.notesJson = notesJson;
        this.active = active;
    }

    @PrePersist
    void prePersist() {
        this.createdAt = LocalDateTime.now();
    }

    private void validatePositive(int value, String fieldName) {
        if (value <= 0) {
            throw new IllegalArgumentException(fieldName + " must be positive");
        }
    }
}
