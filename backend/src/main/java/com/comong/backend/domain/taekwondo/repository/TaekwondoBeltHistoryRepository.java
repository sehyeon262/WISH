package com.comong.backend.domain.taekwondo.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.comong.backend.domain.taekwondo.entity.TaekwondoBeltHistory;

public interface TaekwondoBeltHistoryRepository extends JpaRepository<TaekwondoBeltHistory, Long> {

    @Query(
            "select h from TaekwondoBeltHistory h "
                    + "join fetch h.triggerSession "
                    + "where h.patientProfile.id = :patientProfileId "
                    + "order by h.promotedAt desc")
    List<TaekwondoBeltHistory> findAllByPatientProfileIdOrderByPromotedAtDesc(
            @Param("patientProfileId") Long patientProfileId);
}
