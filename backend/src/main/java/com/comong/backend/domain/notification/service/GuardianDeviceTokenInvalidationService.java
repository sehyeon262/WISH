package com.comong.backend.domain.notification.service;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.comong.backend.domain.notification.repository.GuardianDeviceTokenRepository;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GuardianDeviceTokenInvalidationService {

    private final GuardianDeviceTokenRepository guardianDeviceTokenRepository;

    @Transactional
    public boolean deactivateInvalidToken(Long deviceTokenId) {
        return guardianDeviceTokenRepository
                .findByIdForUpdate(deviceTokenId)
                .map(
                        deviceToken -> {
                            boolean wasActive = deviceToken.isActive();
                            deviceToken.deactivate();
                            return wasActive;
                        })
                .orElse(false);
    }
}
