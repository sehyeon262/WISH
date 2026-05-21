package com.comong.backend.domain.realtime.service;

import java.util.List;
import java.util.Objects;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.comong.backend.domain.realtime.config.LiveKitProperties;
import com.comong.backend.domain.realtime.dto.LiveKitTokenResponse;
import com.comong.backend.domain.realtime.exception.RealtimeErrorCode;
import com.comong.backend.domain.realtime.service.RealtimeContentStateService.ContentState;
import com.comong.backend.domain.usage.entity.LoginSession;
import com.comong.backend.global.exception.BusinessException;

import io.livekit.server.AccessToken;
import io.livekit.server.CanPublish;
import io.livekit.server.CanPublishData;
import io.livekit.server.CanPublishSources;
import io.livekit.server.CanSubscribe;
import io.livekit.server.RoomJoin;
import io.livekit.server.RoomName;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class RealtimeTokenService {

    private static final long TOKEN_TTL_SECONDS = 3600;
    private static final long TOKEN_TTL_MILLIS = TOKEN_TTL_SECONDS * 1000;
    private static final List<String> GUARDIAN_PUBLISH_SOURCES = List.of("microphone");

    private final RealtimeLoginSessionAccessService sessionAccessService;
    private final LiveKitProperties liveKitProperties;
    private final RealtimeContentStateService realtimeContentStateService;

    public LiveKitTokenResponse issueGameToken(Long userId, Long loginSessionId) {
        LoginSession session = sessionAccessService.findActiveOwnedSession(userId, loginSessionId);
        return issueToken(gameTokenCommand(session));
    }

    public LiveKitTokenResponse issueGuardianToken(Long userId, Long loginSessionId) {
        LoginSession session = sessionAccessService.findActiveOwnedSession(userId, loginSessionId);
        return issueToken(guardianTokenCommand(userId, session));
    }

    private LiveKitTokenResponse issueToken(TokenIssueCommand command) {
        liveKitProperties.validateConfigured();

        AccessToken token =
                new AccessToken(liveKitProperties.apiKey(), liveKitProperties.apiSecret());
        token.setIdentity(command.participantIdentity());
        token.setName(command.participantName());
        token.setTtl(TOKEN_TTL_MILLIS);
        token.addGrants(
                new RoomJoin(true),
                new RoomName(command.roomName()),
                new CanPublish(command.canPublish()),
                new CanSubscribe(true),
                new CanPublishData(command.canPublishData()));
        if (!command.canPublishSources().isEmpty()) {
            token.addGrants(new CanPublishSources(command.canPublishSources()));
        }
        String jwt = createJwt(token, command.roomName(), command.participantIdentity());

        return new LiveKitTokenResponse(
                command.loginSessionId(),
                command.patientProfileId(),
                command.roomName(),
                liveKitProperties.url(),
                command.participantIdentity(),
                command.participantName(),
                jwt,
                TOKEN_TTL_SECONDS,
                command.contentActive(),
                command.contentType());
    }

    private TokenIssueCommand gameTokenCommand(LoginSession session) {
        long loginSessionId = session.getId();
        long patientProfileId = session.getPatientProfile().getId();
        String roomName = RealtimeLiveKitNaming.roomName(patientProfileId, loginSessionId);
        ContentState contentState = realtimeContentStateService.find(loginSessionId);

        return new TokenIssueCommand(
                loginSessionId,
                patientProfileId,
                roomName,
                RealtimeLiveKitNaming.gameIdentity(patientProfileId, loginSessionId),
                "game",
                true,
                true,
                List.of(),
                contentState.active(),
                contentState.contentTypeName());
    }

    private TokenIssueCommand guardianTokenCommand(Long userId, LoginSession session) {
        long loginSessionId = session.getId();
        long patientProfileId = session.getPatientProfile().getId();
        String roomName = RealtimeLiveKitNaming.roomName(patientProfileId, loginSessionId);
        ContentState contentState = realtimeContentStateService.find(loginSessionId);
        boolean canPublishAudio = contentState.active();

        return new TokenIssueCommand(
                loginSessionId,
                patientProfileId,
                roomName,
                RealtimeLiveKitNaming.guardianIdentity(userId, loginSessionId),
                "guardian",
                canPublishAudio,
                false,
                canPublishAudio ? GUARDIAN_PUBLISH_SOURCES : List.of(),
                contentState.active(),
                contentState.contentTypeName());
    }

    private String createJwt(AccessToken token, String roomName, String participantIdentity) {
        try {
            return token.toJwt();
        } catch (RuntimeException e) {
            log.error(
                    "LiveKit token issue failed. roomName={}, participantIdentity={}",
                    roomName,
                    participantIdentity,
                    e);
            throw new BusinessException(RealtimeErrorCode.LIVEKIT_TOKEN_ISSUE_FAILED);
        }
    }

    private record TokenIssueCommand(
            long loginSessionId,
            long patientProfileId,
            String roomName,
            String participantIdentity,
            String participantName,
            boolean canPublish,
            boolean canPublishData,
            List<String> canPublishSources,
            boolean contentActive,
            String contentType) {

        private TokenIssueCommand {
            canPublishSources = List.copyOf(Objects.requireNonNull(canPublishSources));
        }
    }
}
