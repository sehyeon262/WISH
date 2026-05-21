package com.comong.backend.domain.taekwondo.entity;

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

/**
 * 태권도 동작 마스터.
 *
 * <p>(poomsae, routine_order) 와 (poomsae, name) 두 유니크 제약을 가진다. routine_order 제약은 DB 에서 DEFERRABLE
 * INITIALLY DEFERRED 로 정의되어, 관리자 페이지에서 두 동작 순서를 swap 하는 PATCH 시나리오를 한 트랜잭션 안에서 허용한다.
 */
@Entity
@Getter
@Table(
        name = "taekwondo_motion",
        uniqueConstraints = {
            @UniqueConstraint(
                    name = "uk_taekwondo_motion_poomsae_routine_order",
                    columnNames = {"poomsae", "routine_order"}),
            @UniqueConstraint(
                    name = "uk_taekwondo_motion_poomsae_name",
                    columnNames = {"poomsae", "name"})
        })
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class TaekwondoMotion {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Poomsae poomsae;

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
    private TaekwondoMotion(
            Poomsae poomsae,
            String name,
            int routineOrder,
            int targetReps,
            String description,
            String demoVideoUrl,
            String thumbnailUrl) {
        this.poomsae = Objects.requireNonNull(poomsae, "poomsae must not be null");
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
     * <p>routine_order 는 (poomsae, routine_order) UNIQUE 제약이 DEFERRABLE INITIALLY DEFERRED 로 설정되어
     * 있어 같은 품새 안 두 동작 swap 도 한 트랜잭션 안에서 가능하다.
     *
     * <p>미디어 URL 은 별도 메서드 ({@link #replaceThumbnail} 등) 로 관리한다.
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

    /**
     * routine_order 만 단독 변경 (reorder 시 사용). (poomsae, routine_order) UNIQUE 제약이 DEFERRABLE
     * INITIALLY DEFERRED 라 트랜잭션 안에서 다수 행을 자유롭게 swap 할 수 있다.
     */
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
