package com.comong.backend.domain.exercise.entity;

import java.time.LocalDateTime;
import java.util.Objects;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Getter
@Table(
        name = "exercise_motion",
        uniqueConstraints = {
            @UniqueConstraint(
                    name = "uk_exercise_motion_exercise_type_routine_order",
                    columnNames = {"exercise_type", "routine_order"})
        })
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ExerciseMotion {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Enumerated(EnumType.STRING)
    @Column(name = "exercise_type", nullable = false, length = 20)
    private ExerciseType exerciseType;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(name = "routine_order", nullable = false)
    private int routineOrder;

    @Column(name = "target_reps", nullable = false)
    private int targetReps;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String description;

    @Column(name = "demo_video_url", length = 500)
    private String demoVideoUrl;

    @Column(name = "thumbnail_url", length = 500)
    private String thumbnailUrl;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @Builder
    private ExerciseMotion(
            ExerciseType exerciseType,
            String name,
            int routineOrder,
            int targetReps,
            String description,
            String demoVideoUrl,
            String thumbnailUrl) {
        this.exerciseType = Objects.requireNonNull(exerciseType, "exerciseType must not be null");
        this.name = Objects.requireNonNull(name, "name must not be null");
        validatePositive(routineOrder, "routineOrder");
        validatePositive(targetReps, "targetReps");
        this.routineOrder = routineOrder;
        this.targetReps = targetReps;
        this.description = Objects.requireNonNull(description, "description must not be null");
        this.demoVideoUrl = demoVideoUrl;
        this.thumbnailUrl = thumbnailUrl;
    }

    /**
     * 메타데이터(텍스트) 와 routine_order 부분 갱신.
     *
     * <p>routine_order 는 DB 에서 DEFERRABLE INITIALLY DEFERRED 유니크 제약으로 관리한다. 미디어 URL 은 {@link
     * #replaceThumbnail}/{@link #clearThumbnail} 등 별도 메서드.
     */
    public void updateMetadata(
            String name, Integer routineOrder, Integer targetReps, String description) {
        if (name != null) {
            this.name = name;
        }
        if (routineOrder != null) {
            validatePositive(routineOrder, "routineOrder");
            this.routineOrder = routineOrder;
        }
        if (targetReps != null) {
            validatePositive(targetReps, "targetReps");
            this.targetReps = targetReps;
        }
        if (description != null) {
            this.description = description;
        }
    }

    public void changeRoutineOrder(int routineOrder) {
        validatePositive(routineOrder, "routineOrder");
        this.routineOrder = routineOrder;
    }

    public void replaceThumbnail(String url) {
        this.thumbnailUrl = Objects.requireNonNull(url, "url must not be null");
    }

    public void clearThumbnail() {
        this.thumbnailUrl = null;
    }

    public void replaceDemoVideo(String url) {
        this.demoVideoUrl = Objects.requireNonNull(url, "url must not be null");
    }

    public void clearDemoVideo() {
        this.demoVideoUrl = null;
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

    private void validatePositive(int value, String fieldName) {
        if (value <= 0) {
            throw new IllegalArgumentException(fieldName + " must be positive");
        }
    }
}
