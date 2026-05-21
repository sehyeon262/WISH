package com.comong.backend.domain.patient.repository;

import java.util.List;
import java.util.Optional;

import jakarta.persistence.LockModeType;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.comong.backend.domain.patient.entity.PatientProfile;

public interface PatientProfileRepository extends JpaRepository<PatientProfile, Long> {

    List<PatientProfile> findAllByUserId(Long userId);

    @Query("select p from PatientProfile p join fetch p.user")
    List<PatientProfile> findAllWithUser();

    @Query("select p from PatientProfile p join fetch p.user where p.id = :id")
    Optional<PatientProfile> findByIdWithUser(@Param("id") Long id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from PatientProfile p join fetch p.user where p.user.id = :userId")
    Optional<PatientProfile> findFirstByUserIdForUpdate(@Param("userId") Long userId);

    boolean existsByUserId(Long userId);

    boolean existsByIdAndUserId(Long id, Long userId);

    long countByCreatedAtBetween(java.time.LocalDateTime start, java.time.LocalDateTime end);
}
