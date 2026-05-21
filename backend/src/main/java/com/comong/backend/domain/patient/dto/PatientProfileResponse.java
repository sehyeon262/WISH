package com.comong.backend.domain.patient.dto;

import java.time.LocalDate;

import com.comong.backend.domain.patient.entity.Gender;
import com.comong.backend.domain.patient.entity.PatientProfile;

public record PatientProfileResponse(
        Long id, String name, String nickname, LocalDate birthDate, Gender gender) {

    public static PatientProfileResponse from(PatientProfile profile) {
        return new PatientProfileResponse(
                profile.getId(),
                profile.getName(),
                profile.getNickname(),
                profile.getBirthDate(),
                profile.getGender());
    }
}
