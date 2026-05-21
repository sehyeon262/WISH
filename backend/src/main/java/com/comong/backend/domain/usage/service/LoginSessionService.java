package com.comong.backend.domain.usage.service;

import java.time.LocalDateTime;
import java.util.Optional;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import com.comong.backend.domain.notification.service.GuardianPushNotificationService;
import com.comong.backend.domain.patient.entity.PatientProfile;
import com.comong.backend.domain.patient.service.PatientProfileService;
import com.comong.backend.domain.realtime.dto.RealtimeEventResponse;
import com.comong.backend.domain.realtime.service.RealtimeContentStateService;
import com.comong.backend.domain.realtime.service.RealtimeEventService;
import com.comong.backend.domain.usage.dto.LoginSessionResponse;
import com.comong.backend.domain.usage.entity.LoginSession;
import com.comong.backend.domain.usage.exception.UsageErrorCode;
import com.comong.backend.domain.usage.repository.LoginSessionRepository;
import com.comong.backend.global.exception.BusinessException;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * 접속 세션 라이프사이클 (시작/heartbeat/종료) 유스케이스.
 *
 * <p>모든 호출은 인증된 보호자(user) 기준 — patient 소유 검증 후 진행한다. 세션 조회 실패는 enumeration 방지로 ID 존재/비존재를 구분하지 않고
 * {@link UsageErrorCode#LOGIN_SESSION_NOT_FOUND} 로 통합한다 (PatientProfileService 와 동일 패턴).
 *
 * <p>현재 시각은 서버의 {@code LocalDateTime.now()} 를 사용 — 클라이언트가 보낸 시각은 신뢰하지 않는다 (시계 변조/시차).
 */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class LoginSessionService {

    private final LoginSessionRepository loginSessionRepository;
    private final PatientProfileService patientProfileService;
    private final RealtimeEventService realtimeEventService;
    private final RealtimeContentStateService realtimeContentStateService;
    private final GuardianPushNotificationService guardianPushNotificationService;

    @Transactional
    public LoginSessionResponse start(Long userId, Long patientProfileId) {
        PatientProfile patientProfile =
                patientProfileService.findOwnedOrThrow(userId, patientProfileId);
        LoginSession saved =
                loginSessionRepository.save(
                        LoginSession.builder()
                                .patientProfile(patientProfile)
                                .startedAt(LocalDateTime.now())
                                .build());
        clearContentStateSafely(saved.getId());
        publishAfterCommit(
                userId,
                RealtimeEventResponse.gameStarted(
                        saved.getId(), patientProfile.getId(), patientProfile.getName()));
        sendGameStartedPushAfterCommit(
                userId, saved.getId(), patientProfile.getId(), patientProfile.getName());
        return LoginSessionResponse.from(saved);
    }

    @Transactional
    public LoginSessionResponse heartbeat(Long userId, Long sessionId) {
        LoginSession session = findOwnedForUpdateOrThrow(userId, sessionId);
        session.heartbeat(LocalDateTime.now());
        return LoginSessionResponse.from(session);
    }

    @Transactional
    public LoginSessionResponse end(Long userId, Long sessionId) {
        LoginSession session = findOwnedForUpdateOrThrow(userId, sessionId);
        boolean wasEnded = session.isEnded();
        session.end(LocalDateTime.now());
        if (!wasEnded) {
            publishAfterCommit(
                    userId,
                    RealtimeEventResponse.gameEnded(
                            session.getId(), session.getPatientProfile().getId()));
            clearContentStateAfterCommit(session.getId());
        }
        return LoginSessionResponse.from(session);
    }

    public Optional<LoginSession> findLatestActiveOwned(Long userId) {
        return loginSessionRepository
                .findFirstByPatientProfile_User_IdAndEndedAtIsNullOrderByStartedAtDesc(userId);
    }

    /** 다른 도메인 service 가 로그인 세션 기준으로 환자 소유권을 재사용할 때 사용. 존재하지 않거나 본인 소유가 아니면 동일하게 404 로 숨긴다. */
    public LoginSession findOwnedOrThrow(Long userId, Long sessionId) {
        return loginSessionRepository
                .findById(sessionId)
                .filter(s -> s.isOwnedBy(userId))
                .orElseThrow(() -> new BusinessException(UsageErrorCode.LOGIN_SESSION_NOT_FOUND));
    }

    /**
     * heartbeat / end 가 사용. {@code FOR UPDATE} 로 row 락을 잡고 가져와, 두 요청이 동시에 들어왔을 때 lost update 를
     * 차단한다. 소유자 검증 시 {@code patient.user} 가 lazy 로딩되어 추가 SELECT 1~2 회가 발생하지만 같은 트랜잭션 안이라 race-free.
     */
    private LoginSession findOwnedForUpdateOrThrow(Long userId, Long sessionId) {
        return loginSessionRepository
                .findByIdForUpdate(sessionId)
                .filter(s -> s.isOwnedBy(userId))
                .orElseThrow(() -> new BusinessException(UsageErrorCode.LOGIN_SESSION_NOT_FOUND));
    }

    private void publishAfterCommit(Long userId, RealtimeEventResponse event) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            publishSafely(userId, event);
            return;
        }
        try {
            TransactionSynchronizationManager.registerSynchronization(
                    new TransactionSynchronization() {
                        @Override
                        public void afterCommit() {
                            publishSafely(userId, event);
                        }
                    });
        } catch (IllegalStateException e) {
            log.warn(
                    "Realtime event synchronization registration failed. userId={}, eventType={}",
                    userId,
                    event.type(),
                    e);
        }
    }

    private void clearContentStateAfterCommit(Long loginSessionId) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            clearContentStateSafely(loginSessionId);
            return;
        }
        try {
            TransactionSynchronizationManager.registerSynchronization(
                    new TransactionSynchronization() {
                        @Override
                        public void afterCommit() {
                            clearContentStateSafely(loginSessionId);
                        }
                    });
        } catch (IllegalStateException e) {
            log.warn(
                    "Realtime content state cleanup registration failed. loginSessionId={}",
                    loginSessionId,
                    e);
        }
    }

    private void sendGameStartedPushAfterCommit(
            Long userId, Long loginSessionId, Long patientProfileId, String patientName) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            sendGameStartedPushSafely(userId, loginSessionId, patientProfileId, patientName);
            return;
        }
        try {
            TransactionSynchronizationManager.registerSynchronization(
                    new TransactionSynchronization() {
                        @Override
                        public void afterCommit() {
                            sendGameStartedPushSafely(
                                    userId, loginSessionId, patientProfileId, patientName);
                        }
                    });
        } catch (IllegalStateException e) {
            log.warn(
                    "Guardian push synchronization registration failed. Fallback to immediate send. userId={}, loginSessionId={}",
                    userId,
                    loginSessionId,
                    e);
            sendGameStartedPushSafely(userId, loginSessionId, patientProfileId, patientName);
        }
    }

    private void publishSafely(Long userId, RealtimeEventResponse event) {
        try {
            realtimeEventService.publish(userId, event);
        } catch (RuntimeException e) {
            log.warn(
                    "Realtime event publish failed. userId={}, eventType={}",
                    userId,
                    event.type(),
                    e);
        }
    }

    private void clearContentStateSafely(Long loginSessionId) {
        try {
            realtimeContentStateService.clear(loginSessionId);
        } catch (RuntimeException e) {
            log.warn("Realtime content state cleanup failed. loginSessionId={}", loginSessionId, e);
        }
    }

    private void sendGameStartedPushSafely(
            Long userId, Long loginSessionId, Long patientProfileId, String patientName) {
        try {
            guardianPushNotificationService.sendGameStarted(
                    userId, loginSessionId, patientProfileId, patientName);
        } catch (RuntimeException e) {
            log.warn(
                    "Guardian push notification failed. userId={}, loginSessionId={}",
                    userId,
                    loginSessionId,
                    e);
        }
    }
}
