package com.comong.backend.domain.music.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.comong.backend.domain.music.entity.MusicResult;

public interface MusicResultRepository extends JpaRepository<MusicResult, Long> {

    /**
     * 곡별 환자 best 결과 TOP N. 환자별로 score → accuracy → playedAt 우선순위로 단일 best 행을 뽑은 뒤, 그 best 들을 동일한
     * 우선순위로 다시 정렬해 상위 N 개만 반환한다.
     */
    @Query(
            value =
                    "SELECT best.patient_profile_id AS patientProfileId, "
                            + "       p.nickname AS nickname, "
                            + "       best.score AS score, "
                            + "       best.accuracy AS accuracy, "
                            + "       best.max_combo AS maxCombo, "
                            + "       best.rank AS rankGrade, "
                            + "       best.played_at AS playedAt "
                            + "FROM ( "
                            + "  SELECT DISTINCT ON (r.patient_profile_id) "
                            + "    r.patient_profile_id, r.score, r.accuracy, "
                            + "    r.max_combo, r.rank, r.played_at "
                            + "  FROM music_result r "
                            + "  JOIN music_chart c ON c.id = r.music_chart_id "
                            + "  WHERE c.chart_id = :chartId "
                            + "  ORDER BY r.patient_profile_id, "
                            + "           r.score DESC, r.accuracy DESC, r.played_at DESC "
                            + ") best "
                            + "JOIN patient_profiles p ON p.id = best.patient_profile_id "
                            + "ORDER BY best.score DESC, best.accuracy DESC, best.played_at DESC "
                            + "LIMIT :limit",
            nativeQuery = true)
    List<MusicRankingProjection> findChartRankingTop(
            @Param("chartId") String chartId, @Param("limit") int limit);

    /** 곡에 결과가 있는 서로 다른 환자 수 (랭킹 총 인원). */
    @Query(
            value =
                    "SELECT COUNT(DISTINCT r.patient_profile_id) "
                            + "FROM music_result r "
                            + "JOIN music_chart c ON c.id = r.music_chart_id "
                            + "WHERE c.chart_id = :chartId",
            nativeQuery = true)
    long countDistinctPatientsByChartId(@Param("chartId") String chartId);

    /** 곡에서 내 best 점수보다 더 잘 친 환자 수. 내 순위는 이 값 + 1 이다. */
    @Query(
            value =
                    "SELECT COUNT(*) FROM ( "
                            + "  SELECT r.patient_profile_id, MAX(r.score) AS best_score "
                            + "  FROM music_result r "
                            + "  JOIN music_chart c ON c.id = r.music_chart_id "
                            + "  WHERE c.chart_id = :chartId "
                            + "  GROUP BY r.patient_profile_id "
                            + ") bests "
                            + "WHERE bests.best_score > :myScore",
            nativeQuery = true)
    long countPatientsWithBetterScore(
            @Param("chartId") String chartId, @Param("myScore") int myScore);

    Optional<MusicResult>
            findTopByPatientProfileIdAndMusicChartIdOrderByScoreDescAccuracyDescPlayedAtDesc(
                    Long patientProfileId, Long musicChartId);

    @Query(
            "select r from MusicResult r "
                    + "join fetch r.musicChart "
                    + "where r.patientProfile.id = :patientProfileId")
    List<MusicResult> findAllByPatientProfileIdWithMusicChart(
            @Param("patientProfileId") Long patientProfileId);

    @Query(
            value =
                    "select r from MusicResult r "
                            + "join fetch r.musicChart "
                            + "join r.patientProfile p "
                            + "where p.user.id = :userId",
            countQuery =
                    "select count(r) from MusicResult r "
                            + "join r.patientProfile p "
                            + "where p.user.id = :userId")
    Page<MusicResult> findPageByPatientProfileUserIdWithMusicChart(
            @Param("userId") Long userId, Pageable pageable);

    @Query(
            "select r from MusicResult r "
                    + "join fetch r.musicChart "
                    + "join r.patientProfile p "
                    + "where r.id = :resultId "
                    + "and p.user.id = :userId")
    Optional<MusicResult> findByIdAndPatientProfileUserIdWithMusicChart(
            @Param("resultId") Long resultId, @Param("userId") Long userId);
}
