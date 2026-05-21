package com.comong.backend.domain.exercise.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.comong.backend.domain.exercise.entity.ExerciseSession;

public interface ExerciseSessionRepository extends JpaRepository<ExerciseSession, Long> {

    List<ExerciseSession> findAllByPatientProfileIdOrderByCreatedAtDesc(Long patientId);

    @Query(
            "select s from ExerciseSession s "
                    + "join fetch s.patientProfile p "
                    + "join fetch p.user "
                    + "where s.id = :id")
    Optional<ExerciseSession> findByIdWithPatientProfileAndUser(@Param("id") Long id);
}
