package com.comong.backend.domain.taekwondo.service;

import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.comong.backend.domain.patient.entity.PatientProfile;
import com.comong.backend.domain.patient.service.PatientProfileService;
import com.comong.backend.domain.taekwondo.dto.TaekwondoBeltHistoryResponse;
import com.comong.backend.domain.taekwondo.dto.TaekwondoProgressResponse;
import com.comong.backend.domain.taekwondo.entity.TaekwondoProgress;
import com.comong.backend.domain.taekwondo.exception.TaekwondoErrorCode;
import com.comong.backend.domain.taekwondo.repository.TaekwondoBeltHistoryRepository;
import com.comong.backend.domain.taekwondo.repository.TaekwondoProgressRepository;
import com.comong.backend.domain.taekwondo.repository.TaekwondoSessionRepository;
import com.comong.backend.global.exception.BusinessException;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class TaekwondoProgressService {

    private final TaekwondoProgressRepository taekwondoProgressRepository;
    private final TaekwondoBeltHistoryRepository taekwondoBeltHistoryRepository;
    private final TaekwondoSessionRepository taekwondoSessionRepository;
    private final PatientProfileService patientProfileService;

    public TaekwondoProgressResponse findOne(Long userId, Long patientProfileId) {
        PatientProfile patientProfile =
                patientProfileService.findOwnedOrThrow(userId, patientProfileId);
        TaekwondoProgress progress =
                taekwondoProgressRepository
                        .findByPatientProfileId(patientProfile.getId())
                        .orElseThrow(
                                () ->
                                        new BusinessException(
                                                TaekwondoErrorCode.TAEKWONDO_PROGRESS_NOT_FOUND));
        double averageAccuracy =
                taekwondoSessionRepository
                        .averageAccuracyByPatientProfileId(patientProfile.getId())
                        .orElse(0.0);
        return TaekwondoProgressResponse.of(progress, averageAccuracy);
    }

    public List<TaekwondoBeltHistoryResponse> findHistory(Long userId, Long patientProfileId) {
        PatientProfile patientProfile =
                patientProfileService.findOwnedOrThrow(userId, patientProfileId);
        return taekwondoBeltHistoryRepository
                .findAllByPatientProfileIdOrderByPromotedAtDesc(patientProfile.getId())
                .stream()
                .map(TaekwondoBeltHistoryResponse::from)
                .toList();
    }
}
