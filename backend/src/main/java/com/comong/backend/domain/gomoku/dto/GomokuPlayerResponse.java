package com.comong.backend.domain.gomoku.dto;

import com.comong.backend.domain.patient.entity.PatientProfile;

public record GomokuPlayerResponse(Long patientProfileId, String nickname, String textureKey) {
    public static GomokuPlayerResponse from(PatientProfile patientProfile) {
        return from(patientProfile, null);
    }

    public static GomokuPlayerResponse from(PatientProfile patientProfile, String textureKey) {
        if (patientProfile == null) {
            return null;
        }
        return new GomokuPlayerResponse(
                patientProfile.getId(), patientProfile.getNickname(), textureKey);
    }
}
