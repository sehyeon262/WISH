package com.comong.backend.domain.usage.repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import com.comong.backend.domain.usage.entity.ContentType;
import com.comong.backend.domain.usage.entity.DailyUsageStat;

public interface DailyUsageStatRepository extends JpaRepository<DailyUsageStat, Long> {

    /** 배치 UPSERT 분기, 543 조회 단건 lookup 시 사용. UNIQUE (date, type, patient) 로 0..1 row. */
    Optional<DailyUsageStat> findByStatDateAndContentTypeAndPatientProfileId(
            LocalDate statDate, ContentType contentType, Long patientProfileId);

    /** 543 일별 조회: 환자 × 기간 × 모든 content_type 한 번에. */
    List<DailyUsageStat> findAllByPatientProfileIdAndStatDateBetween(
            Long patientProfileId, LocalDate from, LocalDate to);

    @Query(
            "select s from DailyUsageStat s "
                    + "join fetch s.patientProfile "
                    + "where s.statDate between :from and :to")
    List<DailyUsageStat> findAllWithPatientByStatDateBetween(LocalDate from, LocalDate to);

    @Query(
            "select s from DailyUsageStat s "
                    + "join fetch s.patientProfile "
                    + "where s.statDate <= :to")
    List<DailyUsageStat> findAllWithPatientByStatDateLessThanEqual(LocalDate to);

    /** 543 누적 조회: 환자별 컨텐츠 타입별 누적 합. content_type 별 행 5개 반환. */
    @Query(
            "select new com.comong.backend.domain.usage.repository.ContentTypeTotal("
                    + "s.contentType, coalesce(sum(s.totalSeconds), 0)) "
                    + "from DailyUsageStat s "
                    + "where s.patientProfile.id = :patientProfileId "
                    + "group by s.contentType")
    List<ContentTypeTotal> sumTotalSecondsByContentTypeForPatient(Long patientProfileId);

    /**
     * 미술 일별 증가분 계산용 — 어제까지 환자 P 의 ART 누적 합. 배치가 환자별 {@code SUM(artworks.play_duration_seconds)} 와
     * diff 해서 전일 증가분을 도출한다.
     */
    @Query(
            "select coalesce(sum(s.totalSeconds), 0) from DailyUsageStat s "
                    + "where s.patientProfile.id = :patientProfileId "
                    + "and s.contentType = :contentType "
                    + "and s.statDate < :before")
    long sumTotalSecondsByContentTypeBeforeForPatient(
            Long patientProfileId, ContentType contentType, LocalDate before);
}
