package com.comong.backend.domain.dialogue.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.comong.backend.domain.dialogue.entity.DialogueTurn;

public interface DialogueTurnRepository extends JpaRepository<DialogueTurn, Long> {

    List<DialogueTurn> findAllBySessionIdOrderByStepIndexAsc(Long sessionId);

    /** 여러 세션의 turns 를 한 번에. 보호자 일별 요약 집계용. */
    List<DialogueTurn> findAllBySessionIdInOrderBySessionIdAscStepIndexAsc(List<Long> sessionIds);
}
