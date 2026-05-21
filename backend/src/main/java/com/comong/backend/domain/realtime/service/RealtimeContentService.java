package com.comong.backend.domain.realtime.service;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.comong.backend.domain.realtime.dto.RealtimeEventResponse;
import com.comong.backend.domain.realtime.exception.RealtimeErrorCode;
import com.comong.backend.domain.usage.entity.ContentType;
import com.comong.backend.domain.usage.entity.LoginSession;
import com.comong.backend.global.exception.BusinessException;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
@Transactional
public class RealtimeContentService {

    private final RealtimeLoginSessionAccessService sessionAccessService;
    private final RealtimeContentStateService realtimeContentStateService;
    private final RealtimeEventService realtimeEventService;
    private final RealtimeLiveKitPermissionService realtimeLiveKitPermissionService;

    public void start(Long userId, Long loginSessionId, ContentType contentType) {
        validateRealtimeContentType(contentType);
        LoginSession session = sessionAccessService.findActiveOwnedSession(userId, loginSessionId);
        RealtimeContentStateService.ContentChange change =
                realtimeContentStateService.start(session.getId(), contentType);
        if (change.changed()) {
            realtimeLiveKitPermissionService.setGuardianMicrophonePermission(
                    userId, session.getId(), session.getPatientProfile().getId(), true);
            realtimeEventService.publish(
                    userId,
                    RealtimeEventResponse.contentStarted(
                            session.getId(),
                            session.getPatientProfile().getId(),
                            contentType.name()));
        }
    }

    public void end(Long userId, Long loginSessionId) {
        LoginSession session = sessionAccessService.findActiveOwnedSession(userId, loginSessionId);
        realtimeContentStateService
                .end(session.getId())
                .ifPresent(
                        contentType -> {
                            realtimeLiveKitPermissionService.setGuardianMicrophonePermission(
                                    userId,
                                    session.getId(),
                                    session.getPatientProfile().getId(),
                                    false);
                            realtimeEventService.publish(
                                    userId,
                                    RealtimeEventResponse.contentEnded(
                                            session.getId(),
                                            session.getPatientProfile().getId(),
                                            contentType.name()));
                        });
    }

    private static void validateRealtimeContentType(ContentType contentType) {
        if (contentType == ContentType.LOGIN) {
            throw new BusinessException(RealtimeErrorCode.INVALID_CONTENT_TYPE);
        }
    }
}
