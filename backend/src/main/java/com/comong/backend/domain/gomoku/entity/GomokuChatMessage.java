package com.comong.backend.domain.gomoku.entity;

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

import com.comong.backend.domain.patient.entity.PatientProfile;

import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Getter
@Table(name = "gomoku_chat_messages")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class GomokuChatMessage {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "match_id", nullable = false)
    private GomokuMatch match;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "sender_patient_profile_id", nullable = false)
    private PatientProfile senderPatientProfile;

    @Column(nullable = false, length = 200)
    private String content;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Builder
    private GomokuChatMessage(
            GomokuMatch match, PatientProfile senderPatientProfile, String content) {
        this.match = Objects.requireNonNull(match, "match must not be null");
        this.senderPatientProfile =
                Objects.requireNonNull(
                        senderPatientProfile, "senderPatientProfile must not be null");
        this.content = Objects.requireNonNull(content, "content must not be null");
    }

    @PrePersist
    void prePersist() {
        this.createdAt = LocalDateTime.now();
    }
}
