package com.comong.backend.domain.usage.service;

import java.time.LocalDate;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.comong.backend.domain.usage.dto.UsageAverageResponse;
import com.comong.backend.domain.usage.entity.ContentType;
import com.comong.backend.domain.usage.entity.DailyUsageStat;
import com.comong.backend.domain.usage.repository.DailyUsageStatRepository;
import com.comong.backend.domain.usage.repository.UsageAggregationQuery;
import com.comong.backend.global.exception.BusinessException;
import com.comong.backend.global.exception.GlobalErrorCode;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class UsageAverageService {

    private final DailyUsageStatRepository dailyUsageStatRepository;
    private final UsageAggregationQuery usageAggregationQuery;

    public UsageAverageResponse periodAverages(LocalDate from, LocalDate to) {
        DateRange range = resolveDateRange(from, to);
        UsageTotals totals = new UsageTotals();
        Set<Long> activePatientIds = new HashSet<>();

        List<DailyUsageStat> cachedRows =
                range.from() != null
                        ? dailyUsageStatRepository.findAllWithPatientByStatDateBetween(
                                range.from(), range.to())
                        : dailyUsageStatRepository.findAllWithPatientByStatDateLessThanEqual(
                                range.to());
        LocalDate responseFrom = range.from();
        for (DailyUsageStat row : cachedRows) {
            if (row.getStatDate().equals(range.today())) {
                continue;
            }
            if (responseFrom == null || row.getStatDate().isBefore(responseFrom)) {
                responseFrom = row.getStatDate();
            }
            addUsage(
                    totals,
                    activePatientIds,
                    row.getPatientProfile().getId(),
                    row.getContentType(),
                    row.getTotalSeconds());
        }

        if (range.includes(range.today())) {
            Map<Long, UsageTotals> todayLive = computeLiveForDate(range.today());
            for (Map.Entry<Long, UsageTotals> entry : todayLive.entrySet()) {
                for (ContentType type : ContentType.values()) {
                    long seconds = entry.getValue().get(type);
                    if (seconds > 0 && responseFrom == null) {
                        responseFrom = range.today();
                    }
                    addUsage(totals, activePatientIds, entry.getKey(), type, seconds);
                }
            }
        }
        if (responseFrom == null) {
            responseFrom = range.to();
        }

        long activePatients = activePatientIds.size();
        return new UsageAverageResponse(
                responseFrom,
                range.to(),
                activePatients,
                toUsageAverage(totals.login, activePatients),
                List.of(
                        toContentAverage(ContentType.ART, totals.art, activePatients),
                        toContentAverage(ContentType.MUSIC, totals.music, activePatients),
                        toContentAverage(ContentType.TAEKWONDO, totals.taekwondo, activePatients),
                        toContentAverage(
                                ContentType.GYMNASTICS, totals.gymnastics, activePatients)));
    }

    private DateRange resolveDateRange(LocalDate from, LocalDate to) {
        LocalDate today = LocalDate.now();
        LocalDate effectiveTo = to != null ? to : today;
        if (from != null && from.isAfter(effectiveTo)) {
            throw new BusinessException(GlobalErrorCode.INVALID_INPUT);
        }
        return new DateRange(from, effectiveTo, today);
    }

    private void addUsage(
            UsageTotals totals,
            Set<Long> activePatientIds,
            long patientId,
            ContentType type,
            long seconds) {
        if (seconds <= 0) {
            return;
        }
        totals.add(type, seconds);
        activePatientIds.add(patientId);
    }

    private Map<Long, UsageTotals> computeLiveForDate(LocalDate date) {
        Map<Long, UsageTotals> byPatient = new HashMap<>();
        for (UsageAggregationQuery.PatientAggregate row :
                usageAggregationQuery.aggregateLoginPerPatient(date)) {
            byPatient.computeIfAbsent(row.patientProfileId(), id -> new UsageTotals()).login =
                    row.totalSeconds();
        }
        for (UsageAggregationQuery.PatientAggregate row :
                usageAggregationQuery.aggregateMusicPerPatient(date)) {
            byPatient.computeIfAbsent(row.patientProfileId(), id -> new UsageTotals()).music =
                    row.totalSeconds();
        }
        for (UsageAggregationQuery.PatientAggregate row :
                usageAggregationQuery.aggregateTaekwondoPerPatient(date)) {
            byPatient.computeIfAbsent(row.patientProfileId(), id -> new UsageTotals()).taekwondo =
                    row.totalSeconds();
        }
        for (UsageAggregationQuery.PatientAggregate row :
                usageAggregationQuery.aggregateGymnasticsPerPatient(date)) {
            byPatient.computeIfAbsent(row.patientProfileId(), id -> new UsageTotals()).gymnastics =
                    row.totalSeconds();
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
            byPatient.computeIfAbsent(patientId, id -> new UsageTotals()).art =
                    Math.max(0L, current - prior);
        }
        return byPatient;
    }

    private UsageAverageResponse.UsageAverage toUsageAverage(
            long totalSeconds, long activePatients) {
        return new UsageAverageResponse.UsageAverage(
                totalSeconds, activePatients > 0 ? totalSeconds / activePatients : 0);
    }

    private UsageAverageResponse.ContentUsageAverage toContentAverage(
            ContentType type, long totalSeconds, long activePatients) {
        return new UsageAverageResponse.ContentUsageAverage(
                type.name(),
                contentLabel(type),
                totalSeconds,
                activePatients > 0 ? totalSeconds / activePatients : 0);
    }

    private static String contentLabel(ContentType type) {
        return switch (type) {
            case LOGIN -> "접속";
            case ART -> "미술";
            case MUSIC -> "음악";
            case TAEKWONDO -> "태권도";
            case GYMNASTICS -> "체조";
        };
    }

    private record DateRange(LocalDate from, LocalDate to, LocalDate today) {
        private boolean includes(LocalDate date) {
            return (from == null || !date.isBefore(from)) && !date.isAfter(to);
        }
    }

    private static final class UsageTotals {
        private long login;
        private long art;
        private long music;
        private long taekwondo;
        private long gymnastics;

        private void add(ContentType type, long seconds) {
            switch (type) {
                case LOGIN -> login += seconds;
                case ART -> art += seconds;
                case MUSIC -> music += seconds;
                case TAEKWONDO -> taekwondo += seconds;
                case GYMNASTICS -> gymnastics += seconds;
            }
        }

        private long get(ContentType type) {
            return switch (type) {
                case LOGIN -> login;
                case ART -> art;
                case MUSIC -> music;
                case TAEKWONDO -> taekwondo;
                case GYMNASTICS -> gymnastics;
            };
        }
    }
}
