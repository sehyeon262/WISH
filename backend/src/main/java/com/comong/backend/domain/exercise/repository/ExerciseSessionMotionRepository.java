package com.comong.backend.domain.exercise.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.comong.backend.domain.exercise.dto.ExerciseSessionMotionResponseRow;
import com.comong.backend.domain.exercise.entity.ExerciseSessionMotion;

public interface ExerciseSessionMotionRepository
        extends JpaRepository<ExerciseSessionMotion, Long> {

    List<ExerciseSessionMotion> findAllBySessionId(Long sessionId);

    @Query(
            "select new com.comong.backend.domain.exercise.dto.ExerciseSessionMotionResponseRow("
                    + "sm.id, m.id, m.name, m.routineOrder, sm.durationSec, sm.accuracy, "
                    + "sm.completedReps, sm.feedback, pv.videoKey, pv.thumbKey, "
                    + "case when sm.poseReplay is not null or sm.compactPoseReplay is not null "
                    + "then true else false end, sm.createdAt) "
                    + "from ExerciseSessionMotion sm "
                    + "join sm.exerciseMotion m "
                    + "left join sm.performanceVideo pv "
                    + "where sm.session.id = :sessionId "
                    + "order by m.routineOrder asc")
    List<ExerciseSessionMotionResponseRow> findResponseRowsBySessionIdOrderByRoutineOrderAsc(
            @Param("sessionId") Long sessionId);

    @Query(
            "select sm from ExerciseSessionMotion sm "
                    + "join fetch sm.session s "
                    + "join fetch s.patientProfile p "
                    + "join fetch p.user "
                    + "join fetch sm.exerciseMotion "
                    + "where sm.id = :id")
    Optional<ExerciseSessionMotion> findByIdWithSessionPatientAndExerciseMotion(
            @Param("id") Long id);

    boolean existsByExerciseMotionId(Long exerciseMotionId);
}
