package com.comong.backend.domain.usage.repository;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

import jakarta.persistence.EntityManager;

import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;

/**
 * 5종 source 테이블에서 환자별 일별 사용량을 SUM 으로 뽑아오는 read-only 쿼리 모음. 배치({@link
 * com.comong.backend.domain.usage.service.DailyUsageStatBatchService}) 와 통계 조회 API (S14P31E103-543)
 * 의 fallback 경로가 공통으로 사용.
 *
 * <p>도메인별 repository 가 아닌 별도 컴포넌트로 둔 이유: 5 source 를 묶는 read-side 통합 책임이라 어느 한 도메인에 속하지 않는다.
 * EntityManager 로 native query 를 직접 던져 PostgreSQL 의 {@code EXTRACT(EPOCH ...)} / {@code INTERVAL} /
 * {@code LEAST} 같은 시간 함수를 활용한다.
 *
 * <p>"날짜" 는 JVM TZ 의 {@link LocalDate} 로 받고 [{@code statDate.atStartOfDay()}, {@code
 * statDate.plusDays(1).atStartOfDay()}) LocalDateTime 범위로 비교한다 — source 테이블의 시간 컬럼들 모두 zone 정보 없는
 * {@code TIMESTAMP(6)} 이므로 JVM TZ 일관성에 의존.
 */
@Component
@RequiredArgsConstructor
public class UsageAggregationQuery {

    /** 좀비 세션(`ended_at IS NULL`) 종료 추정에 쓸 grace. heartbeat 끊긴 후 이만큼 지나면 그 시점을 종료로 본다. */
    private static final int ZOMBIE_SESSION_GRACE_MINUTES = 5;

    private final EntityManager em;

    /**
     * LOGIN: 전일 활동한 환자별 (patient_id, total_seconds) 리스트. 좀비 세션은 {@code LEAST(NOW(),
     * last_heartbeat_at + 5min) - started_at} 으로 duration 추정.
     */
    public List<PatientAggregate> aggregateLoginPerPatient(LocalDate statDate) {
        LocalDateTime start = statDate.atStartOfDay();
        LocalDateTime end = statDate.plusDays(1).atStartOfDay();
        @SuppressWarnings("unchecked")
        List<Object[]> rows =
                em.createNativeQuery(
                                """
                                SELECT patient_profile_id,
                                       COALESCE(SUM(
                                          CASE
                                              WHEN ended_at IS NOT NULL THEN duration_seconds
                                              ELSE GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (
                                                  LEAST(NOW(), last_heartbeat_at + (INTERVAL '1 minute' * :grace))
                                                  - started_at
                                              )))::int)
                                          END
                                       ), 0)::bigint AS total_seconds
                                FROM user_login_session
                                WHERE started_at >= :start AND started_at < :end
                                GROUP BY patient_profile_id
                                """)
                        .setParameter("start", start)
                        .setParameter("end", end)
                        .setParameter("grace", ZOMBIE_SESSION_GRACE_MINUTES)
                        .getResultList();
        return rows.stream().map(PatientAggregate::from).toList();
    }

    public List<PatientAggregate> aggregateMusicPerPatient(LocalDate statDate) {
        LocalDateTime start = statDate.atStartOfDay();
        LocalDateTime end = statDate.plusDays(1).atStartOfDay();
        @SuppressWarnings("unchecked")
        List<Object[]> rows =
                em.createNativeQuery(
                                """
                                SELECT patient_profile_id,
                                       COALESCE(SUM(played_duration_ms) / 1000, 0)::bigint AS total_seconds
                                FROM music_result
                                WHERE played_at >= :start AND played_at < :end
                                GROUP BY patient_profile_id
                                """)
                        .setParameter("start", start)
                        .setParameter("end", end)
                        .getResultList();
        return rows.stream().map(PatientAggregate::from).toList();
    }

    public List<PatientAggregate> aggregateTaekwondoPerPatient(LocalDate statDate) {
        LocalDateTime start = statDate.atStartOfDay();
        LocalDateTime end = statDate.plusDays(1).atStartOfDay();
        @SuppressWarnings("unchecked")
        List<Object[]> rows =
                em.createNativeQuery(
                                """
                                SELECT patient_id,
                                       COALESCE(SUM(duration_sec), 0)::bigint AS total_seconds
                                FROM taekwondo_session
                                WHERE created_at >= :start AND created_at < :end
                                GROUP BY patient_id
                                """)
                        .setParameter("start", start)
                        .setParameter("end", end)
                        .getResultList();
        return rows.stream().map(PatientAggregate::from).toList();
    }

    public List<PatientAggregate> aggregateGymnasticsPerPatient(LocalDate statDate) {
        LocalDateTime start = statDate.atStartOfDay();
        LocalDateTime end = statDate.plusDays(1).atStartOfDay();
        @SuppressWarnings("unchecked")
        List<Object[]> rows =
                em.createNativeQuery(
                                """
                                SELECT patient_id,
                                       COALESCE(SUM(duration_sec), 0)::bigint AS total_seconds
                                FROM exercise_session
                                WHERE created_at >= :start AND created_at < :end
                                GROUP BY patient_id
                                """)
                        .setParameter("start", start)
                        .setParameter("end", end)
                        .getResultList();
        return rows.stream().map(PatientAggregate::from).toList();
    }

    /**
     * ART: 두 단계로 나눠 반환. 호출자가 환자별 누적값과 prior daily 합을 diff 해서 일별 증가분을 얻는다.
     *
     * <ul>
     *   <li>{@code totalCumulative}: 환자별 현재까지의 SUM(play_duration_seconds) 누적
     *   <li>{@code activePatientIds}: 해당일에 작품을 수정한 환자 ID 셋 — 이 환자들에 대해서만 daily row 를 쓴다
     * </ul>
     */
    public ArtAggregate aggregateArtPerPatient(LocalDate statDate) {
        @SuppressWarnings("unchecked")
        List<Object[]> cumulative =
                em.createNativeQuery(
                                """
                                SELECT patient_profile_id,
                                       COALESCE(SUM(play_duration_seconds), 0)::bigint AS total_cumulative
                                FROM artworks
                                GROUP BY patient_profile_id
                                """)
                        .getResultList();
        List<PatientAggregate> totals = cumulative.stream().map(PatientAggregate::from).toList();

        LocalDateTime start = statDate.atStartOfDay();
        LocalDateTime end = statDate.plusDays(1).atStartOfDay();
        @SuppressWarnings("unchecked")
        List<Number> activeIds =
                em.createNativeQuery(
                                """
                                SELECT DISTINCT patient_profile_id
                                FROM artworks
                                WHERE updated_at >= :start AND updated_at < :end
                                """)
                        .setParameter("start", start)
                        .setParameter("end", end)
                        .getResultList();

        return new ArtAggregate(totals, activeIds.stream().map(Number::longValue).toList());
    }

    /** 단일 환자 × 단일 날짜 LOGIN 합산. 543 통계 조회 API 의 today fallback 경로에서 호출. row 가 없으면 0. */
    public long aggregateLoginForPatient(Long patientProfileId, LocalDate statDate) {
        LocalDateTime start = statDate.atStartOfDay();
        LocalDateTime end = statDate.plusDays(1).atStartOfDay();
        Number value =
                (Number)
                        em.createNativeQuery(
                                        """
                                        SELECT COALESCE(SUM(
                                                  CASE
                                                      WHEN ended_at IS NOT NULL THEN duration_seconds
                                                      ELSE GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (
                                                          LEAST(NOW(), last_heartbeat_at + (INTERVAL '1 minute' * :grace))
                                                          - started_at
                                                      )))::int)
                                                  END
                                              ), 0)::bigint
                                        FROM user_login_session
                                        WHERE patient_profile_id = :patientId
                                          AND started_at >= :start AND started_at < :end
                                        """)
                                .setParameter("patientId", patientProfileId)
                                .setParameter("start", start)
                                .setParameter("end", end)
                                .setParameter("grace", ZOMBIE_SESSION_GRACE_MINUTES)
                                .getSingleResult();
        return value.longValue();
    }

    public long aggregateMusicForPatient(Long patientProfileId, LocalDate statDate) {
        LocalDateTime start = statDate.atStartOfDay();
        LocalDateTime end = statDate.plusDays(1).atStartOfDay();
        Number value =
                (Number)
                        em.createNativeQuery(
                                        """
                                        SELECT COALESCE(SUM(played_duration_ms) / 1000, 0)::bigint
                                        FROM music_result
                                        WHERE patient_profile_id = :patientId
                                          AND played_at >= :start AND played_at < :end
                                        """)
                                .setParameter("patientId", patientProfileId)
                                .setParameter("start", start)
                                .setParameter("end", end)
                                .getSingleResult();
        return value.longValue();
    }

    public long aggregateTaekwondoForPatient(Long patientProfileId, LocalDate statDate) {
        LocalDateTime start = statDate.atStartOfDay();
        LocalDateTime end = statDate.plusDays(1).atStartOfDay();
        Number value =
                (Number)
                        em.createNativeQuery(
                                        """
                                        SELECT COALESCE(SUM(duration_sec), 0)::bigint
                                        FROM taekwondo_session
                                        WHERE patient_id = :patientId
                                          AND created_at >= :start AND created_at < :end
                                        """)
                                .setParameter("patientId", patientProfileId)
                                .setParameter("start", start)
                                .setParameter("end", end)
                                .getSingleResult();
        return value.longValue();
    }

    public long aggregateGymnasticsForPatient(Long patientProfileId, LocalDate statDate) {
        LocalDateTime start = statDate.atStartOfDay();
        LocalDateTime end = statDate.plusDays(1).atStartOfDay();
        Number value =
                (Number)
                        em.createNativeQuery(
                                        """
                                        SELECT COALESCE(SUM(duration_sec), 0)::bigint
                                        FROM exercise_session
                                        WHERE patient_id = :patientId
                                          AND created_at >= :start AND created_at < :end
                                        """)
                                .setParameter("patientId", patientProfileId)
                                .setParameter("start", start)
                                .setParameter("end", end)
                                .getSingleResult();
        return value.longValue();
    }

    /** ART 누적합 (현재 시점) — 단일 환자. ART today/cumulative 계산의 공통 재료. */
    public long aggregateArtCumulativeForPatient(Long patientProfileId) {
        Number value =
                (Number)
                        em.createNativeQuery(
                                        """
                                        SELECT COALESCE(SUM(play_duration_seconds), 0)::bigint
                                        FROM artworks
                                        WHERE patient_profile_id = :patientId
                                        """)
                                .setParameter("patientId", patientProfileId)
                                .getSingleResult();
        return value.longValue();
    }

    /** (patient_id, total_seconds) 쌍. 5종 source 일별 집계의 공통 형태. */
    public record PatientAggregate(long patientProfileId, long totalSeconds) {
        static PatientAggregate from(Object[] row) {
            return new PatientAggregate(
                    ((Number) row[0]).longValue(), ((Number) row[1]).longValue());
        }
    }

    /** ART 전용 — totalsByPatient 는 모든 환자의 ART 누적값, activePatientIds 는 해당일 수정한 환자만. */
    public record ArtAggregate(
            List<PatientAggregate> totalsByPatient, List<Long> activePatientIds) {}
}
