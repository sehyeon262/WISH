package com.comong.backend.domain.usage.service;

import java.time.LocalDate;
import java.util.HashMap;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.comong.backend.domain.patient.entity.PatientProfile;
import com.comong.backend.domain.patient.repository.PatientProfileRepository;
import com.comong.backend.domain.usage.entity.ContentType;
import com.comong.backend.domain.usage.entity.DailyUsageStat;
import com.comong.backend.domain.usage.repository.DailyUsageStatRepository;
import com.comong.backend.domain.usage.repository.UsageAggregationQuery;
import com.comong.backend.domain.usage.repository.UsageAggregationQuery.ArtAggregate;
import com.comong.backend.domain.usage.repository.UsageAggregationQuery.PatientAggregate;

import lombok.RequiredArgsConstructor;

/**
 * 5종 source 에서 환자별 전일 활동량을 뽑아 {@code daily_usage_stat} 에 적재하는 일별 배치.
 *
 * <p>매일 KST 01:00 에 {@link com.comong.backend.domain.usage.scheduler.DailyUsageStatScheduler} 가
 * {@link #aggregateForDate(LocalDate)} 를 호출. 메서드 자체는 임의 날짜를 받아 처리할 수 있어 수동 재실행/백필도 가능 (idempotent
 * UPSERT — 같은 (date, type, patient) 행 있으면 덮어쓴다).
 *
 * <p>ART 의 일별 증가분 계산이 다른 컨텐츠와 다르다 — {@code artworks.play_duration_seconds} 는 작품별 누적이라 "전일 증가분" 을 직접
 * 못 뽑는다. (환자의 현재 ART 누적합) - (환자의 전일 이전 daily_usage_stat ART 합) 으로 diff 를 구한다. 배치 실행 시점 (D 01:00) 에
 * D-1 분을 처리하면 D 의 0~1시 활동이 D-1 분에 섞여 들어가는 1시간 phase shift 가 생기지만 무시 가능.
 *
 * <p>한 환자가 해당일에 활동하지 않은 컨텐츠 타입에는 row 를 만들지 않는다 (sparse 적재 — 543 조회는 없는 행을 0 으로 처리).
 */
@Service
@RequiredArgsConstructor
public class DailyUsageStatBatchService {

    private static final Logger log = LoggerFactory.getLogger(DailyUsageStatBatchService.class);

    private final DailyUsageStatRepository dailyUsageStatRepository;
    private final UsageAggregationQuery usageAggregationQuery;
    private final PatientProfileRepository patientProfileRepository;

    /** 지정 날짜에 대한 5종 컨텐츠 환자별 집계를 모두 UPSERT. 단일 트랜잭션 — 일부 성공/일부 실패 상태 방지. */
    @Transactional
    public void aggregateForDate(LocalDate statDate) {
        log.info("Daily usage stat aggregation start: statDate={}", statDate);

        upsertContent(
                statDate,
                ContentType.LOGIN,
                usageAggregationQuery.aggregateLoginPerPatient(statDate));
        upsertContent(
                statDate,
                ContentType.MUSIC,
                usageAggregationQuery.aggregateMusicPerPatient(statDate));
        upsertContent(
                statDate,
                ContentType.TAEKWONDO,
                usageAggregationQuery.aggregateTaekwondoPerPatient(statDate));
        upsertContent(
                statDate,
                ContentType.GYMNASTICS,
                usageAggregationQuery.aggregateGymnasticsPerPatient(statDate));

        upsertArt(statDate);

        log.info("Daily usage stat aggregation done: statDate={}", statDate);
    }

    private void upsertContent(
            LocalDate statDate, ContentType contentType, java.util.List<PatientAggregate> rows) {
        for (PatientAggregate r : rows) {
            upsertOne(statDate, contentType, r.patientProfileId(), r.totalSeconds());
        }
    }

    /** ART 전용 — 환자별 누적값과 prior daily 합 diff 로 증가분 계산. 해당일 작품 수정한 환자에 한해 row 작성. */
    private void upsertArt(LocalDate statDate) {
        ArtAggregate art = usageAggregationQuery.aggregateArtPerPatient(statDate);

        Map<Long, Long> cumulativeByPatient = new HashMap<>();
        for (PatientAggregate p : art.totalsByPatient()) {
            cumulativeByPatient.put(p.patientProfileId(), p.totalSeconds());
        }

        for (Long patientId : art.activePatientIds()) {
            long current = cumulativeByPatient.getOrDefault(patientId, 0L);
            long prior =
                    dailyUsageStatRepository.sumTotalSecondsByContentTypeBeforeForPatient(
                            patientId, ContentType.ART, statDate);
            long increment = Math.max(0L, current - prior);
            upsertOne(statDate, ContentType.ART, patientId, increment);
        }
    }

    private void upsertOne(
            LocalDate statDate, ContentType contentType, long patientId, long totalSeconds) {
        dailyUsageStatRepository
                .findByStatDateAndContentTypeAndPatientProfileId(statDate, contentType, patientId)
                .ifPresentOrElse(
                        existing -> existing.overwriteTotalSeconds(totalSeconds),
                        () -> {
                            PatientProfile patient =
                                    patientProfileRepository
                                            .findById(patientId)
                                            .orElseThrow(
                                                    () ->
                                                            new IllegalStateException(
                                                                    "patient not found in batch: id="
                                                                            + patientId));
                            dailyUsageStatRepository.save(
                                    DailyUsageStat.builder()
                                            .statDate(statDate)
                                            .contentType(contentType)
                                            .patientProfile(patient)
                                            .totalSeconds(totalSeconds)
                                            .build());
                        });
    }
}
