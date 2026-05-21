package com.comong.backend.domain.realtime.service;

import java.io.IOException;

import org.springframework.stereotype.Service;

import com.comong.backend.domain.realtime.config.LiveKitProperties;
import com.comong.backend.global.exception.BusinessException;

import io.livekit.server.RoomServiceClient;
import livekit.LivekitModels.ParticipantPermission;
import livekit.LivekitModels.TrackSource;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import retrofit2.Response;

@Slf4j
@Service
@RequiredArgsConstructor
public class RealtimeLiveKitPermissionService {

    private final LiveKitProperties liveKitProperties;
    private volatile RoomServiceClient roomServiceClient;

    public void setGuardianMicrophonePermission(
            long userId, long loginSessionId, long patientProfileId, boolean canPublishAudio) {
        String roomName = RealtimeLiveKitNaming.roomName(patientProfileId, loginSessionId);
        String participantIdentity = RealtimeLiveKitNaming.guardianIdentity(userId, loginSessionId);

        try {
            liveKitProperties.validateConfigured();
            Response<?> response =
                    roomServiceClient()
                            .updateParticipant(
                                    roomName,
                                    participantIdentity,
                                    null,
                                    null,
                                    guardianPermission(canPublishAudio))
                            .execute();
            logUpdateResult(roomName, participantIdentity, canPublishAudio, response);
        } catch (BusinessException e) {
            log.warn(
                    "LiveKit guardian microphone permission update skipped because LiveKit is not configured. roomName={}, participantIdentity={}, canPublishAudio={}",
                    roomName,
                    participantIdentity,
                    canPublishAudio);
        } catch (IOException e) {
            log.warn(
                    "LiveKit guardian microphone permission update failed. roomName={}, participantIdentity={}, canPublishAudio={}",
                    roomName,
                    participantIdentity,
                    canPublishAudio,
                    e);
        } catch (RuntimeException e) {
            log.warn(
                    "LiveKit guardian microphone permission update skipped. roomName={}, participantIdentity={}, canPublishAudio={}",
                    roomName,
                    participantIdentity,
                    canPublishAudio,
                    e);
        }
    }

    private RoomServiceClient roomServiceClient() {
        RoomServiceClient cachedClient = roomServiceClient;
        if (cachedClient != null) {
            return cachedClient;
        }

        synchronized (this) {
            if (roomServiceClient == null) {
                roomServiceClient =
                        RoomServiceClient.createClient(
                                liveKitProperties.url(),
                                liveKitProperties.apiKey(),
                                liveKitProperties.apiSecret());
            }
            return roomServiceClient;
        }
    }

    private static ParticipantPermission guardianPermission(boolean canPublishAudio) {
        ParticipantPermission.Builder builder =
                ParticipantPermission.newBuilder()
                        .setCanSubscribe(true)
                        .setCanPublish(canPublishAudio)
                        .setCanPublishData(false);

        if (canPublishAudio) {
            builder.addCanPublishSources(TrackSource.MICROPHONE);
        }

        return builder.build();
    }

    private static void logUpdateResult(
            String roomName,
            String participantIdentity,
            boolean canPublishAudio,
            Response<?> response) {
        if (response.isSuccessful()) {
            log.debug(
                    "LiveKit guardian microphone permission updated. roomName={}, participantIdentity={}, canPublishAudio={}",
                    roomName,
                    participantIdentity,
                    canPublishAudio);
            return;
        }

        if (response.code() == 404) {
            log.debug(
                    "LiveKit guardian participant is not in room. roomName={}, participantIdentity={}, canPublishAudio={}",
                    roomName,
                    participantIdentity,
                    canPublishAudio);
            return;
        }

        log.warn(
                "LiveKit guardian microphone permission update returned non-success. roomName={}, participantIdentity={}, canPublishAudio={}, status={}",
                roomName,
                participantIdentity,
                canPublishAudio,
                response.code());
    }
}
