package com.comong.backend.domain.taekwondo.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.comong.backend.domain.taekwondo.entity.TaekwondoProgress;

public interface TaekwondoProgressRepository extends JpaRepository<TaekwondoProgress, Long> {

    Optional<TaekwondoProgress> findByPatientProfileId(Long patientProfileId);
}
