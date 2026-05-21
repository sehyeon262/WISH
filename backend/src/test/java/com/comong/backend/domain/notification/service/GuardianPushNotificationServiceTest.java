package com.comong.backend.domain.notification.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import com.comong.backend.domain.notification.entity.GuardianDeviceToken;
import com.comong.backend.domain.notification.repository.GuardianDeviceTokenRepository;

class GuardianPushNotificationServiceTest {

    private GuardianDeviceTokenRepository guardianDeviceTokenRepository;
    private FirebasePushSender firebasePushSender;
    private GuardianDeviceTokenInvalidationService guardianDeviceTokenInvalidationService;
    private GuardianPushNotificationService service;

    @BeforeEach
    void setUp() {
        guardianDeviceTokenRepository = mock(GuardianDeviceTokenRepository.class);
        firebasePushSender = mock(FirebasePushSender.class);
        guardianDeviceTokenInvalidationService = mock(GuardianDeviceTokenInvalidationService.class);
        service =
                new GuardianPushNotificationService(
                        guardianDeviceTokenRepository,
                        firebasePushSender,
                        guardianDeviceTokenInvalidationService);
    }

    @Test
    void sendGameStarted_withoutActiveDeviceToken_skipsSend() {
        when(guardianDeviceTokenRepository.findAllByUserIdAndActiveTrue(1L)).thenReturn(List.of());

        service.sendGameStarted(1L, 10L, 20L, "Patient");

        verifyNoInteractions(firebasePushSender);
    }

    @Test
    void sendGameStarted_sendsLiveMonitorPayload() {
        GuardianDeviceToken deviceToken = deviceToken(100L, "fcm-token");
        when(guardianDeviceTokenRepository.findAllByUserIdAndActiveTrue(1L))
                .thenReturn(List.of(deviceToken));
        when(firebasePushSender.send(any())).thenReturn(FirebasePushResult.success());

        service.sendGameStarted(1L, 10L, 20L, "Patient");

        ArgumentCaptor<FirebasePushMessage> messageCaptor =
                ArgumentCaptor.forClass(FirebasePushMessage.class);
        verify(firebasePushSender).send(messageCaptor.capture());
        FirebasePushMessage message = messageCaptor.getValue();

        assertThat(message.deviceToken()).isEqualTo("fcm-token");
        assertThat(message.title()).isEqualTo("아이 활동이 시작됐어요");
        assertThat(message.body()).contains("Patient");
        assertThat(message.data())
                .containsEntry("type", "GAME_STARTED")
                .containsEntry("loginSessionId", "10")
                .containsEntry("patientProfileId", "20")
                .containsEntry("patientName", "Patient")
                .containsEntry("path", "/live?loginSessionId=10&patientProfileId=20");
        verify(guardianDeviceTokenInvalidationService, never()).deactivateInvalidToken(100L);
    }

    @Test
    void sendGameStarted_invalidToken_deactivatesToken() {
        GuardianDeviceToken deviceToken = deviceToken(100L, "invalid-fcm-token");
        when(guardianDeviceTokenRepository.findAllByUserIdAndActiveTrue(1L))
                .thenReturn(List.of(deviceToken));
        when(firebasePushSender.send(any()))
                .thenReturn(FirebasePushResult.failed("UNREGISTERED", true));

        service.sendGameStarted(1L, 10L, 20L, "Patient");

        verify(guardianDeviceTokenInvalidationService).deactivateInvalidToken(100L);
    }

    private GuardianDeviceToken deviceToken(Long id, String token) {
        GuardianDeviceToken deviceToken = mock(GuardianDeviceToken.class);
        when(deviceToken.getId()).thenReturn(id);
        when(deviceToken.getDeviceToken()).thenReturn(token);
        return deviceToken;
    }
}
