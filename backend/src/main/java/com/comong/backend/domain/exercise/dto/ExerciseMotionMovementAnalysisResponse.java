package com.comong.backend.domain.exercise.dto;

import java.util.List;

import com.comong.backend.domain.exercise.entity.ExerciseMotion;
import com.comong.backend.domain.exercise.entity.ExerciseSessionMotion;

public record ExerciseMotionMovementAnalysisResponse(
        Long motionResultId,
        Long exerciseMotionId,
        String motionName,
        int routineOrder,
        boolean analysisAvailable,
        String replaySource,
        Integer durationMs,
        int totalFrameCount,
        int analyzedFrameCount,
        int excludedFrameCount,
        Integer analyzedDurationMs,
        Integer excludedDurationMs,
        double confidenceThreshold,
        Double averageConfidence,
        List<JointRange> joints,
        List<ExcludedSegment> excludedSegments,
        ReplaySegment representativeSegment) {

    public static ExerciseMotionMovementAnalysisResponse unavailable(
            ExerciseSessionMotion sessionMotion, double confidenceThreshold) {
        ExerciseMotion motion = sessionMotion.getExerciseMotion();
        return new ExerciseMotionMovementAnalysisResponse(
                sessionMotion.getId(),
                motion.getId(),
                motion.getName(),
                motion.getRoutineOrder(),
                false,
                "NONE",
                null,
                0,
                0,
                0,
                null,
                null,
                confidenceThreshold,
                null,
                List.of(),
                List.of(),
                null);
    }

    public record JointRange(
            String jointName,
            String label,
            boolean analysisAvailable,
            int validFrameCount,
            double coverageRate,
            Double minAngleDeg,
            Double maxAngleDeg,
            Double rangeDeg,
            Double averageConfidence) {}

    public record ExcludedSegment(Integer startMs, Integer endMs, String reason) {}

    public record ReplaySegment(Integer startMs, Integer endMs, String reason) {
        public static ReplaySegment from(ExerciseMotionReplayData.Segment segment) {
            if (segment == null) {
                return null;
            }
            return new ReplaySegment(segment.startMs(), segment.endMs(), segment.reason());
        }
    }
}
