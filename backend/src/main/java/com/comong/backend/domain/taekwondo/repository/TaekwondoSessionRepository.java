package com.comong.backend.domain.taekwondo.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.comong.backend.domain.taekwondo.entity.TaekwondoSession;

public interface TaekwondoSessionRepository extends JpaRepository<TaekwondoSession, Long> {

    List<TaekwondoSession> findAllByPatientProfileIdOrderByCreatedAtDesc(Long patientId);

    @Query(
            "select s from TaekwondoSession s "
                    + "join fetch s.patientProfile p "
                    + "join fetch p.user "
                    + "where s.id = :id")
    Optional<TaekwondoSession> findByIdWithPatientProfileAndUser(@Param("id") Long id);

    @Query(
            "select avg(s.averageAccuracy) from TaekwondoSession s "
                    + "where s.patientProfile.id = :patientProfileId")
    Optional<Double> averageAccuracyByPatientProfileId(
            @Param("patientProfileId") Long patientProfileId);
}
