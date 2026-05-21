package com.comong.backend.domain.taekwondo.service;

import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.comong.backend.domain.patient.entity.PatientProfile;
import com.comong.backend.domain.patient.service.PatientProfileService;
import com.comong.backend.domain.performance.entity.PerformanceVideo;
import com.comong.backend.domain.performance.service.PerformanceVideoService;
import com.comong.backend.domain.taekwondo.dto.BeltPromotionResponse;
import com.comong.backend.domain.taekwondo.dto.TaekwondoSessionCreateRequest;
import com.comong.backend.domain.taekwondo.dto.TaekwondoSessionMotionResponse;
import com.comong.backend.domain.taekwondo.dto.TaekwondoSessionMotionSaveRequest;
import com.comong.backend.domain.taekwondo.dto.TaekwondoSessionMotionSaveResponse;
import com.comong.backend.domain.taekwondo.dto.TaekwondoSessionResponse;
import com.comong.backend.domain.taekwondo.dto.TaekwondoSessionSummaryResponse;
import com.comong.backend.domain.taekwondo.entity.Belt;
import com.comong.backend.domain.taekwondo.entity.TaekwondoBeltHistory;
import com.comong.backend.domain.taekwondo.entity.TaekwondoMotion;
import com.comong.backend.domain.taekwondo.entity.TaekwondoProgress;
import com.comong.backend.domain.taekwondo.entity.TaekwondoSession;
import com.comong.backend.domain.taekwondo.entity.TaekwondoSessionMotion;
import com.comong.backend.domain.taekwondo.exception.TaekwondoErrorCode;
import com.comong.backend.domain.taekwondo.repository.TaekwondoBeltHistoryRepository;
import com.comong.backend.domain.taekwondo.repository.TaekwondoMotionRepository;
import com.comong.backend.domain.taekwondo.repository.TaekwondoProgressRepository;
import com.comong.backend.domain.taekwondo.repository.TaekwondoSessionMotionRepository;
import com.comong.backend.domain.taekwondo.repository.TaekwondoSessionRepository;
import com.comong.backend.domain.upload.dto.UploadPurpose;
import com.comong.backend.global.exception.BusinessException;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class TaekwondoSessionService {

    private final TaekwondoSessionRepository taekwondoSessionRepository;
    private final TaekwondoSessionMotionRepository taekwondoSessionMotionRepository;
    private final TaekwondoMotionRepository taekwondoMotionRepository;
    private final TaekwondoProgressRepository taekwondoProgressRepository;
    private final TaekwondoBeltHistoryRepository taekwondoBeltHistoryRepository;
    private final PatientProfileService patientProfileService;
    private final PerformanceVideoService performanceVideoService;

    @Transactional
    public TaekwondoSessionResponse create(Long userId, TaekwondoSessionCreateRequest request) {
        PatientProfile patientProfile =
                patientProfileService.findOwnedOrThrow(userId, request.patientProfileId());
        TaekwondoSession session =
                taekwondoSessionRepository.save(
                        TaekwondoSession.builder()
                                .patientProfile(patientProfile)
                                .poomsae(request.poomsae())
                                .durationSec(0)
                                .averageAccuracy(0.0)
                                .completedMotionCount(0)
                                .monstersDefeated(0)
                                .build());
        return TaekwondoSessionResponse.of(session, List.of());
    }

    @Transactional
    public TaekwondoSessionMotionSaveResponse saveMotion(
            Long userId, Long sessionId, TaekwondoSessionMotionSaveRequest request) {
        TaekwondoSession session = findOwnedSessionOrThrow(userId, sessionId);
        TaekwondoMotion motion =
                taekwondoMotionRepository
                        .findById(request.taekwondoMotionId())
                        .orElseThrow(
                                () ->
                                        new BusinessException(
                                                TaekwondoErrorCode.TAEKWONDO_MOTION_NOT_FOUND));
        if (session.getPoomsae() != motion.getPoomsae()) {
            throw new BusinessException(
                    TaekwondoErrorCode.TAEKWONDO_SESSION_MOTION_POOMSAE_MISMATCH);
        }
        PerformanceVideo performanceVideo =
                performanceVideoService.createIfPresent(
                        session.getPatientProfile(),
                        request.videoKey(),
                        request.thumbKey(),
                        UploadPurpose.TAEKWONDO_PERFORMANCE);

        boolean firstMotionOfSession = session.getCompletedMotionCount() == 0;

        TaekwondoSessionMotion sessionMotion =
                taekwondoSessionMotionRepository.save(
                        TaekwondoSessionMotion.builder()
                                .session(session)
                                .motion(motion)
                                .durationSec(request.durationSec())
                                .accuracy(request.accuracy())
                                .completedReps(request.completedReps())
                                .feedback(request.feedback())
                                .monstersDefeated(request.monstersDefeated())
                                .performanceVideo(performanceVideo)
                                .build());

        session.recordMotion(request.durationSec(), request.accuracy(), request.monstersDefeated());

        BeltPromotionResponse beltPromotion =
                applyProgressAndPromote(
                        session.getPatientProfile(),
                        session,
                        request.monstersDefeated(),
                        firstMotionOfSession);

        return TaekwondoSessionMotionSaveResponse.of(
                session, sessionMotion, beltPromotion, performanceVideoService);
    }

    /**
     * 동작 결과 누적 + 띠 승급 판정. 첫 동작 저장 시점에 progress 가 없으면 lazy 로 INSERT 하고 BeltHistory(NULL → WHITE)
     * 적재한다. 매 동작 저장마다 누적 처치수가 다음 띠 임계값을 통과하면 progress.promote() 를 호출하며, 다단계 점프를 허용한다 (while 루프).
     */
    private BeltPromotionResponse applyProgressAndPromote(
            PatientProfile patientProfile,
            TaekwondoSession session,
            int motionMonstersDefeated,
            boolean firstMotionOfSession) {
        TaekwondoProgress progress =
                taekwondoProgressRepository
                        .findByPatientProfileId(patientProfile.getId())
                        .orElseGet(() -> createFirstProgress(patientProfile, session));

        Belt initialBelt = progress.getCurrentBelt();
        progress.applyMotion(motionMonstersDefeated, firstMotionOfSession);
        while (progress.getCurrentBelt().canPromoteWith(progress.getTotalMonstersDefeated())) {
            Belt fromBelt = progress.promote();
            Belt toBelt = progress.getCurrentBelt();
            taekwondoBeltHistoryRepository.save(
                    TaekwondoBeltHistory.promotion(patientProfile, fromBelt, toBelt, session));
        }

        if (progress.getCurrentBelt() == initialBelt) {
            return null;
        }
        return new BeltPromotionResponse(initialBelt, progress.getCurrentBelt());
    }

    private TaekwondoProgress createFirstProgress(
            PatientProfile patientProfile, TaekwondoSession session) {
        TaekwondoProgress progress =
                taekwondoProgressRepository.save(TaekwondoProgress.firstSession(patientProfile));
        taekwondoBeltHistoryRepository.save(
                TaekwondoBeltHistory.firstEntry(patientProfile, session));
        return progress;
    }

    public List<TaekwondoSessionSummaryResponse> findAll(Long userId, Long patientProfileId) {
        PatientProfile patientProfile =
                patientProfileService.findOwnedOrThrow(userId, patientProfileId);
        return taekwondoSessionRepository
                .findAllByPatientProfileIdOrderByCreatedAtDesc(patientProfile.getId())
                .stream()
                .map(TaekwondoSessionSummaryResponse::from)
                .toList();
    }

    public TaekwondoSessionResponse findOne(Long userId, Long sessionId) {
        TaekwondoSession session = findOwnedSessionOrThrow(userId, sessionId);
        List<TaekwondoSessionMotionResponse> motions =
                taekwondoSessionMotionRepository
                        .findAllBySessionIdWithMotionOrderByRoutineOrderAsc(sessionId)
                        .stream()
                        .map(
                                motion ->
                                        TaekwondoSessionMotionResponse.from(
                                                motion, performanceVideoService))
                        .toList();

        return TaekwondoSessionResponse.of(session, motions);
    }

    private TaekwondoSession findOwnedSessionOrThrow(Long userId, Long sessionId) {
        return taekwondoSessionRepository
                .findByIdWithPatientProfileAndUser(sessionId)
                .filter(session -> session.getPatientProfile().getUser().getId().equals(userId))
                .orElseThrow(
                        () ->
                                new BusinessException(
                                        TaekwondoErrorCode.TAEKWONDO_SESSION_NOT_FOUND));
    }
}
