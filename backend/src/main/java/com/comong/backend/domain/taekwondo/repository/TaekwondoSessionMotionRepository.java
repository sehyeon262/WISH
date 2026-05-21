package com.comong.backend.domain.taekwondo.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.comong.backend.domain.taekwondo.entity.TaekwondoSessionMotion;

public interface TaekwondoSessionMotionRepository
        extends JpaRepository<TaekwondoSessionMotion, Long> {

    @Query(
            "select sm from TaekwondoSessionMotion sm "
                    + "join fetch sm.motion m "
                    + "left join fetch sm.performanceVideo "
                    + "where sm.session.id = :sessionId "
                    + "order by m.routineOrder asc")
    List<TaekwondoSessionMotion> findAllBySessionIdWithMotionOrderByRoutineOrderAsc(
            @Param("sessionId") Long sessionId);

    boolean existsByMotionId(Long motionId);
}
