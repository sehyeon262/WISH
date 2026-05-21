package com.comong.backend.domain.realtime.service;

final class RealtimeLiveKitNaming {

    private RealtimeLiveKitNaming() {}

    static String roomName(long patientProfileId, long loginSessionId) {
        return "patient-%d-login-%d".formatted(patientProfileId, loginSessionId);
    }

    static String gameIdentity(long patientProfileId, long loginSessionId) {
        return "game-patient-%d-login-%d".formatted(patientProfileId, loginSessionId);
    }

    static String guardianIdentity(long userId, long loginSessionId) {
        return "guardian-user-%d-login-%d".formatted(userId, loginSessionId);
    }
}
