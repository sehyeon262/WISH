package com.comong.backend.domain.dialogue.repository;

import java.time.LocalDateTime;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.comong.backend.domain.dialogue.entity.DialogueSession;
import com.comong.backend.domain.dialogue.entity.NpcName;

public interface DialogueSessionRepository
        extends JpaRepository<DialogueSession, Long>, JpaSpecificationExecutor<DialogueSession> {

    /**
     * 한 환자가 특정 NPC 와 진행했던 최근 세션들의 scriptId 를 시간 역순으로 조회.
     *
     * <p>"안 본 script 우선" 선택 로직의 입력이다. null script_id (등대 세션) 는 자연스럽게 결과에 섞일 수 있으나 caller 가 필터링.
     */
    @Query(
            """
            SELECT s.scriptId
            FROM DialogueSession s
            WHERE s.patientProfile.id = :patientProfileId
              AND s.npcName = :npcName
              AND s.scriptId IS NOT NULL
            ORDER BY s.startedAt DESC
            """)
    List<String> findRecentScriptIds(
            @Param("patientProfileId") Long patientProfileId, @Param("npcName") NpcName npcName);

    /**
     * 환자의 특정 기간 (KST) 동안 시작된 세션 목록. 보호자 페이지의 일별/주별 요약에서 사용.
     *
     * <p>{@code from} inclusive, {@code to} exclusive.
     */
    @Query(
            """
            SELECT s
            FROM DialogueSession s
            WHERE s.patientProfile.id = :patientProfileId
              AND s.startedAt >= :from
              AND s.startedAt < :to
            ORDER BY s.startedAt ASC
            """)
    List<DialogueSession> findInRange(
            @Param("patientProfileId") Long patientProfileId,
            @Param("from") LocalDateTime from,
            @Param("to") LocalDateTime to);
}
