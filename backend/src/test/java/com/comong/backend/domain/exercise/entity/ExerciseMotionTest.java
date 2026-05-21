package com.comong.backend.domain.exercise.entity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class ExerciseMotionTest {

    @Test
    void builder_setsFieldsAndTimestamp() {
        ExerciseMotion exerciseMotion =
                ExerciseMotion.builder()
                        .exerciseType(ExerciseType.TOP)
                        .name("March")
                        .routineOrder(1)
                        .targetReps(8)
                        .description("Walk in place.")
                        .demoVideoUrl("https://example.com/march.mp4")
                        .thumbnailUrl("https://example.com/march.png")
                        .build();

        exerciseMotion.prePersist();

        assertThat(exerciseMotion.getExerciseType()).isEqualTo(ExerciseType.TOP);
        assertThat(exerciseMotion.getName()).isEqualTo("March");
        assertThat(exerciseMotion.getRoutineOrder()).isEqualTo(1);
        assertThat(exerciseMotion.getTargetReps()).isEqualTo(8);
        assertThat(exerciseMotion.getDescription()).isEqualTo("Walk in place.");
        assertThat(exerciseMotion.getDemoVideoUrl()).isEqualTo("https://example.com/march.mp4");
        assertThat(exerciseMotion.getThumbnailUrl()).isEqualTo("https://example.com/march.png");
        assertThat(exerciseMotion.getCreatedAt()).isNotNull();
        assertThat(exerciseMotion.getUpdatedAt()).isNotNull();
    }

    @Test
    void builder_rejectsNullExerciseType() {
        assertThatThrownBy(
                        () ->
                                ExerciseMotion.builder()
                                        .exerciseType(null)
                                        .name("March")
                                        .routineOrder(1)
                                        .targetReps(8)
                                        .description("Walk in place.")
                                        .build())
                .isInstanceOf(NullPointerException.class)
                .hasMessageContaining("exerciseType");
    }

    @Test
    void builder_rejectsNonPositiveRoutineOrder() {
        assertThatThrownBy(
                        () ->
                                ExerciseMotion.builder()
                                        .exerciseType(ExerciseType.TOP)
                                        .name("March")
                                        .routineOrder(0)
                                        .targetReps(8)
                                        .description("Walk in place.")
                                        .build())
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("routineOrder");
    }

    @Test
    void builder_rejectsNonPositiveTargetReps() {
        assertThatThrownBy(
                        () ->
                                ExerciseMotion.builder()
                                        .exerciseType(ExerciseType.TOP)
                                        .name("March")
                                        .routineOrder(1)
                                        .targetReps(0)
                                        .description("Walk in place.")
                                        .build())
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("targetReps");
    }

    @Test
    void builder_rejectsNullDescription() {
        assertThatThrownBy(
                        () ->
                                ExerciseMotion.builder()
                                        .exerciseType(ExerciseType.TOP)
                                        .name("March")
                                        .routineOrder(1)
                                        .targetReps(8)
                                        .description(null)
                                        .build())
                .isInstanceOf(NullPointerException.class)
                .hasMessageContaining("description");
    }

    @Test
    void updateMetadata_updatesRoutineOrderAndTextFields() {
        ExerciseMotion exerciseMotion =
                ExerciseMotion.builder()
                        .exerciseType(ExerciseType.TOP)
                        .name("March")
                        .routineOrder(1)
                        .targetReps(8)
                        .description("Walk in place.")
                        .build();

        exerciseMotion.updateMetadata("Side step", 2, 10, "Move side to side.");

        assertThat(exerciseMotion.getName()).isEqualTo("Side step");
        assertThat(exerciseMotion.getRoutineOrder()).isEqualTo(2);
        assertThat(exerciseMotion.getTargetReps()).isEqualTo(10);
        assertThat(exerciseMotion.getDescription()).isEqualTo("Move side to side.");
    }

    @Test
    void updateMetadata_rejectsNonPositiveRoutineOrder() {
        ExerciseMotion exerciseMotion =
                ExerciseMotion.builder()
                        .exerciseType(ExerciseType.TOP)
                        .name("March")
                        .routineOrder(1)
                        .targetReps(8)
                        .description("Walk in place.")
                        .build();

        assertThatThrownBy(() -> exerciseMotion.updateMetadata(null, 0, null, null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("routineOrder");
    }
}
