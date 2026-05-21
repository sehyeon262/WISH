package com.comong.backend.domain.realtime.service;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class RealtimeLiveKitNamingTest {

    @Test
    void roomName_returnsPatientLoginRoomName() {
        assertThat(RealtimeLiveKitNaming.roomName(10L, 20L)).isEqualTo("patient-10-login-20");
    }

    @Test
    void gameIdentity_returnsPatientLoginIdentity() {
        assertThat(RealtimeLiveKitNaming.gameIdentity(10L, 20L))
                .isEqualTo("game-patient-10-login-20");
    }

    @Test
    void guardianIdentity_returnsUserLoginIdentity() {
        assertThat(RealtimeLiveKitNaming.guardianIdentity(30L, 20L))
                .isEqualTo("guardian-user-30-login-20");
    }
}
