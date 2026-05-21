package com.comong.backend.domain.fuel.entity;

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
import com.comong.backend.domain.user.entity.User;

import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Getter
@Table(name = "fuel_event")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class FuelEvent {

    public static final int MIN_AMOUNT = 1;
    public static final int MAX_AMOUNT = 100;
    public static final int MAX_MESSAGE_LENGTH = 100;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "patient_id", nullable = false)
    private PatientProfile patient;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "sender_id", nullable = false)
    private User sender;

    @Column(nullable = false)
    private int amount;

    @Column(nullable = false, length = MAX_MESSAGE_LENGTH)
    private String message;

    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column private LocalDateTime consumedAt;

    @Builder
    private FuelEvent(PatientProfile patient, User sender, int amount, String message) {
        this.patient = Objects.requireNonNull(patient, "patient must not be null");
        this.sender = Objects.requireNonNull(sender, "sender must not be null");
        if (amount < MIN_AMOUNT || amount > MAX_AMOUNT) {
            throw new IllegalArgumentException("amount must be between 1 and 100");
        }
        this.amount = amount;
        this.message = validateMessage(message);
    }

    @PrePersist
    void prePersist() {
        this.createdAt = LocalDateTime.now();
    }

    public void consume(LocalDateTime now) {
        Objects.requireNonNull(now, "now must not be null");
        if (consumedAt == null) {
            consumedAt = now;
        }
    }

    private static String validateMessage(String value) {
        String trimmed = Objects.requireNonNull(value, "message must not be null").trim();
        if (trimmed.isEmpty()) {
            throw new IllegalArgumentException("message must not be blank");
        }
        if (trimmed.length() > MAX_MESSAGE_LENGTH) {
            throw new IllegalArgumentException("message must be 100 characters or fewer");
        }
        return trimmed;
    }
}
