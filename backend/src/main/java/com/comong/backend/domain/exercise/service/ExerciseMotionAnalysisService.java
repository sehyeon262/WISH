package com.comong.backend.domain.exercise.service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.comong.backend.domain.exercise.dto.ExerciseMotionMovementAnalysisResponse;
import com.comong.backend.domain.exercise.dto.ExerciseMotionReplayData;
import com.comong.backend.domain.exercise.entity.ExerciseMotion;
import com.comong.backend.domain.exercise.entity.ExerciseSessionMotion;
import com.comong.backend.domain.exercise.exception.ExerciseErrorCode;
import com.comong.backend.domain.exercise.repository.ExerciseSessionMotionRepository;
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
public class ExerciseMotionAnalysisService {

    static final double MIN_LANDMARK_CONFIDENCE = 0.2;

    private static final double MIN_VECTOR_LENGTH = 0.01;
    private static final List<JointDefinition> JOINT_DEFINITIONS =
            List.of(
                    new JointDefinition(
                            "LEFT_ELBOW", "왼쪽 팔꿈치", "LEFT_SHOULDER", "LEFT_ELBOW", "LEFT_WRIST"),
                    new JointDefinition(
                            "RIGHT_ELBOW",
                            "오른쪽 팔꿈치",
                            "RIGHT_SHOULDER",
                            "RIGHT_ELBOW",
                            "RIGHT_WRIST"),
                    new JointDefinition(
                            "LEFT_SHOULDER", "왼쪽 어깨", "LEFT_ELBOW", "LEFT_SHOULDER", "LEFT_HIP"),
                    new JointDefinition(
                            "RIGHT_SHOULDER",
                            "오른쪽 어깨",
                            "RIGHT_ELBOW",
                            "RIGHT_SHOULDER",
                            "RIGHT_HIP"),
                    new JointDefinition(
                            "LEFT_HIP", "왼쪽 고관절", "LEFT_SHOULDER", "LEFT_HIP", "LEFT_KNEE"),
                    new JointDefinition(
                            "RIGHT_HIP", "오른쪽 고관절", "RIGHT_SHOULDER", "RIGHT_HIP", "RIGHT_KNEE"),
                    new JointDefinition(
                            "LEFT_KNEE", "왼쪽 무릎", "LEFT_HIP", "LEFT_KNEE", "LEFT_ANKLE"),
                    new JointDefinition(
                            "RIGHT_KNEE", "오른쪽 무릎", "RIGHT_HIP", "RIGHT_KNEE", "RIGHT_ANKLE"));

    private final ExerciseSessionMotionRepository exerciseSessionMotionRepository;
    private final ObjectMapper objectMapper;

    public ExerciseMotionMovementAnalysisResponse findMovementAnalysis(
            Long userId, Long motionResultId) {
        ExerciseSessionMotion sessionMotion = findOwnedMotionOrThrow(userId, motionResultId);
        ReplayPayload replayPayload = selectReplay(sessionMotion);
        if (replayPayload.data() == null) {
            return ExerciseMotionMovementAnalysisResponse.unavailable(
                    sessionMotion, MIN_LANDMARK_CONFIDENCE);
        }
        return analyze(sessionMotion, replayPayload);
    }

    private ExerciseSessionMotion findOwnedMotionOrThrow(Long userId, Long motionResultId) {
        return exerciseSessionMotionRepository
                .findByIdWithSessionPatientAndExerciseMotion(motionResultId)
                .filter(
                        motion ->
                                motion.getSession()
                                        .getPatientProfile()
                                        .getUser()
                                        .getId()
                                        .equals(userId))
                .orElseThrow(
                        () -> new BusinessException(ExerciseErrorCode.EXERCISE_SESSION_NOT_FOUND));
    }

    private ReplayPayload selectReplay(ExerciseSessionMotion sessionMotion) {
        ExerciseMotionReplayData rawReplay =
                deserializeReplay(sessionMotion.getId(), sessionMotion.getPoseReplay());
        if (rawReplay != null) {
            return new ReplayPayload("RAW", rawReplay);
        }
        ExerciseMotionReplayData compactReplay =
                deserializeReplay(sessionMotion.getId(), sessionMotion.getCompactPoseReplay());
        if (compactReplay != null) {
            return new ReplayPayload("COMPACT", compactReplay);
        }
        return new ReplayPayload("NONE", null);
    }

    private ExerciseMotionReplayData deserializeReplay(Long motionResultId, String replayJson) {
        if (replayJson == null || replayJson.isBlank()) {
            return null;
        }
        try {
            return objectMapper.readValue(replayJson, ExerciseMotionReplayData.class);
        } catch (JacksonException e) {
            log.error(
                    "Exercise motion replay JSON parse failed for movement analysis. motionResultId={}",
                    motionResultId,
                    e);
            throw new BusinessException(GlobalErrorCode.INTERNAL_SERVER_ERROR);
        }
    }

    private ExerciseMotionMovementAnalysisResponse analyze(
            ExerciseSessionMotion sessionMotion, ReplayPayload replayPayload) {
        ExerciseMotionReplayData replay = replayPayload.data();
        validateReplayTiming(sessionMotion.getId(), replay);
        List<ExerciseMotionReplayData.Frame> frames = replay.frames();
        Map<String, Integer> landmarkIndex = buildLandmarkIndex(replay.landmarks());
        List<JointAccumulator> jointAccumulators =
                JOINT_DEFINITIONS.stream()
                        .map(definition -> new JointAccumulator(definition, frames.size()))
                        .toList();
        List<FrameAnalysis> frameAnalyses = new ArrayList<>();

        for (ExerciseMotionReplayData.Frame frame : frames) {
            int validJointCount = 0;
            double confidenceSum = 0.0;
            for (JointAccumulator accumulator : jointAccumulators) {
                JointMeasurement measurement =
                        measureJoint(frame, landmarkIndex, accumulator.definition());
                if (measurement != null) {
                    accumulator.add(measurement);
                    validJointCount++;
                    confidenceSum += measurement.confidence();
                }
            }
            frameAnalyses.add(
                    new FrameAnalysis(
                            frame.t(),
                            validJointCount > 0,
                            validJointCount == 0 ? null : confidenceSum / validJointCount));
        }

        int analyzedFrameCount =
                (int) frameAnalyses.stream().filter(FrameAnalysis::analysisAvailable).count();
        int excludedFrameCount = frameAnalyses.size() - analyzedFrameCount;
        int analyzedDurationMs = calculateDurationMs(frameAnalyses, replay.durationMs(), true);
        int excludedDurationMs = calculateDurationMs(frameAnalyses, replay.durationMs(), false);
        List<ExerciseMotionMovementAnalysisResponse.JointRange> joints =
                jointAccumulators.stream().map(JointAccumulator::toResponse).toList();
        Double averageConfidence =
                roundNullable(
                        frameAnalyses.stream()
                                .filter(FrameAnalysis::analysisAvailable)
                                .map(FrameAnalysis::averageConfidence)
                                .mapToDouble(Double::doubleValue)
                                .average()
                                .orElse(Double.NaN),
                        3);
        ExerciseMotion motion = sessionMotion.getExerciseMotion();

        return new ExerciseMotionMovementAnalysisResponse(
                sessionMotion.getId(),
                motion.getId(),
                motion.getName(),
                motion.getRoutineOrder(),
                analyzedFrameCount > 0,
                replayPayload.source(),
                replay.durationMs(),
                frames.size(),
                analyzedFrameCount,
                excludedFrameCount,
                analyzedDurationMs,
                excludedDurationMs,
                MIN_LANDMARK_CONFIDENCE,
                averageConfidence,
                joints,
                buildExcludedSegments(frameAnalyses, replay.durationMs()),
                ExerciseMotionMovementAnalysisResponse.ReplaySegment.from(
                        replay.representativeSegment()));
    }

    private void validateReplayTiming(Long motionResultId, ExerciseMotionReplayData replay) {
        if (replay.durationMs() == null || replay.durationMs() < 0) {
            throwInvalidReplay(motionResultId, "durationMs is missing or negative");
        }
        if (replay.frames() == null || replay.frames().isEmpty()) {
            throwInvalidReplay(motionResultId, "frames are missing or empty");
        }

        int previousTimestampMs = -1;
        for (ExerciseMotionReplayData.Frame frame : replay.frames()) {
            if (frame == null || frame.t() == null) {
                throwInvalidReplay(motionResultId, "frame timestamp is missing");
            }
            int timestampMs = frame.t();
            if (timestampMs <= previousTimestampMs) {
                throwInvalidReplay(motionResultId, "frame timestamps are not strictly increasing");
            }
            if (timestampMs > replay.durationMs()) {
                throwInvalidReplay(motionResultId, "frame timestamp exceeds durationMs");
            }
            previousTimestampMs = timestampMs;
        }
    }

    private void throwInvalidReplay(Long motionResultId, String reason) {
        log.error(
                "Exercise motion replay timing is invalid for movement analysis. motionResultId={}, reason={}",
                motionResultId,
                reason);
        throw new BusinessException(GlobalErrorCode.INTERNAL_SERVER_ERROR);
    }

    private Map<String, Integer> buildLandmarkIndex(List<String> landmarks) {
        Map<String, Integer> index = new HashMap<>();
        if (landmarks == null) {
            return index;
        }
        for (int i = 0; i < landmarks.size(); i++) {
            index.put(landmarks.get(i), i);
        }
        return index;
    }

    private JointMeasurement measureJoint(
            ExerciseMotionReplayData.Frame frame,
            Map<String, Integer> landmarkIndex,
            JointDefinition definition) {
        Point a = point(frame, landmarkIndex, definition.startLandmark());
        Point center = point(frame, landmarkIndex, definition.centerLandmark());
        Point b = point(frame, landmarkIndex, definition.endLandmark());
        if (a == null || center == null || b == null) {
            return null;
        }
        Double angle = angleDeg(a, center, b);
        if (angle == null) {
            return null;
        }
        return new JointMeasurement(
                angle, (a.confidence() + center.confidence() + b.confidence()) / 3.0);
    }

    private Point point(
            ExerciseMotionReplayData.Frame frame, Map<String, Integer> landmarkIndex, String name) {
        Integer index = landmarkIndex.get(name);
        if (index == null || frame.lm() == null || index >= frame.lm().size()) {
            return null;
        }
        List<Double> values = frame.lm().get(index);
        if (values == null || values.size() < 4) {
            return null;
        }
        Double x = values.get(0);
        Double y = values.get(1);
        Double confidence = values.get(3);
        if (!isFinite(x)
                || !isFinite(y)
                || !isFinite(confidence)
                || confidence < MIN_LANDMARK_CONFIDENCE) {
            return null;
        }
        Double z = values.get(2);
        return new Point(x, y, isFinite(z) ? z : 0.0, confidence);
    }

    private Double angleDeg(Point start, Point center, Point end) {
        double ax = start.x() - center.x();
        double ay = start.y() - center.y();
        double az = start.z() - center.z();
        double bx = end.x() - center.x();
        double by = end.y() - center.y();
        double bz = end.z() - center.z();
        double aLength = Math.sqrt(ax * ax + ay * ay + az * az);
        double bLength = Math.sqrt(bx * bx + by * by + bz * bz);
        if (aLength < MIN_VECTOR_LENGTH || bLength < MIN_VECTOR_LENGTH) {
            return null;
        }
        double cosine = (ax * bx + ay * by + az * bz) / (aLength * bLength);
        double clampedCosine = Math.max(-1.0, Math.min(1.0, cosine));
        return Math.toDegrees(Math.acos(clampedCosine));
    }

    private int calculateDurationMs(
            List<FrameAnalysis> frameAnalyses, Integer replayDurationMs, boolean includeAnalyzed) {
        if (replayDurationMs == null || frameAnalyses.isEmpty()) {
            return 0;
        }
        int durationMs = 0;
        for (int i = 0; i < frameAnalyses.size(); i++) {
            FrameAnalysis frame = frameAnalyses.get(i);
            if (frame.analysisAvailable() != includeAnalyzed) {
                continue;
            }
            int nextTimestamp =
                    i + 1 < frameAnalyses.size()
                            ? frameAnalyses.get(i + 1).timestampMs()
                            : replayDurationMs;
            durationMs += Math.max(0, nextTimestamp - frame.timestampMs());
        }
        return durationMs;
    }

    private List<ExerciseMotionMovementAnalysisResponse.ExcludedSegment> buildExcludedSegments(
            List<FrameAnalysis> frameAnalyses, Integer replayDurationMs) {
        if (replayDurationMs == null || frameAnalyses.isEmpty()) {
            return List.of();
        }
        List<ExerciseMotionMovementAnalysisResponse.ExcludedSegment> segments = new ArrayList<>();
        Integer startMs = null;
        Integer endMs = null;
        for (int i = 0; i < frameAnalyses.size(); i++) {
            FrameAnalysis frame = frameAnalyses.get(i);
            int nextTimestamp =
                    i + 1 < frameAnalyses.size()
                            ? frameAnalyses.get(i + 1).timestampMs()
                            : replayDurationMs;
            if (!frame.analysisAvailable()) {
                if (startMs == null) {
                    startMs = frame.timestampMs();
                }
                endMs = Math.max(frame.timestampMs(), nextTimestamp);
            } else if (startMs != null) {
                segments.add(
                        new ExerciseMotionMovementAnalysisResponse.ExcludedSegment(
                                startMs, endMs, "LOW_CONFIDENCE"));
                startMs = null;
                endMs = null;
            }
        }
        if (startMs != null) {
            segments.add(
                    new ExerciseMotionMovementAnalysisResponse.ExcludedSegment(
                            startMs, endMs, "LOW_CONFIDENCE"));
        }
        return segments;
    }

    private boolean isFinite(Double value) {
        return value != null && Double.isFinite(value);
    }

    private static Double roundNullable(double value, int digits) {
        if (!Double.isFinite(value)) {
            return null;
        }
        return round(value, digits);
    }

    private static double round(double value, int digits) {
        double scale = Math.pow(10, digits);
        return Math.round(value * scale) / scale;
    }

    private record ReplayPayload(String source, ExerciseMotionReplayData data) {}

    private record JointDefinition(
            String jointName,
            String label,
            String startLandmark,
            String centerLandmark,
            String endLandmark) {}

    private record Point(double x, double y, double z, double confidence) {}

    private record JointMeasurement(double angleDeg, double confidence) {}

    private record FrameAnalysis(
            int timestampMs, boolean analysisAvailable, Double averageConfidence) {}

    private static class JointAccumulator {

        private final JointDefinition definition;
        private final int totalFrameCount;
        private int validFrameCount;
        private double minAngle = Double.POSITIVE_INFINITY;
        private double maxAngle = Double.NEGATIVE_INFINITY;
        private double confidenceSum;

        JointAccumulator(JointDefinition definition, int totalFrameCount) {
            this.definition = definition;
            this.totalFrameCount = totalFrameCount;
        }

        JointDefinition definition() {
            return definition;
        }

        void add(JointMeasurement measurement) {
            validFrameCount++;
            minAngle = Math.min(minAngle, measurement.angleDeg());
            maxAngle = Math.max(maxAngle, measurement.angleDeg());
            confidenceSum += measurement.confidence();
        }

        ExerciseMotionMovementAnalysisResponse.JointRange toResponse() {
            if (validFrameCount == 0) {
                return new ExerciseMotionMovementAnalysisResponse.JointRange(
                        definition.jointName(),
                        definition.label(),
                        false,
                        0,
                        0.0,
                        null,
                        null,
                        null,
                        null);
            }
            return new ExerciseMotionMovementAnalysisResponse.JointRange(
                    definition.jointName(),
                    definition.label(),
                    true,
                    validFrameCount,
                    round((double) validFrameCount / totalFrameCount, 3),
                    round(minAngle, 1),
                    round(maxAngle, 1),
                    round(maxAngle - minAngle, 1),
                    round(confidenceSum / validFrameCount, 3));
        }
    }
}
