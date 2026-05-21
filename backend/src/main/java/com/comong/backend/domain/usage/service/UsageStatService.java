package com.comong.backend.domain.usage.service;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.comong.backend.domain.patient.entity.PatientProfile;
import com.comong.backend.domain.patient.exception.PatientErrorCode;
import com.comong.backend.domain.patient.repository.PatientProfileRepository;
import com.comong.backend.domain.patient.service.PatientProfileService;
import com.comong.backend.domain.usage.dto.UsageStatCumulativeResponse;
import com.comong.backend.domain.usage.dto.UsageStatDailyResponse;
import com.comong.backend.domain.usage.entity.ContentType;
import com.comong.backend.domain.usage.entity.DailyUsageStat;
import com.comong.backend.domain.usage.repository.ContentTypeTotal;
import com.comong.backend.domain.usage.repository.DailyUsageStatRepository;
import com.comong.backend.domain.usage.repository.UsageAggregationQuery;
import com.comong.backend.domain.user.entity.UserRole;
import com.comong.backend.global.exception.BusinessException;

import lombok.RequiredArgsConstructor;

/**
 * 환자 활동 시간 통계 조회 (보호자/ADMIN). 매일 KST 01:00 배치({@link DailyUsageStatBatchService}) 가 적재한 {@code
 * daily_usage_stat} 을 캐시처럼 읽고, 오늘 분은 source 테이블 즉석 SUM 으로 fallback.
 *
 * <p>fallback 정책:
 *
 * <ul>
 *   <li>과거 날짜의 daily 행이 없으면 0 으로 응답 (배치 누락 시 데이터 손실 — 운영 차원에서 수동 backfill)
 *   <li>오늘 분은 daily 행이 존재할 수 없으므로 항상 source 즉석 계산
 * </ul>
 *
 * <p>이 단순화는 "정확한 today + 캐시된 과거" 를 유지하면서 fallback 비용을 작게 묶는다. 배치가 안정적으로 돌면 데이터 손실 없음.
 *
 * <p>권한:
 *
 * <ul>
 *   <li>USER (보호자): 본인 소유 환자만 조회 가능. 비소유/비존재는 enumeration 방지로 모두 P-001 (404)
 *   <li>ADMIN: 임의 환자 조회 가능
 * </ul>
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class UsageStatService {

    private final DailyUsageStatRepository dailyUsageStatRepository;
    private final UsageAggregationQuery usageAggregationQuery;
    private final PatientProfileService patientProfileService;
    private final PatientProfileRepository patientProfileRepository;

    public UsageStatDailyResponse daily(
            Long userId, UserRole role, Long patientId, LocalDate from, LocalDate to) {
        verifyAccess(userId, role, patientId);

        LocalDate today = LocalDate.now();
        LocalDate effectiveTo = to != null ? to : today;
        LocalDate effectiveFrom = from != null ? from : effectiveTo.minusDays(7);
        if (effectiveFrom.isAfter(effectiveTo)) {
            throw new BusinessException(
                    com.comong.backend.global.exception.GlobalErrorCode.INVALID_INPUT);
        }

        // 1. 캐시된 daily 행 읽기 — (date, type) → seconds 맵
        List<DailyUsageStat> rows =
                dailyUsageStatRepository.findAllByPatientProfileIdAndStatDateBetween(
                        patientId, effectiveFrom, effectiveTo);
        Map<LocalDate, EnumMap<ContentType, Long>> byDate = indexByDateAndType(rows);

        // 2. 오늘이 범위에 포함되면 source 에서 즉석 계산
        EnumMap<ContentType, Long> todayLive = null;
        if (!today.isBefore(effectiveFrom) && !today.isAfter(effectiveTo)) {
            todayLive = computeLiveForToday(patientId, today);
        }

        // 3. 응답 빌드 — 범위의 모든 날짜를 순회 (sparse 행은 0 으로 채움)
        List<UsageStatDailyResponse.Item> items = new ArrayList<>();
        for (LocalDate d = effectiveFrom; !d.isAfter(effectiveTo); d = d.plusDays(1)) {
            EnumMap<ContentType, Long> values =
                    (d.equals(today) && todayLive != null) ? todayLive : byDate.get(d);
            items.add(toItem(d, values));
        }

        return new UsageStatDailyResponse(patientId, effectiveFrom, effectiveTo, items);
    }

    public UsageStatCumulativeResponse cumulative(Long userId, UserRole role, Long patientId) {
        verifyAccess(userId, role, patientId);

        LocalDate today = LocalDate.now();

        // 캐시된 daily 누적 합 — content_type 별
        List<ContentTypeTotal> totals =
                dailyUsageStatRepository.sumTotalSecondsByContentTypeForPatient(patientId);
        EnumMap<ContentType, Long> cumulative = new EnumMap<>(ContentType.class);
        for (ContentType t : ContentType.values()) {
            cumulative.put(t, 0L);
        }
        for (ContentTypeTotal total : totals) {
            cumulative.put(total.contentType(), total.totalSeconds());
        }

        // 오늘 분 — source 즉석 계산해서 더하기
        EnumMap<ContentType, Long> todayLive = computeLiveForToday(patientId, today);
        for (ContentType t : ContentType.values()) {
            if (t == ContentType.ART) {
                // ART 누적은 artworks 테이블 자체의 SUM 이 정답 (daily 합 + today 가 그 자체)
                cumulative.put(
                        ContentType.ART,
                        usageAggregationQuery.aggregateArtCumulativeForPatient(patientId));
            } else {
                cumulative.merge(t, todayLive.getOrDefault(t, 0L), Long::sum);
            }
        }

        return new UsageStatCumulativeResponse(
                patientId,
                cumulative.get(ContentType.LOGIN),
                cumulative.get(ContentType.ART),
                cumulative.get(ContentType.MUSIC),
                cumulative.get(ContentType.TAEKWONDO),
                cumulative.get(ContentType.GYMNASTICS));
    }

    private void verifyAccess(Long userId, UserRole role, Long patientId) {
        if (role == UserRole.ADMIN) {
            // ADMIN 은 임의 환자 — 존재만 확인
            patientProfileRepository
                    .findById(patientId)
                    .orElseThrow(
                            () ->
                                    new BusinessException(
                                            PatientErrorCode.PATIENT_PROFILE_NOT_FOUND));
            return;
        }
        // USER (보호자) — 본인 소유 환자인지 확인
        PatientProfile owned = patientProfileService.findOwnedOrThrow(userId, patientId);
        // unused 변수 경고 회피 — soundness 만 체크
        if (owned == null) {
            throw new BusinessException(PatientErrorCode.PATIENT_PROFILE_NOT_FOUND);
        }
    }

    private Map<LocalDate, EnumMap<ContentType, Long>> indexByDateAndType(
            List<DailyUsageStat> rows) {
        Map<LocalDate, EnumMap<ContentType, Long>> byDate = new java.util.HashMap<>();
        for (DailyUsageStat r : rows) {
            byDate.computeIfAbsent(r.getStatDate(), d -> new EnumMap<>(ContentType.class))
                    .put(r.getContentType(), r.getTotalSeconds());
        }
        return byDate;
    }

    /** 오늘 분 환자별 source 즉석 SUM. ART 는 (현재 누적합) - (지금까지의 daily 합) 으로 today 증가분 도출. */
    private EnumMap<ContentType, Long> computeLiveForToday(Long patientId, LocalDate today) {
        EnumMap<ContentType, Long> values = new EnumMap<>(ContentType.class);
        values.put(
                ContentType.LOGIN,
                usageAggregationQuery.aggregateLoginForPatient(patientId, today));
        values.put(
                ContentType.MUSIC,
                usageAggregationQuery.aggregateMusicForPatient(patientId, today));
        values.put(
                ContentType.TAEKWONDO,
                usageAggregationQuery.aggregateTaekwondoForPatient(patientId, today));
        values.put(
                ContentType.GYMNASTICS,
                usageAggregationQuery.aggregateGymnasticsForPatient(patientId, today));

        long currentArt = usageAggregationQuery.aggregateArtCumulativeForPatient(patientId);
        long priorArtDailySum =
                dailyUsageStatRepository.sumTotalSecondsByContentTypeBeforeForPatient(
                        patientId, ContentType.ART, today);
        values.put(ContentType.ART, Math.max(0L, currentArt - priorArtDailySum));
        return values;
    }

    private UsageStatDailyResponse.Item toItem(LocalDate date, EnumMap<ContentType, Long> values) {
        long login = values != null ? values.getOrDefault(ContentType.LOGIN, 0L) : 0L;
        long art = values != null ? values.getOrDefault(ContentType.ART, 0L) : 0L;
        long music = values != null ? values.getOrDefault(ContentType.MUSIC, 0L) : 0L;
        long taekwondo = values != null ? values.getOrDefault(ContentType.TAEKWONDO, 0L) : 0L;
        long gymnastics = values != null ? values.getOrDefault(ContentType.GYMNASTICS, 0L) : 0L;
        return new UsageStatDailyResponse.Item(date, login, art, music, taekwondo, gymnastics);
    }
}
