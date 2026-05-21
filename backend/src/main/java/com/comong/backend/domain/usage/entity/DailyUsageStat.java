package com.comong.backend.domain.usage.entity;

import java.time.LocalDate;
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
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import com.comong.backend.domain.patient.entity.PatientProfile;

import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 일별 컨텐츠 사용량 집계 row — **환자별 finest granularity**. 매일 KST 01:00 배치가 source 5종에서 환자별 GROUP BY 로 뽑아
 * UPSERT 한다. ADMIN 전체 통계는 본 테이블에서 {@code SUM ... GROUP BY} 로 derive (별도 캐시 불필요한 규모).
 *
 * <p>의미적 PK = ({@code stat_date}, {@code content_type}, {@code patient_profile_id}). JPA 보일러플레이트 회피
 * 위해 surrogate id + UNIQUE 로 처리.
 *
 * <p>{@code unique_patients} 컬럼은 V19 → V20 에서 제거. 환자별 row 에서는 의미 없고 (항상 1), ADMIN 전체 query 가 {@code
 * COUNT(DISTINCT patient_profile_id)} 로 직접 계산하면 된다.
 */
@Entity
@Getter
@Table(
        name = "daily_usage_stat",
        uniqueConstraints =
                @UniqueConstraint(
                        name = "uk_daily_usage_stat_date_type_patient",
                        columnNames = {"stat_date", "content_type", "patient_profile_id"}))
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class DailyUsageStat {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "stat_date", nullable = false, updatable = false)
    private LocalDate statDate;

    @Enumerated(EnumType.STRING)
    @Column(name = "content_type", nullable = false, length = 20, updatable = false)
    private ContentType contentType;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "patient_profile_id", nullable = false, updatable = false)
    private PatientProfile patientProfile;

    @Column(name = "total_seconds", nullable = false)
    private long totalSeconds;

    @Builder
    private DailyUsageStat(
            LocalDate statDate,
            ContentType contentType,
            PatientProfile patientProfile,
            long totalSeconds) {
        this.statDate = Objects.requireNonNull(statDate, "statDate must not be null");
        this.contentType = Objects.requireNonNull(contentType, "contentType must not be null");
        this.patientProfile =
                Objects.requireNonNull(patientProfile, "patientProfile must not be null");
        if (totalSeconds < 0) {
            throw new IllegalArgumentException("totalSeconds must not be negative");
        }
        this.totalSeconds = totalSeconds;
    }

    /** UPSERT 시 update 부분. 같은 (date, type, patient) 으로 재집계가 들어오면 새 값으로 덮어쓴다 — 배치 재실행 안전. */
    public void overwriteTotalSeconds(long totalSeconds) {
        if (totalSeconds < 0) {
            throw new IllegalArgumentException("totalSeconds must not be negative");
        }
        this.totalSeconds = totalSeconds;
    }
}
