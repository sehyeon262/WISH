package com.comong.backend.domain.fuel.repository;

import java.util.Collection;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.comong.backend.domain.fuel.entity.FuelEvent;

public interface FuelEventRepository extends JpaRepository<FuelEvent, Long> {

    @Query("select coalesce(sum(f.amount), 0) from FuelEvent f where f.patient.id = :patientId")
    long sumAmountByPatientId(@Param("patientId") Long patientId);

    List<FuelEvent> findAllByPatient_IdOrderByCreatedAtDescIdDesc(Long patientId);

    List<FuelEvent> findAllByPatient_IdAndConsumedAtIsNullOrderByCreatedAtAscIdAsc(Long patientId);

    List<FuelEvent> findAllByPatient_IdAndIdInAndConsumedAtIsNull(
            Long patientId, Collection<Long> ids);
}
