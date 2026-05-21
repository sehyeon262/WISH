package com.comong.backend.domain.gomoku.repository;

import java.time.LocalDateTime;
import java.util.List;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.comong.backend.domain.gomoku.entity.GomokuChatMessage;

public interface GomokuChatMessageRepository extends JpaRepository<GomokuChatMessage, Long> {

    @Query(
            "select m from GomokuChatMessage m "
                    + "left join fetch m.senderPatientProfile "
                    + "where m.match.id = :matchId "
                    + "order by m.id desc")
    List<GomokuChatMessage> findRecentByMatchId(@Param("matchId") Long matchId, Pageable pageable);

    long countByMatchIdAndSenderPatientProfileIdAndCreatedAtAfter(
            Long matchId, Long senderPatientProfileId, LocalDateTime createdAtAfter);
}
