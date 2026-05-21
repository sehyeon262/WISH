package com.comong.backend.domain.usage.service;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.comong.backend.domain.patient.entity.PatientProfile;
import com.comong.backend.domain.patient.repository.PatientProfileRepository;
import com.comong.backend.domain.usage.dto.UsageRankingResponse;
import com.comong.backend.domain.usage.entity.ContentType;
import com.comong.backend.domain.usage.entity.DailyUsageStat;
import com.comong.backend.domain.usage.repository.DailyUsageStatRepository;
import com.comong.backend.domain.usage.repository.UsageAggregationQuery;
import com.comong.backend.global.exception.BusinessException;
import com.comong.backend.global.exception.GlobalErrorCode;

import lombok.RequiredArgsConstructor;

/**
 * 보호자 리포트 "사용 시간 순위" — 전체 환자 닉네임 × 기간 합산 사용 시간 정렬.
 *
 * <p>LOGIN(로비/메뉴 포함) 은 실제 활동성을 부풀리므로 제외하고 컨텐츠 4종(ART/MUSIC/TAEKWONDO/GYMNASTICS) 합으로 집계한다. {@link
 * UsageAverageService} 와 동일한 기간 산정 + 캐시(과거) + 라이브(today) 패턴이지만 환자별 합산이 필요해 별도 누적기로 모은다.
 *
 * <p>활동 0초 환자도 응답에 포함된다 — 본인이 한 번도 안 했어도 공동 꼴등으로 표시되도록. 동률은 표준 경기 순위 (1, 2, 2, 4) 로 같은 rank 를 부여한다.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class UsageRankingService {

    private final DailyUsageStatRepository dailyUsageStatRepository;
    private final UsageAggregationQuery usageAggregationQuery;
    private final PatientProfileRepository patientProfileRepository;

    public UsageRankingResponse periodRankings(LocalDate from, LocalDate to) {
        LocalDate today = LocalDate.now();
        LocalDate effectiveTo = to != null ? to : today;
        if (from != null && from.isAfter(effectiveTo)) {
            throw new BusinessException(GlobalErrorCode.INVALID_INPUT);
        }

        Map<Long, Accumulator> byPatient = new HashMap<>();

        // 0. 모든 환자 baseline — 활동 0초 환자도 공동 꼴등으로 표시되도록 미리 등록
        for (PatientProfile profile : patientProfileRepository.findAll()) {
            byPatient.put(profile.getId(), new Accumulator(profile.getNickname()));
        }

        // 1. 캐시된 daily 행 — today 와 LOGIN 은 제외
        List<DailyUsageStat> cachedRows =
                from != null
                        ? dailyUsageStatRepository.findAllWithPatientByStatDateBetween(
                                from, effectiveTo)
                        : dailyUsageStatRepository.findAllWithPatientByStatDateLessThanEqual(
                                effectiveTo);
        for (DailyUsageStat row : cachedRows) {
            if (row.getStatDate().equals(today)) {
                continue;
            }
            if (row.getContentType() == ContentType.LOGIN) {
                continue;
            }
            Accumulator accumulator = byPatient.get(row.getPatientProfile().getId());
            if (accumulator != null) {
                accumulator.add(row.getTotalSeconds());
            }
        }

        // 2. today 분 — range 포함 시 라이브 계산
        boolean includesToday =
                (from == null || !today.isBefore(from)) && !today.isAfter(effectiveTo);
        if (includesToday) {
            Map<Long, Long> todayLive = computeContentLiveForDate(today);
            for (Map.Entry<Long, Long> entry : todayLive.entrySet()) {
                Accumulator accumulator = byPatient.get(entry.getKey());
                if (accumulator != null && entry.getValue() > 0) {
                    accumulator.add(entry.getValue());
                }
            }
        }

        // 정렬 후 표준 경기 순위(1, 2, 2, 4 …) 부여 — 동률은 같은 rank
        List<Map.Entry<Long, Accumulator>> sorted =
                byPatient.entrySet().stream()
                        .sorted(
                                Comparator.<Map.Entry<Long, Accumulator>>comparingLong(
                                                e -> -e.getValue().totalSeconds)
                                        .thenComparing(e -> e.getValue().nickname))
                        .toList();

        List<UsageRankingResponse.RankingEntry> rankings = new ArrayList<>(sorted.size());
        long previousSeconds = Long.MIN_VALUE;
        int previousRank = 0;
        for (int i = 0; i < sorted.size(); i++) {
            Map.Entry<Long, Accumulator> entry = sorted.get(i);
            long seconds = entry.getValue().totalSeconds;
            int rank = (seconds == previousSeconds) ? previousRank : i + 1;
            rankings.add(
                    new UsageRankingResponse.RankingEntry(
                            rank, entry.getKey(), entry.getValue().nickname, seconds));
            previousSeconds = seconds;
            previousRank = rank;
        }

        return new UsageRankingResponse(from, effectiveTo, rankings);
    }

    /** today 의 컨텐츠 4종 합 (LOGIN 제외). 환자별 totalSeconds 맵. ART 는 누적 - prior daily 합으로 today 증가분 도출. */
    private Map<Long, Long> computeContentLiveForDate(LocalDate date) {
        Map<Long, Long> sums = new HashMap<>();
        for (UsageAggregationQuery.PatientAggregate row :
                usageAggregationQuery.aggregateMusicPerPatient(date)) {
            sums.merge(row.patientProfileId(), row.totalSeconds(), Long::sum);
        }
        for (UsageAggregationQuery.PatientAggregate row :
                usageAggregationQuery.aggregateTaekwondoPerPatient(date)) {
            sums.merge(row.patientProfileId(), row.totalSeconds(), Long::sum);
        }
        for (UsageAggregationQuery.PatientAggregate row :
                usageAggregationQuery.aggregateGymnasticsPerPatient(date)) {
            sums.merge(row.patientProfileId(), row.totalSeconds(), Long::sum);
        }
        UsageAggregationQuery.ArtAggregate art = usageAggregationQuery.aggregateArtPerPatient(date);
        Map<Long, Long> cumulativeArtByPatient = new HashMap<>();
        for (UsageAggregationQuery.PatientAggregate row : art.totalsByPatient()) {
            cumulativeArtByPatient.put(row.patientProfileId(), row.totalSeconds());
        }
        for (Long patientId : art.activePatientIds()) {
            long prior =
                    dailyUsageStatRepository.sumTotalSecondsByContentTypeBeforeForPatient(
                            patientId, ContentType.ART, date);
            long current = cumulativeArtByPatient.getOrDefault(patientId, 0L);
            long delta = Math.max(0L, current - prior);
            if (delta > 0) {
                sums.merge(patientId, delta, Long::sum);
            }
        }
        return sums;
    }

    private static final class Accumulator {
        private final String nickname;
        private long totalSeconds;

        private Accumulator(String nickname) {
            this.nickname = nickname;
        }

        private void add(long seconds) {
            this.totalSeconds += seconds;
        }
    }
}
