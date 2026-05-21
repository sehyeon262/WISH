package com.comong.backend.domain.taekwondo.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.comong.backend.domain.taekwondo.entity.Poomsae;
import com.comong.backend.domain.taekwondo.entity.TaekwondoMotion;

public interface TaekwondoMotionRepository extends JpaRepository<TaekwondoMotion, Long> {

    List<TaekwondoMotion> findAllByPoomsaeOrderByRoutineOrderAsc(Poomsae poomsae);

    boolean existsByPoomsaeAndRoutineOrder(Poomsae poomsae, int routineOrder);

    boolean existsByPoomsaeAndRoutineOrderAndIdNot(Poomsae poomsae, int routineOrder, Long id);

    boolean existsByPoomsaeAndName(Poomsae poomsae, String name);

    boolean existsByPoomsaeAndNameAndIdNot(Poomsae poomsae, String name, Long id);
}
