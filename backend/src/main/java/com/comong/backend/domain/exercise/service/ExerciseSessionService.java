package com.comong.backend.domain.exercise.service;

import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.comong.backend.domain.exercise.dto.ExerciseMotionReplayData;
import com.comong.backend.domain.exercise.dto.ExerciseMotionReplayResponse;
import com.comong.backend.domain.exercise.dto.ExerciseSessionCreateRequest;
import com.comong.backend.domain.exercise.dto.ExerciseSessionMotionResponse;
import com.comong.backend.domain.exercise.dto.ExerciseSessionMotionSaveRequest;
import com.comong.backend.domain.exercise.dto.ExerciseSessionMotionSaveResponse;
import com.comong.backend.domain.exercise.dto.ExerciseSessionResponse;
import com.comong.backend.domain.exercise.dto.ExerciseSessionSummaryResponse;
import com.comong.backend.domain.exercise.entity.ExerciseMotion;
import com.comong.backend.domain.exercise.entity.ExerciseSession;
import com.comong.backend.domain.exercise.entity.ExerciseSessionMotion;
import com.comong.backend.domain.exercise.exception.ExerciseErrorCode;
import com.comong.backend.domain.exercise.repository.ExerciseMotionRepository;
import com.comong.backend.domain.exercise.repository.ExerciseSessionMotionRepository;
import com.comong.backend.domain.exercise.repository.ExerciseSessionRepository;
import com.comong.backend.domain.patient.entity.PatientProfile;
import com.comong.backend.domain.patient.service.PatientProfileService;
import com.comong.backend.domain.performance.entity.PerformanceVideo;
import com.comong.backend.domain.performance.service.PerformanceVideoService;
import com.comong.backend.domain.upload.dto.UploadPurpose;
import com.comong.backend.global.exception.BusinessException;
import com.comong.backend.global.exception.GlobalErrorCode;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ExerciseSessionService {

    private static final int RAW_REPLAY_FPS = 30;
    private static final int COMPACT_REPLAY_MIN_FPS = 5;
    private static final int COMPACT_REPLAY_MAX_FPS = 10;
    private static final int REPLAY_MAX_CAPTURE_SECONDS = 180;
    private static final int REPLAY_MAX_DURATION_MS = REPLAY_MAX_CAPTURE_SECONDS * 1000;
    private static final int REPLAY_TUPLE_SIZE = 4;
    private static final double REPLAY_NORMALIZED_COORDINATE_ABS_LIMIT = 10.0;
    private static final List<String> REPLAY_LANDMARK_NAMES_V1 =
            List.of(
                    "LEFT_SHOULDER",
                    "RIGHT_SHOULDER",
                    "LEFT_ELBOW",
                    "RIGHT_ELBOW",
                    "LEFT_WRIST",
                    "RIGHT_WRIST",
                    "LEFT_HIP",
                    "RIGHT_HIP",
                    "LEFT_KNEE",
                    "RIGHT_KNEE",
                    "LEFT_ANKLE",
                    "RIGHT_ANKLE");
    private static final List<String> REPLAY_LANDMARK_NAMES_V2 =
            List.of(
                    "NOSE",
                    "LEFT_EAR",
                    "RIGHT_EAR",
                    "LEFT_SHOULDER",
                    "RIGHT_SHOULDER",
                    "LEFT_ELBOW",
                    "RIGHT_ELBOW",
                    "LEFT_WRIST",
                    "RIGHT_WRIST",
                    "LEFT_PINKY",
                    "RIGHT_PINKY",
                    "LEFT_INDEX",
                    "RIGHT_INDEX",
                    "LEFT_THUMB",
                    "RIGHT_THUMB",
                    "LEFT_HIP",
                    "RIGHT_HIP",
                    "LEFT_KNEE",
                    "RIGHT_KNEE",
                    "LEFT_ANKLE",
                    "RIGHT_ANKLE",
                    "LEFT_HEEL",
                    "RIGHT_HEEL",
                    "LEFT_FOOT_INDEX",
                    "RIGHT_FOOT_INDEX");

    private final ExerciseSessionRepository exerciseSessionRepository;
    private final ExerciseSessionMotionRepository exerciseSessionMotionRepository;
    private final ExerciseMotionRepository exerciseMotionRepository;
    private final PatientProfileService patientProfileService;
    private final PerformanceVideoService performanceVideoService;
    private final ObjectMapper objectMapper;

    @Transactional
    public ExerciseSessionResponse create(Long userId, ExerciseSessionCreateRequest request) {
        PatientProfile patientProfile =
                patientProfileService.findOwnedOrThrow(userId, request.patientProfileId());
        ExerciseSession session =
                exerciseSessionRepository.save(
                        ExerciseSession.builder()
                                .patientProfile(patientProfile)
                                .exerciseType(request.exerciseType())
                                .durationSec(0)
                                .averageAccuracy(0.0)
                                .completedMotionCount(0)
                                .build());
        return ExerciseSessionResponse.of(session, List.of());
    }

    @Transactional
    public ExerciseSessionMotionSaveResponse saveMotion(
            Long userId, Long sessionId, ExerciseSessionMotionSaveRequest request) {
        String poseReplay = serializeReplay(request.poseReplay(), ReplayKind.RAW);
        String compactPoseReplay = serializeReplay(request.compactPoseReplay(), ReplayKind.COMPACT);
        ExerciseSession session = findOwnedSessionOrThrow(userId, sessionId);
        ExerciseMotion exerciseMotion =
                exerciseMotionRepository
                        .findById(request.exerciseMotionId())
                        .orElseThrow(
                                () ->
                                        new BusinessException(
                                                ExerciseErrorCode.EXERCISE_MOTION_NOT_FOUND));
        if (session.getExerciseType() != exerciseMotion.getExerciseType()) {
            throw new BusinessException(ExerciseErrorCode.EXERCISE_SESSION_MOTION_TYPE_MISMATCH);
        }
        PerformanceVideo performanceVideo =
                performanceVideoService.createIfPresent(
                        session.getPatientProfile(),
                        request.videoKey(),
                        request.thumbKey(),
                        UploadPurpose.GYMNASTICS_PERFORMANCE);

        ExerciseSessionMotion sessionMotion =
                exerciseSessionMotionRepository.save(
                        ExerciseSessionMotion.builder()
                                .session(session)
                                .exerciseMotion(exerciseMotion)
                                .durationSec(request.durationSec())
                                .accuracy(request.accuracy())
                                .completedReps(request.completedReps())
                                .feedback(request.feedback())
                                .performanceVideo(performanceVideo)
                                .poseReplay(poseReplay)
                                .compactPoseReplay(compactPoseReplay)
                                .build());

        session.recordMotion(request.durationSec(), request.accuracy());

        return ExerciseSessionMotionSaveResponse.of(
                session, sessionMotion, performanceVideoService);
    }

    public List<ExerciseSessionSummaryResponse> findAll(Long userId, Long patientProfileId) {
        PatientProfile patientProfile =
                patientProfileService.findOwnedOrThrow(userId, patientProfileId);
        return exerciseSessionRepository
                .findAllByPatientProfileIdOrderByCreatedAtDesc(patientProfile.getId())
                .stream()
                .map(ExerciseSessionSummaryResponse::from)
                .toList();
    }

    public ExerciseSessionResponse findOne(Long userId, Long sessionId) {
        ExerciseSession session = findOwnedSessionOrThrow(userId, sessionId);
        List<ExerciseSessionMotionResponse> motions =
                exerciseSessionMotionRepository
                        .findResponseRowsBySessionIdOrderByRoutineOrderAsc(sessionId)
                        .stream()
                        .map(
                                motion ->
                                        ExerciseSessionMotionResponse.from(
                                                motion, performanceVideoService))
                        .toList();

        return ExerciseSessionResponse.of(session, motions);
    }

    public ExerciseMotionReplayResponse findMotionReplay(Long userId, Long motionResultId) {
        ExerciseSessionMotion sessionMotion =
                exerciseSessionMotionRepository
                        .findByIdWithSessionPatientAndExerciseMotion(motionResultId)
                        .filter(
                                motion ->
                                        motion.getSession()
                                                .getPatientProfile()
                                                .getUser()
                                                .getId()
                                                .equals(userId))
                        .orElseThrow(
                                () ->
                                        new BusinessException(
                                                ExerciseErrorCode.EXERCISE_SESSION_NOT_FOUND));

        return ExerciseMotionReplayResponse.from(
                sessionMotion,
                deserializeReplay(sessionMotion.getId(), sessionMotion.getPoseReplay()),
                deserializeReplay(sessionMotion.getId(), sessionMotion.getCompactPoseReplay()));
    }

    private ExerciseSession findOwnedSessionOrThrow(Long userId, Long sessionId) {
        return exerciseSessionRepository
                .findByIdWithPatientProfileAndUser(sessionId)
                .filter(session -> session.getPatientProfile().getUser().getId().equals(userId))
                .orElseThrow(
                        () -> new BusinessException(ExerciseErrorCode.EXERCISE_SESSION_NOT_FOUND));
    }

    private String serializeReplay(ExerciseMotionReplayData replay, ReplayKind replayKind) {
        if (replay == null) {
            return null;
        }
        validateReplay(replay, replayKind);
        try {
            return objectMapper.writeValueAsString(replay);
        } catch (JacksonException e) {
            throw new BusinessException(GlobalErrorCode.INVALID_INPUT);
        }
    }

    private ExerciseMotionReplayData deserializeReplay(Long motionResultId, String replayJson) {
        if (replayJson == null || replayJson.isBlank()) {
            return null;
        }
        try {
            return objectMapper.readValue(replayJson, ExerciseMotionReplayData.class);
        } catch (JacksonException e) {
            log.error(
                    "Exercise motion replay JSON parse failed. motionResultId={}",
                    motionResultId,
                    e);
            throw new BusinessException(GlobalErrorCode.INTERNAL_SERVER_ERROR);
        }
    }

    private void validateReplay(ExerciseMotionReplayData replay, ReplayKind replayKind) {
        if (replay.durationMs() == null
                || replay.frames() == null
                || replay.fps() == null
                || !isAllowedReplayFps(replay.fps(), replayKind)) {
            throw new BusinessException(GlobalErrorCode.INVALID_INPUT);
        }
        int maxFrames = replay.fps() * REPLAY_MAX_CAPTURE_SECONDS;
        if (replay.durationMs() > REPLAY_MAX_DURATION_MS
                || replay.frames().isEmpty()
                || replay.frames().size() > maxFrames) {
            throw new BusinessException(GlobalErrorCode.INVALID_INPUT);
        }
        List<String> expectedLandmarks = getExpectedReplayLandmarks(replay.version());
        if (expectedLandmarks == null || !expectedLandmarks.equals(replay.landmarks())) {
            throw new BusinessException(GlobalErrorCode.INVALID_INPUT);
        }

        int previousTimestampMs = -1;
        for (ExerciseMotionReplayData.Frame frame : replay.frames()) {
            if (frame.t() == null
                    || frame.t() <= previousTimestampMs
                    || frame.t() > replay.durationMs()) {
                throw new BusinessException(GlobalErrorCode.INVALID_INPUT);
            }
            previousTimestampMs = frame.t();
            validateReplayFrame(frame, expectedLandmarks.size());
        }

        ExerciseMotionReplayData.Segment segment = replay.representativeSegment();
        if (segment != null && !isValidReplaySegment(segment, replay.durationMs())) {
            throw new BusinessException(GlobalErrorCode.INVALID_INPUT);
        }
        if (replay.markers() != null) {
            for (ExerciseMotionReplayData.Segment marker : replay.markers()) {
                if (!isValidReplaySegment(marker, replay.durationMs())) {
                    throw new BusinessException(GlobalErrorCode.INVALID_INPUT);
                }
            }
        }
    }

    private boolean isAllowedReplayFps(int fps, ReplayKind replayKind) {
        return switch (replayKind) {
            case RAW -> fps == RAW_REPLAY_FPS;
            case COMPACT -> fps >= COMPACT_REPLAY_MIN_FPS && fps <= COMPACT_REPLAY_MAX_FPS;
        };
    }

    private List<String> getExpectedReplayLandmarks(Integer version) {
        if (Integer.valueOf(1).equals(version)) {
            return REPLAY_LANDMARK_NAMES_V1;
        }
        if (Integer.valueOf(2).equals(version)) {
            return REPLAY_LANDMARK_NAMES_V2;
        }
        return null;
    }

    private boolean isValidReplaySegment(ExerciseMotionReplayData.Segment segment, int durationMs) {
        return segment != null
                && segment.startMs() != null
                && segment.endMs() != null
                && segment.startMs() <= segment.endMs()
                && segment.endMs() <= durationMs;
    }

    private void validateReplayFrame(ExerciseMotionReplayData.Frame frame, int landmarkCount) {
        if (frame.lm() == null || frame.lm().size() != landmarkCount) {
            throw new BusinessException(GlobalErrorCode.INVALID_INPUT);
        }

        for (List<Double> landmark : frame.lm()) {
            if (landmark == null || landmark.size() != REPLAY_TUPLE_SIZE) {
                throw new BusinessException(GlobalErrorCode.INVALID_INPUT);
            }
            validateCoordinate(landmark.get(0));
            validateCoordinate(landmark.get(1));
            validateCoordinate(landmark.get(2));
            validateConfidence(landmark.get(3));
        }
    }

    private void validateCoordinate(Double value) {
        if (value == null) {
            return;
        }
        if (!Double.isFinite(value) || Math.abs(value) > REPLAY_NORMALIZED_COORDINATE_ABS_LIMIT) {
            throw new BusinessException(GlobalErrorCode.INVALID_INPUT);
        }
    }

    private void validateConfidence(Double value) {
        if (value == null || !Double.isFinite(value) || value < 0.0 || value > 1.0) {
            throw new BusinessException(GlobalErrorCode.INVALID_INPUT);
        }
    }

    private enum ReplayKind {
        RAW,
        COMPACT
    }
}
