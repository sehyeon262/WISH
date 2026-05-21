package com.comong.backend.domain.admin.service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.comong.backend.domain.admin.dto.AdminDashboardResponse;
import com.comong.backend.domain.admin.dto.AdminPatientDashboardResponse;
import com.comong.backend.domain.patient.entity.PatientProfile;
import com.comong.backend.domain.patient.exception.PatientErrorCode;
import com.comong.backend.domain.patient.repository.PatientProfileRepository;
import com.comong.backend.domain.usage.entity.ContentType;
import com.comong.backend.domain.usage.entity.DailyUsageStat;
import com.comong.backend.domain.usage.repository.DailyUsageStatRepository;
import com.comong.backend.domain.usage.repository.LoginSessionRepository;
import com.comong.backend.domain.usage.repository.UsageAggregationQuery;
import com.comong.backend.domain.user.entity.UserRole;
import com.comong.backend.domain.user.repository.UserRepository;
import com.comong.backend.global.exception.BusinessException;
import com.comong.backend.global.exception.GlobalErrorCode;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class AdminDashboardService {

    private static final int DEFAULT_RANGE_DAYS = 7;
    private static final int RISK_INACTIVE_DAYS = 7;
    private static final long ACTIVE_PERIOD_SECONDS_THRESHOLD = 60L * 60L;
    private static final long CONTENT_SKEW_MIN_SECONDS = 600L;
    private static final long CONTENT_SKEW_PERCENT_THRESHOLD = 80L;

    private final UserRepository userRepository;
    private final PatientProfileRepository patientProfileRepository;
    private final DailyUsageStatRepository dailyUsageStatRepository;
    private final UsageAggregationQuery usageAggregationQuery;
    private final LoginSessionRepository loginSessionRepository;

    public AdminDashboardResponse getDashboard(LocalDate from, LocalDate to) {
        DateRange range = resolveDateRange(from, to);
        LocalDate today = range.today();
        LocalDate effectiveTo = range.to();
        LocalDate effectiveFrom = range.from();

        Map<LocalDate, UsageTotals> dailyTotals = createDailyMap(effectiveFrom, effectiveTo);
        Map<LocalDate, Set<Long>> activePatientsByDate =
                createActiveMap(effectiveFrom, effectiveTo);
        Map<Long, PatientUsage> usageByPatient = new HashMap<>();
        UsageTotals periodTotals = new UsageTotals();

        // TODO: pilot 규모를 넘기면 기간/환자 전체 조회를 집계 쿼리나 페이징으로 전환한다.
        List<DailyUsageStat> cachedRows =
                dailyUsageStatRepository.findAllWithPatientByStatDateBetween(
                        effectiveFrom, effectiveTo);
        for (DailyUsageStat row : cachedRows) {
            if (row.getStatDate().equals(today)) {
                continue;
            }
            addPeriodUsage(
                    dailyTotals,
                    activePatientsByDate,
                    usageByPatient,
                    periodTotals,
                    row.getStatDate(),
                    row.getPatientProfile().getId(),
                    row.getContentType(),
                    row.getTotalSeconds());
        }

        Map<Long, UsageTotals> todayLive = computeLiveForDate(today);
        for (Map.Entry<Long, UsageTotals> entry : todayLive.entrySet()) {
            PatientUsage patientUsage =
                    usageByPatient.computeIfAbsent(entry.getKey(), id -> new PatientUsage());
            patientUsage.todaySeconds = entry.getValue().appUsageSeconds();
        }

        if (!today.isBefore(effectiveFrom) && !today.isAfter(effectiveTo)) {
            for (Map.Entry<Long, UsageTotals> entry : todayLive.entrySet()) {
                UsageTotals totals = entry.getValue();
                for (ContentType type : ContentType.values()) {
                    addPeriodUsage(
                            dailyTotals,
                            activePatientsByDate,
                            usageByPatient,
                            periodTotals,
                            today,
                            entry.getKey(),
                            type,
                            totals.get(type));
                }
            }
        }

        List<PatientProfile> patients = patientProfileRepository.findAllWithUser();
        List<AdminDashboardResponse.PatientActivity> patientActivities =
                patients.stream()
                        .map(
                                patient -> {
                                    PatientUsage usage =
                                            usageByPatient.getOrDefault(
                                                    patient.getId(), new PatientUsage());
                                    return toPatientActivity(patient, usage, effectiveTo);
                                })
                        .toList();

        long atRiskPatients =
                patientActivities.stream()
                        .filter(activity -> "RISK".equals(activity.status()))
                        .count();
        long contentSkewedPatients =
                usageByPatient.values().stream().filter(PatientUsage::isContentSkewed).count();
        long todayTotalSeconds =
                todayLive.values().stream().mapToLong(UsageTotals::appUsageSeconds).sum();
        long todayActivePatients =
                todayLive.values().stream().filter(totals -> totals.total() > 0).count();
        long guardianUsers = userRepository.countByRole(UserRole.USER);
        long adminUsers = userRepository.countByRole(UserRole.ADMIN);
        LocalDateTime todayStart = today.atStartOfDay();
        LocalDateTime tomorrowStart = today.plusDays(1).atStartOfDay();
        long dayCount = effectiveTo.toEpochDay() - effectiveFrom.toEpochDay() + 1L;
        long periodActivePatients =
                activePatientsByDate.values().stream().flatMap(Set::stream).distinct().count();

        AdminDashboardResponse.Summary summary =
                new AdminDashboardResponse.Summary(
                        userRepository.count(),
                        guardianUsers,
                        adminUsers,
                        patientProfileRepository.count(),
                        todayActivePatients,
                        todayTotalSeconds,
                        periodTotals.appUsageSeconds(),
                        dayCount > 0 ? periodTotals.appUsageSeconds() / dayCount : 0,
                        periodActivePatients,
                        atRiskPatients,
                        userRepository.countByCreatedAtBetween(todayStart, tomorrowStart),
                        patientProfileRepository.countByCreatedAtBetween(
                                todayStart, tomorrowStart));

        AdminDashboardResponse.PreviousPeriodSummary previous =
                computePreviousPeriodSummary(effectiveFrom, dayCount, today);

        return new AdminDashboardResponse(
                effectiveFrom,
                effectiveTo,
                summary,
                previous,
                toDailyResponses(dailyTotals, activePatientsByDate),
                toContentShares(periodTotals),
                patientActivities,
                toAlerts(summary, guardianUsers, contentSkewedPatients));
    }

    /**
     * 직전 동기간(현재 기간과 같은 일수만큼 더 과거) 의 누적 앱 사용시간 / 일 평균 / 기간 활성 환자 수를 집계한다. 직전 기간 안에 today 가 들어올 수 있는
     * 케이스(예: 매우 짧은 기간을 미래 날짜로 조회)는 today 분을 라이브 집계에서 가져온다 — 다만 일반적인 "오늘까지 N 일" 조회에서는 직전 기간이 모두
     * 과거이므로 cachedRows 만으로 충분하다.
     */
    private AdminDashboardResponse.PreviousPeriodSummary computePreviousPeriodSummary(
            LocalDate currentFrom, long dayCount, LocalDate today) {
        if (dayCount <= 0) {
            return new AdminDashboardResponse.PreviousPeriodSummary(
                    currentFrom, currentFrom, 0, 0, 0);
        }
        LocalDate previousTo = currentFrom.minusDays(1);
        LocalDate previousFrom = previousTo.minusDays(dayCount - 1L);
        Map<LocalDate, UsageTotals> dailyTotals = createDailyMap(previousFrom, previousTo);
        Map<LocalDate, Set<Long>> activeByDate = createActiveMap(previousFrom, previousTo);
        UsageTotals periodTotals = new UsageTotals();
        Map<Long, PatientUsage> dummy = new HashMap<>();

        List<DailyUsageStat> rows =
                dailyUsageStatRepository.findAllWithPatientByStatDateBetween(
                        previousFrom, previousTo);
        for (DailyUsageStat row : rows) {
            if (row.getStatDate().equals(today)) {
                continue;
            }
            addPeriodUsage(
                    dailyTotals,
                    activeByDate,
                    dummy,
                    periodTotals,
                    row.getStatDate(),
                    row.getPatientProfile().getId(),
                    row.getContentType(),
                    row.getTotalSeconds());
        }
        long activeUnique = activeByDate.values().stream().flatMap(Set::stream).distinct().count();
        long average = periodTotals.appUsageSeconds() / dayCount;
        return new AdminDashboardResponse.PreviousPeriodSummary(
                previousFrom, previousTo, periodTotals.appUsageSeconds(), average, activeUnique);
    }

    public AdminPatientDashboardResponse getPatientDashboard(
            Long patientId, LocalDate from, LocalDate to) {
        DateRange range = resolveDateRange(from, to);
        PatientProfile patient =
                patientProfileRepository
                        .findByIdWithUser(patientId)
                        .orElseThrow(
                                () ->
                                        new BusinessException(
                                                PatientErrorCode.PATIENT_PROFILE_NOT_FOUND));

        Map<LocalDate, UsageTotals> dailyTotals = createDailyMap(range.from(), range.to());
        UsageTotals periodTotals = new UsageTotals();

        List<DailyUsageStat> cachedRows =
                dailyUsageStatRepository.findAllByPatientProfileIdAndStatDateBetween(
                        patientId, range.from(), range.to());
        for (DailyUsageStat row : cachedRows) {
            if (row.getStatDate().equals(range.today())) {
                continue;
            }
            addUsage(
                    dailyTotals,
                    periodTotals,
                    row.getStatDate(),
                    row.getContentType(),
                    row.getTotalSeconds());
        }

        Map<Long, UsageTotals> todayLive = computeLiveForDate(range.today());
        UsageTotals todayTotals = todayLive.getOrDefault(patientId, new UsageTotals());
        if (range.includes(range.today())) {
            for (ContentType type : ContentType.values()) {
                addUsage(dailyTotals, periodTotals, range.today(), type, todayTotals.get(type));
            }
        }

        LocalDate lastActiveDate = findLastActiveDate(dailyTotals);
        long dayCount = range.to().toEpochDay() - range.from().toEpochDay() + 1L;
        long activeDays = dailyTotals.values().stream().filter(UsageTotals::hasAnyUsage).count();
        long todaySeconds = todayTotals.appUsageSeconds();

        AdminPatientDashboardResponse.Summary summary =
                new AdminPatientDashboardResponse.Summary(
                        todaySeconds,
                        periodTotals.appUsageSeconds(),
                        periodTotals.contentTotal(),
                        dayCount > 0 ? periodTotals.appUsageSeconds() / dayCount : 0,
                        activeDays,
                        lastActiveDate,
                        usageStatus(
                                periodTotals,
                                range.includes(range.today()) ? todaySeconds : 0,
                                lastActiveDate,
                                range.to()),
                        favoriteContentLabel(periodTotals),
                        isContentSkewed(periodTotals),
                        RISK_INACTIVE_DAYS);

        AdminPatientDashboardResponse.HourlyHeatmap heatmap =
                buildHourlyHeatmap(patientId, range.from(), range.to());

        return new AdminPatientDashboardResponse(
                range.from(),
                range.to(),
                new AdminPatientDashboardResponse.Patient(
                        patient.getId(),
                        patient.getName(),
                        patient.getNickname(),
                        patient.getGender(),
                        patient.getBirthDate(),
                        patient.getCreatedAt(),
                        patient.getUser().getEmail()),
                summary,
                toPatientDailyResponses(dailyTotals),
                toContentShares(periodTotals),
                heatmap);
    }

    /**
     * 환자별 요일×시간대 사용시간 히트맵을 만든다. 7×24 격자 전체를 0 으로 채운 뒤 native 쿼리 결과로 채워, FE 가 sparse 데이터를 추가 가공하지 않고
     * 그대로 그릴 수 있게 한다.
     */
    private AdminPatientDashboardResponse.HourlyHeatmap buildHourlyHeatmap(
            Long patientId, LocalDate from, LocalDate to) {
        LocalDateTime fromDateTime = from.atStartOfDay();
        LocalDateTime toExclusive = to.plusDays(1).atStartOfDay();

        long[][] grid = new long[7][24];
        long max = 0L;
        for (LoginSessionRepository.HourlyHeatmapRow row :
                loginSessionRepository.findHourlyHeatmapByPatient(
                        patientId, fromDateTime, toExclusive)) {
            int weekday = row.getWeekday() == null ? 0 : row.getWeekday();
            int hour = row.getHour() == null ? 0 : row.getHour();
            long seconds = row.getTotalSeconds() == null ? 0L : row.getTotalSeconds();
            if (weekday < 1 || weekday > 7 || hour < 0 || hour > 23) {
                continue;
            }
            grid[weekday - 1][hour] = seconds;
            if (seconds > max) {
                max = seconds;
            }
        }

        List<AdminPatientDashboardResponse.HeatmapCell> cells = new ArrayList<>(168);
        for (int w = 1; w <= 7; w++) {
            for (int h = 0; h < 24; h++) {
                cells.add(new AdminPatientDashboardResponse.HeatmapCell(w, h, grid[w - 1][h]));
            }
        }
        return new AdminPatientDashboardResponse.HourlyHeatmap(max, cells);
    }

    private DateRange resolveDateRange(LocalDate from, LocalDate to) {
        LocalDate today = LocalDate.now();
        LocalDate effectiveTo = to != null ? to : today;
        LocalDate effectiveFrom =
                from != null ? from : effectiveTo.minusDays(DEFAULT_RANGE_DAYS - 1L);
        if (effectiveFrom.isAfter(effectiveTo)) {
            throw new BusinessException(GlobalErrorCode.INVALID_INPUT);
        }
        return new DateRange(effectiveFrom, effectiveTo, today);
    }

    private Map<LocalDate, UsageTotals> createDailyMap(LocalDate from, LocalDate to) {
        Map<LocalDate, UsageTotals> dailyTotals = new LinkedHashMap<>();
        for (LocalDate date = from; !date.isAfter(to); date = date.plusDays(1)) {
            dailyTotals.put(date, new UsageTotals());
        }
        return dailyTotals;
    }

    private Map<LocalDate, Set<Long>> createActiveMap(LocalDate from, LocalDate to) {
        Map<LocalDate, Set<Long>> activePatientsByDate = new LinkedHashMap<>();
        for (LocalDate date = from; !date.isAfter(to); date = date.plusDays(1)) {
            activePatientsByDate.put(date, new HashSet<>());
        }
        return activePatientsByDate;
    }

    private void addPeriodUsage(
            Map<LocalDate, UsageTotals> dailyTotals,
            Map<LocalDate, Set<Long>> activePatientsByDate,
            Map<Long, PatientUsage> usageByPatient,
            UsageTotals periodTotals,
            LocalDate date,
            long patientId,
            ContentType type,
            long seconds) {
        if (seconds <= 0) {
            return;
        }

        dailyTotals.get(date).add(type, seconds);
        activePatientsByDate.get(date).add(patientId);
        periodTotals.add(type, seconds);

        PatientUsage patientUsage =
                usageByPatient.computeIfAbsent(patientId, id -> new PatientUsage());
        patientUsage.add(type, seconds);
        patientUsage.markActive(date);
    }

    private void addUsage(
            Map<LocalDate, UsageTotals> dailyTotals,
            UsageTotals periodTotals,
            LocalDate date,
            ContentType type,
            long seconds) {
        if (seconds <= 0) {
            return;
        }

        dailyTotals.get(date).add(type, seconds);
        periodTotals.add(type, seconds);
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

    private AdminDashboardResponse.PatientActivity toPatientActivity(
            PatientProfile patient, PatientUsage usage, LocalDate periodTo) {
        return new AdminDashboardResponse.PatientActivity(
                patient.getId(),
                patient.getName(),
                patient.getNickname(),
                patient.getUser().getEmail(),
                usage.todaySeconds,
                usage.total.appUsageSeconds(),
                usage.favoriteContentLabel(),
                usage.lastActiveDate,
                usage.status(periodTo));
    }

    private List<AdminPatientDashboardResponse.DailyUsage> toPatientDailyResponses(
            Map<LocalDate, UsageTotals> dailyTotals) {
        List<AdminPatientDashboardResponse.DailyUsage> responses = new ArrayList<>();
        for (Map.Entry<LocalDate, UsageTotals> entry : dailyTotals.entrySet()) {
            UsageTotals totals = entry.getValue();
            responses.add(
                    new AdminPatientDashboardResponse.DailyUsage(
                            entry.getKey(),
                            totals.login,
                            totals.art,
                            totals.music,
                            totals.taekwondo,
                            totals.gymnastics,
                            totals.appUsageSeconds(),
                            totals.hasAnyUsage()));
        }
        return responses;
    }

    private List<AdminDashboardResponse.DailyUsage> toDailyResponses(
            Map<LocalDate, UsageTotals> dailyTotals,
            Map<LocalDate, Set<Long>> activePatientsByDate) {
        List<AdminDashboardResponse.DailyUsage> responses = new ArrayList<>();
        for (Map.Entry<LocalDate, UsageTotals> entry : dailyTotals.entrySet()) {
            UsageTotals totals = entry.getValue();
            responses.add(
                    new AdminDashboardResponse.DailyUsage(
                            entry.getKey(),
                            totals.login,
                            totals.art,
                            totals.music,
                            totals.taekwondo,
                            totals.gymnastics,
                            totals.appUsageSeconds(),
                            activePatientsByDate.get(entry.getKey()).size()));
        }
        return responses;
    }

    private List<AdminDashboardResponse.ContentShare> toContentShares(UsageTotals totals) {
        long contentTotal = totals.contentTotal();
        return List.of(
                toContentShare(ContentType.ART, totals.art, contentTotal),
                toContentShare(ContentType.MUSIC, totals.music, contentTotal),
                toContentShare(ContentType.TAEKWONDO, totals.taekwondo, contentTotal),
                toContentShare(ContentType.GYMNASTICS, totals.gymnastics, contentTotal));
    }

    private AdminDashboardResponse.ContentShare toContentShare(
            ContentType type, long seconds, long contentTotal) {
        double percentage = contentTotal > 0 ? (seconds * 100.0) / contentTotal : 0.0;
        return new AdminDashboardResponse.ContentShare(
                type.name(), contentLabel(type), seconds, Math.round(percentage * 10.0) / 10.0);
    }

    private List<AdminDashboardResponse.DashboardAlert> toAlerts(
            AdminDashboardResponse.Summary summary,
            long guardianUsers,
            long contentSkewedPatients) {
        long missingProfiles = Math.max(0L, guardianUsers - summary.totalPatients());
        return List.of(
                new AdminDashboardResponse.DashboardAlert(
                        "RISK_PATIENT",
                        "이탈 위험 환자",
                        "최근 7일 동안 활동이 없는 환자입니다.",
                        summary.atRiskPatients() > 0 ? "warning" : "normal",
                        summary.atRiskPatients()),
                new AdminDashboardResponse.DashboardAlert(
                        "MISSING_PROFILE",
                        "프로필 미등록 보호자",
                        "보호자 계정은 있으나 환자 프로필이 아직 없습니다.",
                        missingProfiles > 0 ? "warning" : "normal",
                        missingProfiles),
                new AdminDashboardResponse.DashboardAlert(
                        "CONTENT_SKEW",
                        "콘텐츠 편중 사용",
                        "한 콘텐츠가 전체 콘텐츠 사용시간의 80% 이상인 환자입니다.",
                        contentSkewedPatients > 0 ? "info" : "normal",
                        contentSkewedPatients));
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

    private static String favoriteContentLabel(UsageTotals totals) {
        ContentType favorite = totals.favoriteContent();
        return favorite != null ? contentLabel(favorite) : "없음";
    }

    private static String usageStatus(
            UsageTotals totals, long todaySeconds, LocalDate lastActiveDate, LocalDate periodTo) {
        if (lastActiveDate == null || !totals.hasAnyUsage()) {
            return "RISK";
        }
        if (lastActiveDate.isBefore(periodTo.minusDays(RISK_INACTIVE_DAYS - 1L))) {
            return "RISK";
        }
        if (todaySeconds > 0 || totals.appUsageSeconds() >= ACTIVE_PERIOD_SECONDS_THRESHOLD) {
            return "ACTIVE";
        }
        return "NORMAL";
    }

    private static boolean isContentSkewed(UsageTotals totals) {
        long contentTotal = totals.contentTotal();
        if (contentTotal < CONTENT_SKEW_MIN_SECONDS) {
            return false;
        }
        long max =
                Math.max(
                        Math.max(totals.art, totals.music),
                        Math.max(totals.taekwondo, totals.gymnastics));
        return max * 100 >= contentTotal * CONTENT_SKEW_PERCENT_THRESHOLD;
    }

    private static LocalDate findLastActiveDate(Map<LocalDate, UsageTotals> dailyTotals) {
        LocalDate lastActiveDate = null;
        for (Map.Entry<LocalDate, UsageTotals> entry : dailyTotals.entrySet()) {
            if (entry.getValue().hasAnyUsage()) {
                lastActiveDate = entry.getKey();
            }
        }
        return lastActiveDate;
    }

    private record DateRange(LocalDate from, LocalDate to, LocalDate today) {
        private boolean includes(LocalDate date) {
            return !date.isBefore(from) && !date.isAfter(to);
        }
    }

    private static final class PatientUsage {
        private final UsageTotals total = new UsageTotals();
        private long todaySeconds;
        private LocalDate lastActiveDate;

        private PatientUsage() {}

        private void add(ContentType type, long seconds) {
            total.add(type, seconds);
        }

        private void markActive(LocalDate date) {
            if (lastActiveDate == null || lastActiveDate.isBefore(date)) {
                lastActiveDate = date;
            }
        }

        private String favoriteContentLabel() {
            return AdminDashboardService.favoriteContentLabel(total);
        }

        private String status(LocalDate periodTo) {
            return usageStatus(total, todaySeconds, lastActiveDate, periodTo);
        }

        private boolean isContentSkewed() {
            return AdminDashboardService.isContentSkewed(total);
        }
    }

    private static final class UsageTotals {
        private long login;
        private long art;
        private long music;
        private long taekwondo;
        private long gymnastics;

        private UsageTotals() {}

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

        private long total() {
            return login + art + music + taekwondo + gymnastics;
        }

        private long appUsageSeconds() {
            return login;
        }

        private long contentTotal() {
            return art + music + taekwondo + gymnastics;
        }

        private boolean hasAnyUsage() {
            return total() > 0;
        }

        private ContentType favoriteContent() {
            Map<ContentType, Long> contents = new EnumMap<>(ContentType.class);
            contents.put(ContentType.ART, art);
            contents.put(ContentType.MUSIC, music);
            contents.put(ContentType.TAEKWONDO, taekwondo);
            contents.put(ContentType.GYMNASTICS, gymnastics);
            return contents.entrySet().stream()
                    .filter(entry -> entry.getValue() > 0)
                    .max(Map.Entry.comparingByValue())
                    .map(Map.Entry::getKey)
                    .orElse(null);
        }
    }
}
