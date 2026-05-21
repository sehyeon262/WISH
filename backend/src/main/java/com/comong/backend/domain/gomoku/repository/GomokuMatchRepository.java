package com.comong.backend.domain.gomoku.repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import jakarta.persistence.LockModeType;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.comong.backend.domain.gomoku.entity.GomokuMatch;
import com.comong.backend.domain.gomoku.entity.GomokuMatchStatus;

public interface GomokuMatchRepository extends JpaRepository<GomokuMatch, Long> {

    boolean existsByRoomCode(String roomCode);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select m from GomokuMatch m where m.id = :id")
    Optional<GomokuMatch> findByIdForUpdate(@Param("id") Long id);

    @Query(
            "select m from GomokuMatch m "
                    + "where m.status = :status "
                    + "and m.whitePatientProfile is null "
                    + "and coalesce(m.blackLastSeenAt, m.updatedAt) >= :activeAfter")
    Page<GomokuMatch> findJoinableWaitingRooms(
            @Param("status") GomokuMatchStatus status,
            @Param("activeAfter") LocalDateTime activeAfter,
            Pageable pageable);

    @Query(
            "select m from GomokuMatch m "
                    + "where (m.status = :waitingStatus "
                    + "and m.whitePatientProfile is null "
                    + "and coalesce(m.blackLastSeenAt, m.updatedAt) >= :waitingActiveAfter) "
                    + "or (m.status = :playingStatus "
                    + "and m.whitePatientProfile is not null "
                    + "and (coalesce(m.blackLastSeenAt, m.updatedAt) >= :playingActiveAfter "
                    + "or coalesce(m.whiteLastSeenAt, m.updatedAt) >= :playingActiveAfter))")
    Page<GomokuMatch> findOpenRooms(
            @Param("waitingStatus") GomokuMatchStatus waitingStatus,
            @Param("playingStatus") GomokuMatchStatus playingStatus,
            @Param("waitingActiveAfter") LocalDateTime waitingActiveAfter,
            @Param("playingActiveAfter") LocalDateTime playingActiveAfter,
            Pageable pageable);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query(
            "select m from GomokuMatch m "
                    + "where (m.status = :waitingStatus "
                    + "and (coalesce(m.blackLastSeenAt, m.updatedAt) < :waitingStaleBefore "
                    + "or (m.whitePatientProfile is not null "
                    + "and coalesce(m.whiteLastSeenAt, m.updatedAt) < :waitingStaleBefore))) "
                    + "or (m.status = :playingStatus "
                    + "and (coalesce(m.blackLastSeenAt, m.updatedAt) < :playingStaleBefore "
                    + "or coalesce(m.whiteLastSeenAt, m.updatedAt) < :playingStaleBefore))")
    List<GomokuMatch> findStaleActiveRoomsForUpdate(
            @Param("waitingStatus") GomokuMatchStatus waitingStatus,
            @Param("playingStatus") GomokuMatchStatus playingStatus,
            @Param("waitingStaleBefore") LocalDateTime waitingStaleBefore,
            @Param("playingStaleBefore") LocalDateTime playingStaleBefore);

    Optional<GomokuMatch> findByRematchSourceMatchId(Long rematchSourceMatchId);

    @Query(
            value =
                    "select m from GomokuMatch m "
                            + "left join fetch m.blackPatientProfile bp "
                            + "left join fetch bp.user "
                            + "left join fetch m.whitePatientProfile wp "
                            + "left join fetch wp.user "
                            + "left join fetch m.winnerPatientProfile winner "
                            + "where m.id = :id")
    Optional<GomokuMatch> findByIdWithPlayers(@Param("id") Long id);

    @Query(
            value =
                    "select m from GomokuMatch m "
                            + "left join fetch m.blackPatientProfile bp "
                            + "left join fetch bp.user "
                            + "left join fetch m.whitePatientProfile wp "
                            + "left join fetch wp.user "
                            + "left join fetch m.winnerPatientProfile winner "
                            + "where bp.user.id = :userId or wp.user.id = :userId",
            countQuery =
                    "select count(m) from GomokuMatch m "
                            + "join m.blackPatientProfile bp "
                            + "left join m.whitePatientProfile wp "
                            + "where bp.user.id = :userId or wp.user.id = :userId")
    Page<GomokuMatch> findPageByParticipantUserId(@Param("userId") Long userId, Pageable pageable);

    @Query(
            value =
                    "SELECT COUNT(*) "
                            + "FROM gomoku_matches m "
                            + "WHERE m.ranked = true "
                            + "  AND m.status = 'FINISHED' "
                            + "  AND (m.black_patient_profile_id = :patientProfileId "
                            + "       OR m.white_patient_profile_id = :patientProfileId)",
            nativeQuery = true)
    long countRankedGames(@Param("patientProfileId") Long patientProfileId);

    @Query(
            value =
                    "SELECT COUNT(*) "
                            + "FROM gomoku_matches m "
                            + "WHERE m.ranked = true "
                            + "  AND m.status = 'FINISHED' "
                            + "  AND m.winner_patient_profile_id = :patientProfileId",
            nativeQuery = true)
    long countRankedWins(@Param("patientProfileId") Long patientProfileId);

    @Query(
            value =
                    "SELECT COUNT(*) "
                            + "FROM gomoku_matches m "
                            + "WHERE m.ranked = true "
                            + "  AND m.status = 'FINISHED' "
                            + "  AND m.result = 'DRAW' "
                            + "  AND (m.black_patient_profile_id = :patientProfileId "
                            + "       OR m.white_patient_profile_id = :patientProfileId)",
            nativeQuery = true)
    long countRankedDraws(@Param("patientProfileId") Long patientProfileId);

    @Query(
            value =
                    "SELECT COUNT(*) FROM ( "
                            + "  SELECT participant.patient_profile_id "
                            + "  FROM ( "
                            + "    SELECT black_patient_profile_id AS patient_profile_id "
                            + "    FROM gomoku_matches "
                            + "    WHERE ranked = true AND status = 'FINISHED' "
                            + "    UNION ALL "
                            + "    SELECT white_patient_profile_id AS patient_profile_id "
                            + "    FROM gomoku_matches "
                            + "    WHERE ranked = true AND status = 'FINISHED' "
                            + "  ) participant "
                            + "  WHERE participant.patient_profile_id IS NOT NULL "
                            + "  GROUP BY participant.patient_profile_id "
                            + "  HAVING COUNT(*) >= :minGames "
                            + ") ranked_players",
            nativeQuery = true)
    long countRankedPlayers(@Param("minGames") int minGames);

    @Query(
            value =
                    "SELECT s.patient_profile_id AS patientProfileId, "
                            + "       p.nickname AS nickname, "
                            + "       COUNT(*)::int AS totalGames, "
                            + "       SUM(CASE WHEN s.outcome = 'WIN' THEN 1 ELSE 0 END)::int AS wins, "
                            + "       SUM(CASE WHEN s.outcome = 'DRAW' THEN 1 ELSE 0 END)::int AS draws, "
                            + "       SUM(CASE WHEN s.outcome = 'LOSS' THEN 1 ELSE 0 END)::int AS losses, "
                            + "       (SUM(CASE WHEN s.outcome = 'WIN' THEN 1 ELSE 0 END)::float / COUNT(*)) AS winRate, "
                            + "       MAX(s.finished_at) AS lastPlayedAt "
                            + "FROM ( "
                            + "  SELECT black_patient_profile_id AS patient_profile_id, "
                            + "         CASE "
                            + "           WHEN result = 'BLACK_WIN' THEN 'WIN' "
                            + "           WHEN result = 'WHITE_WIN' THEN 'LOSS' "
                            + "           ELSE 'DRAW' "
                            + "         END AS outcome, "
                            + "         finished_at "
                            + "  FROM gomoku_matches "
                            + "  WHERE ranked = true AND status = 'FINISHED' "
                            + "  UNION ALL "
                            + "  SELECT white_patient_profile_id AS patient_profile_id, "
                            + "         CASE "
                            + "           WHEN result = 'WHITE_WIN' THEN 'WIN' "
                            + "           WHEN result = 'BLACK_WIN' THEN 'LOSS' "
                            + "           ELSE 'DRAW' "
                            + "         END AS outcome, "
                            + "         finished_at "
                            + "  FROM gomoku_matches "
                            + "  WHERE ranked = true AND status = 'FINISHED' "
                            + ") s "
                            + "JOIN patient_profiles p ON p.id = s.patient_profile_id "
                            + "GROUP BY s.patient_profile_id, p.nickname "
                            + "HAVING COUNT(*) >= :minGames "
                            + "ORDER BY wins DESC, winRate DESC, totalGames DESC, lastPlayedAt DESC "
                            + "LIMIT :limit",
            nativeQuery = true)
    List<GomokuRankingProjection> findRanking(
            @Param("minGames") int minGames, @Param("limit") int limit);
}
