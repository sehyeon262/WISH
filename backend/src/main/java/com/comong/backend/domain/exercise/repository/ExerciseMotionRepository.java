package com.comong.backend.domain.exercise.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.comong.backend.domain.exercise.entity.ExerciseMotion;
import com.comong.backend.domain.exercise.entity.ExerciseType;

public interface ExerciseMotionRepository extends JpaRepository<ExerciseMotion, Long> {

    List<ExerciseMotion> findAllByExerciseTypeOrderByRoutineOrderAsc(ExerciseType exerciseType);

    boolean existsByExerciseTypeAndRoutineOrder(ExerciseType exerciseType, int routineOrder);

    boolean existsByExerciseTypeAndRoutineOrderAndIdNot(
            ExerciseType exerciseType, int routineOrder, Long id);
}
