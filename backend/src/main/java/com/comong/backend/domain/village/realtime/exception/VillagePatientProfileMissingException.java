package com.comong.backend.domain.village.realtime.exception;

/**
 * 마을 광장 입장을 시도한 사용자에게 {@code PatientProfile} 이 없는 경우 (보호자 단독 계정 / ADMIN 등). 마을에서 움직이는 주체는 환자(아동)
 * 이므로 프로필 없는 계정은 입장이 거부된다 ({@code guardian-patient.md} 분리 원칙).
 */
public class VillagePatientProfileMissingException extends RuntimeException {

    public VillagePatientProfileMissingException(long userId) {
        super("patient profile missing for userId=" + userId);
    }
}
