package com.comong.backend.domain.admin.service;

import java.time.LocalDateTime;
import java.util.Set;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.comong.backend.domain.admin.dto.GuardianNotificationRequest;
import com.comong.backend.domain.admin.dto.GuardianNotificationResponse;
import com.comong.backend.domain.patient.entity.PatientProfile;
import com.comong.backend.domain.patient.exception.PatientErrorCode;
import com.comong.backend.domain.patient.repository.PatientProfileRepository;
import com.comong.backend.global.exception.BusinessException;
import com.comong.backend.global.exception.GlobalErrorCode;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * 운영 콘솔에서 보호자에게 안내 메시지를 발송하는 stub 서비스. MVP 단계에서는 실제 발송 채널을 연결하지 않고 서버 로그로 흘려 발표 데모와 운영 흐름 검증에만 사용한다
 * — 추후 이메일/푸시 어댑터 + 발송 이력 테이블이 추가되면 본 서비스가 그 진입점이 된다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class AdminNotificationService {

    private static final Set<String> ALLOWED_TYPES = Set.of("RISK", "CONTENT_SKEW", "CHECK_IN");

    private final PatientProfileRepository patientProfileRepository;

    public GuardianNotificationResponse notifyGuardian(
            Long actorUserId, GuardianNotificationRequest request) {
        if (!ALLOWED_TYPES.contains(request.type())) {
            throw new BusinessException(GlobalErrorCode.INVALID_INPUT);
        }
        PatientProfile patient =
                patientProfileRepository
                        .findByIdWithUser(request.patientId())
                        .orElseThrow(
                                () ->
                                        new BusinessException(
                                                PatientErrorCode.PATIENT_PROFILE_NOT_FOUND));

        LocalDateTime sentAt = LocalDateTime.now();
        log.info(
                "[AdminNotification] actor={} patientId={} guardian={} type={} message=\"{}\""
                        + " sentAt={}",
                actorUserId,
                patient.getId(),
                patient.getUser().getEmail(),
                request.type(),
                request.message(),
                sentAt);

        return new GuardianNotificationResponse(
                patient.getId(),
                patient.getName(),
                patient.getUser().getEmail(),
                request.type(),
                request.message(),
                sentAt);
    }
}
