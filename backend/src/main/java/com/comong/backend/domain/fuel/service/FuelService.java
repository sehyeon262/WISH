package com.comong.backend.domain.fuel.service;

import java.time.LocalDateTime;
import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.comong.backend.domain.fuel.dto.FuelConsumeRequest;
import com.comong.backend.domain.fuel.dto.FuelConsumeResponse;
import com.comong.backend.domain.fuel.dto.FuelEventResponse;
import com.comong.backend.domain.fuel.dto.FuelInboxEventResponse;
import com.comong.backend.domain.fuel.dto.FuelSendRequest;
import com.comong.backend.domain.fuel.dto.FuelStatusResponse;
import com.comong.backend.domain.fuel.entity.FuelEvent;
import com.comong.backend.domain.fuel.exception.FuelErrorCode;
import com.comong.backend.domain.fuel.repository.FuelEventRepository;
import com.comong.backend.domain.patient.entity.PatientProfile;
import com.comong.backend.domain.patient.exception.PatientErrorCode;
import com.comong.backend.domain.patient.repository.PatientProfileRepository;
import com.comong.backend.domain.user.entity.User;
import com.comong.backend.domain.user.exception.UserErrorCode;
import com.comong.backend.domain.user.service.UserService;
import com.comong.backend.global.exception.BusinessException;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class FuelService {

    private static final int COMPLETION_AMOUNT = 100;

    private final FuelEventRepository fuelEventRepository;
    private final PatientProfileRepository patientProfileRepository;
    private final UserService userService;

    @Transactional
    public FuelEventResponse send(Long userId, FuelSendRequest request) {
        PatientProfile patient = findMyPatientForUpdateOrThrow(userId);
        long currentTotal = fuelEventRepository.sumAmountByPatientId(patient.getId());
        if (currentTotal >= COMPLETION_AMOUNT) {
            throw new BusinessException(FuelErrorCode.FUEL_ALREADY_COMPLETED);
        }
        User sender =
                userService
                        .findEntityById(userId)
                        .orElseThrow(() -> new BusinessException(UserErrorCode.USER_NOT_FOUND));
        FuelEvent saved =
                fuelEventRepository.save(
                        FuelEvent.builder()
                                .patient(patient)
                                .sender(sender)
                                .amount(request.amount())
                                .message(request.normalizedMessage())
                                .build());
        return FuelEventResponse.from(saved);
    }

    public FuelStatusResponse status(Long userId) {
        PatientProfile patient = findMyPatientOrThrow(userId);
        long totalAmount = fuelEventRepository.sumAmountByPatientId(patient.getId());
        List<FuelEventResponse> events =
                fuelEventRepository
                        .findAllByPatient_IdOrderByCreatedAtDescIdDesc(patient.getId())
                        .stream()
                        .map(FuelEventResponse::from)
                        .toList();
        return FuelStatusResponse.of(totalAmount, events);
    }

    public List<FuelInboxEventResponse> inbox(Long userId) {
        PatientProfile patient = findMyPatientOrThrow(userId);
        return fuelEventRepository
                .findAllByPatient_IdAndConsumedAtIsNullOrderByCreatedAtAscIdAsc(patient.getId())
                .stream()
                .map(FuelInboxEventResponse::from)
                .toList();
    }

    @Transactional
    public FuelConsumeResponse consume(Long userId, FuelConsumeRequest request) {
        PatientProfile patient = findMyPatientOrThrow(userId);
        List<Long> ids = request.ids().stream().distinct().toList();
        List<FuelEvent> events =
                fuelEventRepository.findAllByPatient_IdAndIdInAndConsumedAtIsNull(
                        patient.getId(), ids);
        LocalDateTime now = LocalDateTime.now();
        events.forEach(event -> event.consume(now));
        return new FuelConsumeResponse(events.size());
    }

    private PatientProfile findMyPatientOrThrow(Long userId) {
        return patientProfileRepository.findAllByUserId(userId).stream()
                .findFirst()
                .orElseThrow(
                        () -> new BusinessException(PatientErrorCode.PATIENT_PROFILE_NOT_FOUND));
    }

    private PatientProfile findMyPatientForUpdateOrThrow(Long userId) {
        return patientProfileRepository
                .findFirstByUserIdForUpdate(userId)
                .orElseThrow(
                        () -> new BusinessException(PatientErrorCode.PATIENT_PROFILE_NOT_FOUND));
    }
}
