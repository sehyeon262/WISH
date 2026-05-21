package com.comong.backend.domain.taekwondo.entity;

import java.time.LocalDateTime;
import java.util.Objects;
import java.util.Optional;

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
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 태권도 띠 승급 이벤트 로그 (환자별 1:N).
 *
 * <p>{@link #fromBelt} 가 {@code null} 이면 첫 시작 (NULL → WHITE) 적재. 그 외 케이스는 fromBelt → toBelt 승급 사건을
 * 의미한다. {@link #triggerSession} 은 승급을 유발한 세션을 가리킨다.
 */
@Entity
@Getter
@Table(name = "taekwondo_belt_history")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class TaekwondoBeltHistory {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "patient_id", nullable = false)
    private PatientProfile patientProfile;

    @Enumerated(EnumType.STRING)
    @Column(name = "from_belt", length = 20)
    private Belt fromBelt;

    @Enumerated(EnumType.STRING)
    @Column(name = "to_belt", nullable = false, length = 20)
    private Belt toBelt;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "trigger_session_id", nullable = false)
    private TaekwondoSession triggerSession;

    @Column(name = "promoted_at", nullable = false, updatable = false)
    private LocalDateTime promotedAt;

    private TaekwondoBeltHistory(
            PatientProfile patientProfile,
            Belt fromBelt,
            Belt toBelt,
            TaekwondoSession triggerSession) {
        this.patientProfile =
                Objects.requireNonNull(patientProfile, "patientProfile must not be null");
        this.fromBelt = fromBelt;
        this.toBelt = Objects.requireNonNull(toBelt, "toBelt must not be null");
        this.triggerSession =
                Objects.requireNonNull(triggerSession, "triggerSession must not be null");
        if (fromBelt != null && fromBelt == toBelt) {
            throw new IllegalArgumentException("fromBelt and toBelt must differ");
        }
    }

    /** 환자의 첫 태권도 진입을 기록 (NULL → WHITE). */
    public static TaekwondoBeltHistory firstEntry(
            PatientProfile patientProfile, TaekwondoSession triggerSession) {
        return new TaekwondoBeltHistory(patientProfile, null, Belt.WHITE, triggerSession);
    }

    /** 일반 승급 이벤트 (fromBelt → toBelt). */
    public static TaekwondoBeltHistory promotion(
            PatientProfile patientProfile,
            Belt fromBelt,
            Belt toBelt,
            TaekwondoSession triggerSession) {
        return new TaekwondoBeltHistory(
                patientProfile,
                Objects.requireNonNull(fromBelt, "fromBelt must not be null"),
                toBelt,
                triggerSession);
    }

    public Optional<Belt> getFromBelt() {
        return Optional.ofNullable(fromBelt);
    }

    @PrePersist
    void prePersist() {
        this.promotedAt = LocalDateTime.now();
    }
}
