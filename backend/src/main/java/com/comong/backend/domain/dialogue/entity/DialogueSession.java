package com.comong.backend.domain.dialogue.entity;

import java.time.LocalDateTime;
import java.util.List;
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

import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import com.comong.backend.domain.dialogue.catalog.model.ChoiceTone;
import com.comong.backend.domain.dialogue.catalog.model.ChoiceValence;
import com.comong.backend.domain.patient.entity.PatientProfile;

import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * NPC 와의 한 차례 대화 세션. 등대지기(LLM) / 마을 주민(정적 스크립트) 모두 동일 스키마로 저장한다.
 *
 * <p>턴(질문 → 선택)은 {@link DialogueTurn} 으로 분리되며 {@code (session_id, step_index)} UNIQUE 가 idempotency
 * 를 DB 레벨에서 보장한다.
 */
@Entity
@Getter
@Table(name = "dialogue_sessions")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class DialogueSession {

    private static final int DEFAULT_MAX_STEPS = 3;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "patient_profile_id", nullable = false)
    private PatientProfile patientProfile;

    @Enumerated(EnumType.STRING)
    @Column(name = "npc_name", nullable = false, length = 32)
    private NpcName npcName;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private DialogueStatus status;

    @Column(name = "step_count", nullable = false)
    private int stepCount;

    @Column(name = "max_steps", nullable = false)
    private int maxSteps;

    /**
     * 마을 NPC 의 경우 세션 시작 시 BE 가 선택한 dialogue 카탈로그 scriptId. 같은 NPC 를 재방문할 때 "안 본 script 우선" 정책의 기준이
     * 된다. 등대지기는 카탈로그 미사용이라 null.
     */
    @Column(name = "script_id", length = 64)
    private String scriptId;

    @Enumerated(EnumType.STRING)
    @Column(name = "finish_reason", length = 32)
    private DialogueFinishReason finishReason;

    @Column(name = "started_at", nullable = false, updatable = false)
    private LocalDateTime startedAt;

    @Column(name = "ended_at")
    private LocalDateTime endedAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "emotion_valence", length = 16)
    private ChoiceValence emotionValence;

    @Enumerated(EnumType.STRING)
    @Column(name = "emotion_tone", length = 16)
    private ChoiceTone emotionTone;

    @Column(name = "emotion_intensity")
    private Short emotionIntensity;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "emotion_concern_flags", nullable = false, columnDefinition = "jsonb")
    private List<String> emotionConcernFlags = List.of();

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "emotion_protective_factors", nullable = false, columnDefinition = "jsonb")
    private List<String> emotionProtectiveFactors = List.of();

    @Column(name = "guardian_message", columnDefinition = "text")
    private String guardianMessage;

    @Column(name = "emotion_analyzed_at")
    private LocalDateTime emotionAnalyzedAt;

    @Builder
    private DialogueSession(
            PatientProfile patientProfile, NpcName npcName, Integer maxSteps, String scriptId) {
        this.patientProfile =
                Objects.requireNonNull(patientProfile, "patientProfile must not be null");
        this.npcName = Objects.requireNonNull(npcName, "npcName must not be null");
        int resolvedMaxSteps = maxSteps != null ? maxSteps : DEFAULT_MAX_STEPS;
        if (resolvedMaxSteps <= 0) {
            throw new IllegalArgumentException("maxSteps must be positive");
        }
        this.maxSteps = resolvedMaxSteps;
        this.scriptId = scriptId;
        this.status = DialogueStatus.IN_PROGRESS;
        this.stepCount = 0;
    }

    @PrePersist
    void prePersist() {
        this.startedAt = LocalDateTime.now();
    }

    /**
     * 세션을 정상 종료한다. {@link DialogueStatus#IN_PROGRESS} 상태에서만 호출 가능하며 그 외 상태에선 {@link
     * IllegalStateException} 을 던진다.
     */
    public void finish(DialogueFinishReason reason) {
        Objects.requireNonNull(reason, "reason must not be null");
        requireInProgress();
        this.status = DialogueStatus.FINISHED;
        this.finishReason = reason;
        this.endedAt = LocalDateTime.now();
    }

    /**
     * 세션을 비정상 포기한다 (예: 클라이언트 이탈, 타임아웃 batch). {@link DialogueStatus#IN_PROGRESS} 에서만 호출 가능. {@link
     * #finishReason} 은 부여하지 않는다 — 사유 미상 케이스이므로.
     */
    public void abandon() {
        requireInProgress();
        this.status = DialogueStatus.ABANDONED;
        this.endedAt = LocalDateTime.now();
    }

    /**
     * 새로운 턴이 적재되는 시점에 호출. {@link #stepCount} 를 1 증가시키며 {@link #maxSteps} 를 초과하지 못한다는 도메인 불변식을 강제한다
     * (DB CHECK 와 같은 룰을 in-memory 에서 fail-fast).
     */
    public void incrementStepCount() {
        requireInProgress();
        if (stepCount >= maxSteps) {
            throw new IllegalStateException(
                    "stepCount cannot exceed maxSteps (current="
                            + stepCount
                            + ", max="
                            + maxSteps
                            + ")");
        }
        this.stepCount += 1;
    }

    /** 다음 턴이 들어오면 종료해야 하는 상태인지 (= 마지막 step 이 적재된 상태). */
    public boolean isAtMaxSteps() {
        return stepCount >= maxSteps;
    }

    public void applyEmotionSummary(
            ChoiceValence valence,
            ChoiceTone tone,
            short intensity,
            List<String> concernFlags,
            List<String> protectiveFactors,
            String guardianMessage,
            LocalDateTime analyzedAt) {
        Objects.requireNonNull(valence, "valence must not be null");
        Objects.requireNonNull(tone, "tone must not be null");
        if (intensity < 0 || intensity > 3) {
            throw new IllegalArgumentException("intensity must be in [0, 3]");
        }
        this.emotionValence = valence;
        this.emotionTone = tone;
        this.emotionIntensity = intensity;
        this.emotionConcernFlags = concernFlags == null ? List.of() : List.copyOf(concernFlags);
        this.emotionProtectiveFactors =
                protectiveFactors == null ? List.of() : List.copyOf(protectiveFactors);
        this.guardianMessage =
                guardianMessage == null || guardianMessage.isBlank() ? null : guardianMessage;
        this.emotionAnalyzedAt = analyzedAt == null ? LocalDateTime.now() : analyzedAt;
    }

    private void requireInProgress() {
        if (status != DialogueStatus.IN_PROGRESS) {
            throw new IllegalStateException("session must be IN_PROGRESS but is " + status);
        }
    }
}
