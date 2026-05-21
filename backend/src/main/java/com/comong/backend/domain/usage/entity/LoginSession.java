package com.comong.backend.domain.usage.entity;

import java.time.Duration;
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
import jakarta.persistence.Table;

import com.comong.backend.domain.patient.entity.PatientProfile;

import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 환자(아동) 가 앱에 접속해 있는 시간을 추적하는 세션. 컨텐츠 별 사용 시간(미술/음악/태권도/체조)과 별개로, 로비/메뉴 등 컨텐츠 밖 시간까지 포함한 "전체 접속 시간"
 * 을 잡기 위한 raw 데이터다.
 *
 * <p>FE 가 주기적 heartbeat 를 보내고 종료 시점에 end 호출. heartbeat 가 끊긴 채 5분 이상 지난 세션은 일별 집계 배치(V19) 에서 좀비로
 * 간주하고 {@code last_heartbeat_at + 5분} 을 종료 시각으로 추정한다.
 */
@Entity
@Getter
@Table(name = "user_login_session")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class LoginSession {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "patient_profile_id", nullable = false)
    private PatientProfile patientProfile;

    @Column(name = "started_at", nullable = false, updatable = false)
    private LocalDateTime startedAt;

    @Column(name = "last_heartbeat_at", nullable = false)
    private LocalDateTime lastHeartbeatAt;

    @Column(name = "ended_at")
    private LocalDateTime endedAt;

    @Column(name = "duration_seconds", nullable = false)
    private int durationSeconds;

    @Builder
    private LoginSession(PatientProfile patientProfile, LocalDateTime startedAt) {
        // 빌더 단계 invariant — @ManyToOne(optional=false) / @Column(nullable=false) 만으로는 build()
        // 시점에 null 차단이 안 되므로 fail-fast.
        this.patientProfile =
                Objects.requireNonNull(patientProfile, "patientProfile must not be null");
        this.startedAt = Objects.requireNonNull(startedAt, "startedAt must not be null");
        this.lastHeartbeatAt = startedAt;
        this.endedAt = null;
        this.durationSeconds = 0;
    }

    public boolean isEnded() {
        return endedAt != null;
    }

    /**
     * 주어진 사용자가 본 세션의 소유자(보호자) 인지 판단. {@code patientProfile.user.id} 와 비교한다.
     *
     * <p>LAZY fetch 주의: 권한 체크 호출 전에 {@code patientProfile.user} 가 영속성 컨텍스트에 있어야 추가 SELECT 안 발생. 단건
     * 조회/수정 경로라 N+1 우려 적음.
     */
    public boolean isOwnedBy(Long userId) {
        if (userId == null) {
            return false;
        }
        if (patientProfile == null || patientProfile.getUser() == null) {
            return false;
        }
        return userId.equals(patientProfile.getUser().getId());
    }

    /**
     * heartbeat 갱신. 종료된 세션이거나 out-of-order 호출이면 no-op (idempotent — 모바일 네트워크 race 대응).
     *
     * @param now FE 가 보낸 시각이 아니라 서버 현재 시각을 받는다 — 클라 시계 신뢰하지 않음
     */
    public void heartbeat(LocalDateTime now) {
        Objects.requireNonNull(now, "now must not be null");
        if (isEnded()) {
            return;
        }
        if (now.isBefore(lastHeartbeatAt)) {
            return;
        }
        this.lastHeartbeatAt = now;
        this.durationSeconds = computeDurationSeconds(startedAt, now);
    }

    /**
     * 세션 종료. 이미 종료된 세션이면 no-op (idempotent). {@code now} 가 {@code lastHeartbeatAt} 보다 과거면 정합성 위해
     * {@code lastHeartbeatAt} 을 종료 시각으로 사용.
     */
    public void end(LocalDateTime now) {
        Objects.requireNonNull(now, "now must not be null");
        if (isEnded()) {
            return;
        }
        LocalDateTime effectiveEnd = now.isBefore(lastHeartbeatAt) ? lastHeartbeatAt : now;
        this.endedAt = effectiveEnd;
        this.lastHeartbeatAt = effectiveEnd;
        this.durationSeconds = computeDurationSeconds(startedAt, effectiveEnd);
    }

    private static int computeDurationSeconds(LocalDateTime from, LocalDateTime to) {
        long seconds = Duration.between(from, to).getSeconds();
        if (seconds < 0) {
            return 0;
        }
        if (seconds > Integer.MAX_VALUE) {
            // 24.8 일 이상 — 좀비 세션. 정합성을 위해 INT 한도로 캡 (DB CHECK 위반 방지).
            return Integer.MAX_VALUE;
        }
        return (int) seconds;
    }
}
