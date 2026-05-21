package com.comong.backend.domain.exercise.entity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

import org.junit.jupiter.api.Test;

import com.comong.backend.domain.patient.entity.PatientProfile;

class ExerciseSessionTest {

    @Test
    void builder_setsFieldsAndTimestamp() {
        PatientProfile patientProfile = mock(PatientProfile.class);
        ExerciseSession session =
                ExerciseSession.builder()
                        .patientProfile(patientProfile)
                        .exerciseType(ExerciseType.TOP)
                        .durationSec(78)
                        .averageAccuracy(0.87)
                        .completedMotionCount(4)
                        .build();

        session.prePersist();

        assertThat(session.getPatientProfile()).isSameAs(patientProfile);
        assertThat(session.getExerciseType()).isEqualTo(ExerciseType.TOP);
        assertThat(session.getDurationSec()).isEqualTo(78);
        assertThat(session.getAverageAccuracy()).isEqualTo(0.87);
        assertThat(session.getCompletedMotionCount()).isEqualTo(4);
        assertThat(session.getCreatedAt()).isNotNull();
    }

    @Test
    void builder_rejectsNullPatientProfile() {
        assertThatThrownBy(
                        () ->
                                ExerciseSession.builder()
                                        .patientProfile(null)
                                        .exerciseType(ExerciseType.TOP)
                                        .durationSec(78)
                                        .averageAccuracy(0.87)
                                        .completedMotionCount(4)
                                        .build())
                .isInstanceOf(NullPointerException.class)
                .hasMessageContaining("patientProfile");
    }

    @Test
    void builder_rejectsNullExerciseType() {
        assertThatThrownBy(
                        () ->
                                ExerciseSession.builder()
                                        .patientProfile(mock(PatientProfile.class))
                                        .exerciseType(null)
                                        .durationSec(78)
                                        .averageAccuracy(0.87)
                                        .completedMotionCount(4)
                                        .build())
                .isInstanceOf(NullPointerException.class)
                .hasMessageContaining("exerciseType");
    }

    @Test
    void builder_rejectsNegativeDurationSec() {
        assertThatThrownBy(
                        () ->
                                ExerciseSession.builder()
                                        .patientProfile(mock(PatientProfile.class))
                                        .exerciseType(ExerciseType.TOP)
                                        .durationSec(-1)
                                        .averageAccuracy(0.87)
                                        .completedMotionCount(4)
                                        .build())
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("durationSec");
    }

    @Test
    void builder_rejectsOutOfRangeAverageAccuracy() {
        assertThatThrownBy(
                        () ->
                                ExerciseSession.builder()
                                        .patientProfile(mock(PatientProfile.class))
                                        .exerciseType(ExerciseType.TOP)
                                        .durationSec(78)
                                        .averageAccuracy(1.1)
                                        .completedMotionCount(4)
                                        .build())
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("averageAccuracy");
    }

    @Test
    void builder_rejectsNegativeCompletedMotionCount() {
        assertThatThrownBy(
                        () ->
                                ExerciseSession.builder()
                                        .patientProfile(mock(PatientProfile.class))
                                        .exerciseType(ExerciseType.TOP)
                                        .durationSec(78)
                                        .averageAccuracy(0.87)
                                        .completedMotionCount(-1)
                                        .build())
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("completedMotionCount");
    }
}
