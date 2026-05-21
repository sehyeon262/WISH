package com.comong.backend.domain.exercise.entity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

import org.junit.jupiter.api.Test;

class ExerciseSessionMotionTest {

    @Test
    void builder_setsFieldsAndTimestamp() {
        ExerciseSession session = session(ExerciseType.TOP);
        ExerciseMotion exerciseMotion = exerciseMotion(ExerciseType.TOP);
        ExerciseSessionMotion sessionMotion =
                ExerciseSessionMotion.builder()
                        .session(session)
                        .exerciseMotion(exerciseMotion)
                        .durationSec(12)
                        .accuracy(0.91)
                        .completedReps(8)
                        .feedback("Raise your knee higher.")
                        .build();

        sessionMotion.prePersist();

        assertThat(sessionMotion.getSession()).isSameAs(session);
        assertThat(sessionMotion.getExerciseMotion()).isSameAs(exerciseMotion);
        assertThat(sessionMotion.getDurationSec()).isEqualTo(12);
        assertThat(sessionMotion.getAccuracy()).isEqualTo(0.91);
        assertThat(sessionMotion.getCompletedReps()).isEqualTo(8);
        assertThat(sessionMotion.getFeedback()).isEqualTo("Raise your knee higher.");
        assertThat(sessionMotion.getCreatedAt()).isNotNull();
    }

    @Test
    void builder_rejectsNullSession() {
        assertThatThrownBy(
                        () ->
                                ExerciseSessionMotion.builder()
                                        .session(null)
                                        .exerciseMotion(mock(ExerciseMotion.class))
                                        .durationSec(12)
                                        .accuracy(0.91)
                                        .completedReps(8)
                                        .feedback("Raise your knee higher.")
                                        .build())
                .isInstanceOf(NullPointerException.class)
                .hasMessageContaining("session");
    }

    @Test
    void builder_rejectsNullExerciseMotion() {
        assertThatThrownBy(
                        () ->
                                ExerciseSessionMotion.builder()
                                        .session(mock(ExerciseSession.class))
                                        .exerciseMotion(null)
                                        .durationSec(12)
                                        .accuracy(0.91)
                                        .completedReps(8)
                                        .feedback("Raise your knee higher.")
                                        .build())
                .isInstanceOf(NullPointerException.class)
                .hasMessageContaining("exerciseMotion");
    }

    @Test
    void builder_rejectsDifferentExerciseType() {
        assertThatThrownBy(
                        () ->
                                ExerciseSessionMotion.builder()
                                        .session(session(ExerciseType.TOP))
                                        .exerciseMotion(exerciseMotion(ExerciseType.DANIEL))
                                        .durationSec(12)
                                        .accuracy(0.91)
                                        .completedReps(8)
                                        .feedback("Raise your knee higher.")
                                        .build())
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("exerciseType");
    }

    @Test
    void builder_rejectsNegativeDurationSec() {
        assertThatThrownBy(
                        () ->
                                ExerciseSessionMotion.builder()
                                        .session(mock(ExerciseSession.class))
                                        .exerciseMotion(mock(ExerciseMotion.class))
                                        .durationSec(-1)
                                        .accuracy(0.91)
                                        .completedReps(8)
                                        .feedback("Raise your knee higher.")
                                        .build())
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("durationSec");
    }

    @Test
    void builder_rejectsOutOfRangeAccuracy() {
        assertThatThrownBy(
                        () ->
                                ExerciseSessionMotion.builder()
                                        .session(mock(ExerciseSession.class))
                                        .exerciseMotion(mock(ExerciseMotion.class))
                                        .durationSec(12)
                                        .accuracy(1.1)
                                        .completedReps(8)
                                        .feedback("Raise your knee higher.")
                                        .build())
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("accuracy");
    }

    @Test
    void builder_rejectsNegativeCompletedReps() {
        assertThatThrownBy(
                        () ->
                                ExerciseSessionMotion.builder()
                                        .session(mock(ExerciseSession.class))
                                        .exerciseMotion(mock(ExerciseMotion.class))
                                        .durationSec(12)
                                        .accuracy(0.91)
                                        .completedReps(-1)
                                        .feedback("Raise your knee higher.")
                                        .build())
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("completedReps");
    }

    @Test
    void builder_rejectsNullFeedback() {
        assertThatThrownBy(
                        () ->
                                ExerciseSessionMotion.builder()
                                        .session(mock(ExerciseSession.class))
                                        .exerciseMotion(mock(ExerciseMotion.class))
                                        .durationSec(12)
                                        .accuracy(0.91)
                                        .completedReps(8)
                                        .feedback(null)
                                        .build())
                .isInstanceOf(NullPointerException.class)
                .hasMessageContaining("feedback");
    }

    private ExerciseSession session(ExerciseType exerciseType) {
        return ExerciseSession.builder()
                .patientProfile(mock(com.comong.backend.domain.patient.entity.PatientProfile.class))
                .exerciseType(exerciseType)
                .durationSec(78)
                .averageAccuracy(0.87)
                .completedMotionCount(4)
                .build();
    }

    private ExerciseMotion exerciseMotion(ExerciseType exerciseType) {
        return ExerciseMotion.builder()
                .exerciseType(exerciseType)
                .name("March")
                .routineOrder(1)
                .targetReps(8)
                .description("Walk in place.")
                .build();
    }
}
