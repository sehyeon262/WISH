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
import jakarta.persistence.UniqueConstraint;

import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import com.comong.backend.domain.dialogue.catalog.model.ChoiceTone;
import com.comong.backend.domain.dialogue.catalog.model.ChoiceValence;
import com.comong.backend.domain.dialogue.catalog.model.SentimentWord;

import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 대화 세션 내 한 턴(질문 + 아이의 선택).
 *
 * <p>BE 카탈로그(JSON) 기반으로 채워지는 메타 ({@code valence}, {@code tone}, {@code topicKeywords}, {@code
 * sentimentWords}) 는 V31 이후 신규 turn 에 적재된다. V21 시점의 기존 turn 은 valence/tone 이 null 일 수 있다 (마이그레이션
 * backfill 안 함 — 카탈로그가 갖춰지지 않은 시점의 데이터라).
 */
@Entity
@Getter
@Table(
        name = "dialogue_turns",
        uniqueConstraints =
                @UniqueConstraint(
                        name = "uk_dialogue_turn_session_step",
                        columnNames = {"session_id", "step_index"}))
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class DialogueTurn {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "session_id", nullable = false)
    private DialogueSession session;

    @Column(name = "step_index", nullable = false)
    private int stepIndex;

    @Column(name = "question_text", nullable = false, columnDefinition = "text")
    private String questionText;

    @Column(name = "choice_intent_id", nullable = false, length = 64)
    private String choiceIntentId;

    @Column(name = "choice_text", nullable = false, columnDefinition = "text")
    private String choiceText;

    @Column(name = "npc_response_text", columnDefinition = "text")
    private String npcResponseText;

    @Column(nullable = false)
    private short intensity;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "concern_flags", nullable = false, columnDefinition = "jsonb")
    private List<String> concernFlags;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "protective_factors", nullable = false, columnDefinition = "jsonb")
    private List<String> protectiveFactors;

    @Enumerated(EnumType.STRING)
    @Column(name = "valence", length = 16)
    private ChoiceValence valence;

    @Enumerated(EnumType.STRING)
    @Column(name = "tone", length = 16)
    private ChoiceTone tone;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "topic_keywords", nullable = false, columnDefinition = "jsonb")
    private List<String> topicKeywords;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "sentiment_words", nullable = false, columnDefinition = "jsonb")
    private List<SentimentWord> sentimentWords;

    @Enumerated(EnumType.STRING)
    @Column(name = "generated_by", nullable = false, length = 16)
    private DialogueTurnGeneratedBy generatedBy;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Builder
    private DialogueTurn(
            DialogueSession session,
            int stepIndex,
            String questionText,
            String choiceIntentId,
            String choiceText,
            String npcResponseText,
            short intensity,
            List<String> concernFlags,
            List<String> protectiveFactors,
            ChoiceValence valence,
            ChoiceTone tone,
            List<String> topicKeywords,
            List<SentimentWord> sentimentWords,
            DialogueTurnGeneratedBy generatedBy) {
        this.session = Objects.requireNonNull(session, "session must not be null");
        if (stepIndex < 0) {
            throw new IllegalArgumentException("stepIndex must not be negative");
        }
        this.questionText = Objects.requireNonNull(questionText, "questionText must not be null");
        this.choiceIntentId =
                Objects.requireNonNull(choiceIntentId, "choiceIntentId must not be null");
        this.choiceText = Objects.requireNonNull(choiceText, "choiceText must not be null");
        this.npcResponseText =
                npcResponseText == null || npcResponseText.isBlank() ? null : npcResponseText;
        if (intensity < 0 || intensity > 3) {
            throw new IllegalArgumentException("intensity must be in [0, 3]");
        }
        this.concernFlags = Objects.requireNonNull(concernFlags, "concernFlags must not be null");
        this.protectiveFactors =
                Objects.requireNonNull(protectiveFactors, "protectiveFactors must not be null");
        this.topicKeywords = topicKeywords == null ? List.of() : List.copyOf(topicKeywords);
        this.sentimentWords = sentimentWords == null ? List.of() : List.copyOf(sentimentWords);
        this.valence = valence;
        this.tone = tone;
        this.generatedBy = Objects.requireNonNull(generatedBy, "generatedBy must not be null");
        this.stepIndex = stepIndex;
        this.intensity = intensity;
    }

    @PrePersist
    void prePersist() {
        this.createdAt = LocalDateTime.now();
    }
}
