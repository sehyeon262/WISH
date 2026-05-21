package com.comong.backend.domain.usage.repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import jakarta.persistence.LockModeType;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.comong.backend.domain.usage.entity.LoginSession;

public interface LoginSessionRepository extends JpaRepository<LoginSession, Long> {

    /**
     * heartbeat / end 가 이 메서드를 통해 세션을 가져온다. {@code SELECT ... FOR UPDATE} 로 row 단위 락을 걸어 두 요청이 동시에
     * 들어왔을 때 lost update 를 막는다 — 락 없이 read-modify-save 하면 늦게 커밋한 쪽이 endedAt=NULL 로 되돌리거나 last
     * heartbeat/duration 을 덮어써 idempotent 계약이 깨진다.
     *
     * <p>락 범위는 root entity (`user_login_session`) 만 — patient_profile / users 는 ownership 검증을 위해
     * lazy 로딩되지만 락은 잡히지 않는다 (Hibernate 기본 lock scope NORMAL).
     *
     * <p>start 경로는 새 row 를 INSERT 하므로 락 불필요.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from LoginSession s where s.id = :id")
    Optional<LoginSession> findByIdForUpdate(Long id);

    Optional<LoginSession> findFirstByPatientProfile_User_IdAndEndedAtIsNullOrderByStartedAtDesc(
            Long userId);

    /**
     * 환자별 요일×시간대 사용시간 히트맵. {@code started_at} 기준으로 그룹핑하기 때문에 자정을 가로지르는 세션은 시작 시각 hour 에 누적된다 — MVP
     * 단계에서는 운영 화면에서 "주로 언제 사용하는지" 만 가시화하는 용도라 이 근사로 충분하다.
     *
     * <p>Postgres {@code ISODOW} 는 1=Mon, 7=Sun (Java {@link java.time.DayOfWeek} 와 동일). FE 는 응답을
     * 그대로 7×24 격자로 사용.
     */
    @Query(
            value =
                    """
                    SELECT EXTRACT(ISODOW FROM s.started_at)::int AS weekday,
                           EXTRACT(HOUR  FROM s.started_at)::int AS hour,
                           COALESCE(SUM(s.duration_seconds), 0)::bigint AS total_seconds
                    FROM user_login_session s
                    WHERE s.patient_profile_id = :patientId
                      AND s.started_at >= :fromDateTime
                      AND s.started_at < :toExclusiveDateTime
                    GROUP BY weekday, hour
                    """,
            nativeQuery = true)
    List<HourlyHeatmapRow> findHourlyHeatmapByPatient(
            @Param("patientId") Long patientId,
            @Param("fromDateTime") LocalDateTime fromDateTime,
            @Param("toExclusiveDateTime") LocalDateTime toExclusiveDateTime);

    /** Spring Data JPA interface projection. native 쿼리 결과 컬럼 alias 와 1:1 매핑. */
    interface HourlyHeatmapRow {
        Integer getWeekday();

        Integer getHour();

        Long getTotalSeconds();
    }
}
