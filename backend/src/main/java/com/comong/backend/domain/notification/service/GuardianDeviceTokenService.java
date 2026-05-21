package com.comong.backend.domain.notification.service;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.comong.backend.domain.notification.dto.DeviceTokenDeactivateRequest;
import com.comong.backend.domain.notification.dto.DeviceTokenRegisterRequest;
import com.comong.backend.domain.notification.dto.DeviceTokenResponse;
import com.comong.backend.domain.notification.entity.GuardianDeviceToken;
import com.comong.backend.domain.notification.repository.GuardianDeviceTokenRepository;
import com.comong.backend.domain.patient.exception.PatientErrorCode;
import com.comong.backend.domain.patient.repository.PatientProfileRepository;
import com.comong.backend.domain.user.exception.UserErrorCode;
import com.comong.backend.domain.user.repository.UserRepository;
import com.comong.backend.global.exception.BusinessException;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GuardianDeviceTokenService {

    private final GuardianDeviceTokenRepository guardianDeviceTokenRepository;
    private final UserRepository userRepository;
    private final PatientProfileRepository patientProfileRepository;

    @Transactional
    public DeviceTokenResponse register(Long userId, DeviceTokenRegisterRequest request) {
        validatePatientProfileOwnership(userId, request.patientProfileId());
        validateUserExists(userId);

        Long deviceTokenId =
                guardianDeviceTokenRepository.upsertDeviceToken(
                        userId, request.token(), request.platform().name(), request.userAgent());

        GuardianDeviceToken savedDeviceToken =
                guardianDeviceTokenRepository
                        .findById(deviceTokenId)
                        .orElseThrow(
                                () ->
                                        new IllegalStateException(
                                                "Device token upsert returned missing row"));

        return DeviceTokenResponse.from(savedDeviceToken);
    }

    @Transactional
    public void deactivate(Long userId, DeviceTokenDeactivateRequest request) {
        guardianDeviceTokenRepository
                .findByUserIdAndDeviceToken(userId, request.token())
                .ifPresent(GuardianDeviceToken::deactivate);
    }

    private void validatePatientProfileOwnership(Long userId, Long patientProfileId) {
        if (patientProfileId == null) {
            return;
        }
        if (!patientProfileRepository.existsByIdAndUserId(patientProfileId, userId)) {
            throw new BusinessException(PatientErrorCode.PATIENT_PROFILE_NOT_FOUND);
        }
    }

    private void validateUserExists(Long userId) {
        if (!userRepository.existsById(userId)) {
            throw new BusinessException(UserErrorCode.USER_NOT_FOUND);
        }
    }
}
