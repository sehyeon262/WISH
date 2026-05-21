package com.comong.backend.domain.gomoku.entity;

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
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import com.comong.backend.domain.patient.entity.PatientProfile;

import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Getter
@Table(
        name = "gomoku_matches",
        uniqueConstraints = {
            @UniqueConstraint(name = "uk_gomoku_matches_room_code", columnNames = "room_code")
        })
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class GomokuMatch {

    private static final String DEFAULT_TEXTURE_KEY = "character";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "room_code", nullable = false, length = 12)
    private String roomCode;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "black_patient_profile_id", nullable = false)
    private PatientProfile blackPatientProfile;

    @Column(name = "black_texture_key", nullable = false, length = 80)
    private String blackTextureKey;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "white_patient_profile_id")
    private PatientProfile whitePatientProfile;

    @Column(name = "white_texture_key", length = 80)
    private String whiteTextureKey;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private GomokuMatchStatus status;

    @Enumerated(EnumType.STRING)
    @Column(name = "rule_set", nullable = false, length = 20)
    private GomokuRuleSet ruleSet;

    @Column(name = "timer_seconds", nullable = false)
    private int timerSeconds;

    @Enumerated(EnumType.STRING)
    @Column(name = "current_turn", nullable = false, length = 10)
    private GomokuStone currentTurn;

    @Enumerated(EnumType.STRING)
    @Column(length = 20)
    private GomokuMatchResult result;

    @Enumerated(EnumType.STRING)
    @Column(name = "end_reason", length = 20)
    private GomokuEndReason endReason;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "winner_patient_profile_id")
    private PatientProfile winnerPatientProfile;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "rematch_source_match_id")
    private GomokuMatch rematchSourceMatch;

    @Column(name = "black_last_seen_at")
    private LocalDateTime blackLastSeenAt;

    @Column(name = "white_last_seen_at")
    private LocalDateTime whiteLastSeenAt;

    @Column(name = "move_count", nullable = false)
    private int moveCount;

    @Column(name = "moves_json", nullable = false, columnDefinition = "TEXT")
    private String movesJson;

    @Column(nullable = false)
    private boolean ranked;

    @Column(name = "started_at")
    private LocalDateTime startedAt;

    @Column(name = "finished_at")
    private LocalDateTime finishedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @Builder
    private GomokuMatch(
            String roomCode,
            PatientProfile blackPatientProfile,
            String blackTextureKey,
            PatientProfile whitePatientProfile,
            String whiteTextureKey,
            GomokuRuleSet ruleSet,
            int timerSeconds,
            GomokuMatch rematchSourceMatch) {
        this.roomCode = Objects.requireNonNull(roomCode, "roomCode must not be null");
        this.blackPatientProfile =
                Objects.requireNonNull(blackPatientProfile, "blackPatientProfile must not be null");
        this.blackTextureKey = normalizeTextureKey(blackTextureKey);
        this.whitePatientProfile = whitePatientProfile;
        this.whiteTextureKey =
                whitePatientProfile == null ? null : normalizeTextureKey(whiteTextureKey);
        this.ruleSet = Objects.requireNonNull(ruleSet, "ruleSet must not be null");
        this.timerSeconds = timerSeconds;
        this.rematchSourceMatch = rematchSourceMatch;
        this.status = GomokuMatchStatus.WAITING;
        this.currentTurn = GomokuStone.BLACK;
        this.movesJson = "[]";
        this.moveCount = 0;
        this.ranked = false;
    }

    public void joinAsWhite(PatientProfile patientProfile, String textureKey) {
        this.whitePatientProfile =
                Objects.requireNonNull(patientProfile, "patientProfile must not be null");
        this.whiteTextureKey = normalizeTextureKey(textureKey);
        this.whiteLastSeenAt = LocalDateTime.now();
    }

    public void start() {
        this.status = GomokuMatchStatus.PLAYING;
        this.currentTurn = GomokuStone.BLACK;
        this.startedAt = LocalDateTime.now();
    }

    public void removeWhiteBeforeStart() {
        this.whitePatientProfile = null;
        this.whiteTextureKey = null;
        this.whiteLastSeenAt = null;
    }

    public void swapPlayersBeforeStart() {
        PatientProfile previousBlackPatientProfile = this.blackPatientProfile;
        String previousBlackTextureKey = this.blackTextureKey;
        LocalDateTime previousBlackLastSeenAt = this.blackLastSeenAt;

        this.blackPatientProfile =
                Objects.requireNonNull(
                        this.whitePatientProfile, "whitePatientProfile must not be null");
        this.blackTextureKey = normalizeTextureKey(this.whiteTextureKey);
        this.blackLastSeenAt = this.whiteLastSeenAt;
        this.whitePatientProfile = previousBlackPatientProfile;
        this.whiteTextureKey = normalizeTextureKey(previousBlackTextureKey);
        this.whiteLastSeenAt = previousBlackLastSeenAt;
        this.currentTurn = GomokuStone.BLACK;
    }

    public void markSeen(Long patientProfileId) {
        LocalDateTime now = LocalDateTime.now();
        if (blackPatientProfile.getId().equals(patientProfileId)) {
            this.blackLastSeenAt = now;
            this.updatedAt = now;
            return;
        }
        if (whitePatientProfile != null && whitePatientProfile.getId().equals(patientProfileId)) {
            this.whiteLastSeenAt = now;
            this.updatedAt = now;
        }
    }

    public void applyMove(String movesJson, GomokuStone nextTurn, int moveCount) {
        this.movesJson = Objects.requireNonNull(movesJson, "movesJson must not be null");
        this.currentTurn = Objects.requireNonNull(nextTurn, "nextTurn must not be null");
        this.moveCount = moveCount;
    }

    public void finish(
            String movesJson,
            int moveCount,
            GomokuMatchResult result,
            GomokuEndReason endReason,
            PatientProfile winnerPatientProfile) {
        this.movesJson = Objects.requireNonNull(movesJson, "movesJson must not be null");
        this.moveCount = moveCount;
        this.result = Objects.requireNonNull(result, "result must not be null");
        this.endReason = Objects.requireNonNull(endReason, "endReason must not be null");
        this.winnerPatientProfile = winnerPatientProfile;
        this.status = GomokuMatchStatus.FINISHED;
        this.finishedAt = LocalDateTime.now();
        this.ranked = this.whitePatientProfile != null;
    }

    public void cancel(GomokuEndReason endReason) {
        this.status = GomokuMatchStatus.CANCELLED;
        this.endReason = Objects.requireNonNull(endReason, "endReason must not be null");
        this.finishedAt = LocalDateTime.now();
        this.ranked = false;
    }

    public PatientProfile patientForStone(GomokuStone stone) {
        return stone == GomokuStone.BLACK ? blackPatientProfile : whitePatientProfile;
    }

    public String textureKeyOf(PatientProfile patientProfile) {
        if (patientProfile == null) {
            return null;
        }
        if (blackPatientProfile.getId().equals(patientProfile.getId())) {
            return blackTextureKey;
        }
        if (whitePatientProfile != null
                && whitePatientProfile.getId().equals(patientProfile.getId())) {
            return whiteTextureKey;
        }
        return DEFAULT_TEXTURE_KEY;
    }

    public GomokuStone stoneOf(Long patientProfileId) {
        if (blackPatientProfile.getId().equals(patientProfileId)) {
            return GomokuStone.BLACK;
        }
        if (whitePatientProfile != null && whitePatientProfile.getId().equals(patientProfileId)) {
            return GomokuStone.WHITE;
        }
        return null;
    }

    @PrePersist
    void prePersist() {
        LocalDateTime now = LocalDateTime.now();
        this.createdAt = now;
        this.updatedAt = now;
        if (this.blackLastSeenAt == null) {
            this.blackLastSeenAt = now;
        }
        if (this.whitePatientProfile != null && this.whiteLastSeenAt == null) {
            this.whiteLastSeenAt = now;
        }
    }

    @PreUpdate
    void preUpdate() {
        this.updatedAt = LocalDateTime.now();
    }

    private String normalizeTextureKey(String textureKey) {
        return textureKey == null || textureKey.isBlank() ? DEFAULT_TEXTURE_KEY : textureKey;
    }
}
