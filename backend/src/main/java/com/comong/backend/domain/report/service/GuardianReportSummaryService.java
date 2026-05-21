package com.comong.backend.domain.report.service;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.comong.backend.domain.dialogue.dto.WeeklyDialogueTrendResponse;
import com.comong.backend.domain.dialogue.service.GuardianDialogueSummaryService;
import com.comong.backend.domain.patient.service.PatientProfileService;
import com.comong.backend.domain.report.dto.WeeklyReportAiSummaryResponse;
import com.comong.backend.domain.usage.dto.UsageStatDailyResponse;
import com.comong.backend.domain.usage.service.UsageStatService;
import com.comong.backend.domain.user.entity.UserRole;
import com.comong.backend.global.exception.BusinessException;
import com.comong.backend.global.exception.GlobalErrorCode;

import lombok.RequiredArgsConstructor;

/**
 * 보호자 주간 리포트 AI 요약 조립 (S14P31E103-745).
 *
 * <p>월~일 한 주의 활동(UsageStat) + 대화 톤 트렌드(GuardianDialogueSummary.weekly) 를 모아 AI 서버에 던지고 종합 코멘트 + 관찰
 * + 제안을 받아 보호자에게 그대로 전달한다.
 *
 * <p>v1 범위: 활동 합계/일자별 시간 + 대화 톤 트렌드 + 지난 주 활동 델타. 게임별 상세 점수, 대화 주제·우려 시그널은 추가 데이터가 필요해 v2 에서 보강 예정
 * (현재는 빈 객체로 보내고 AI 가 가용 데이터 한도에서 의견을 낸다).
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GuardianReportSummaryService {

    private final PatientProfileService patientProfileService;
    private final UsageStatService usageStatService;
    private final GuardianDialogueSummaryService dialogueSummaryService;
    private final AiReportSummaryClient aiClient;

    public WeeklyReportAiSummaryResponse summary(
            Long currentUserId, UserRole role, Long patientProfileId, LocalDate weekStart) {
        if (weekStart.getDayOfWeek() != DayOfWeek.MONDAY) {
            // 리포트 UI 가 월요일 기준으로 끊으므로 임의 일자 진입은 거부.
            throw new BusinessException(GlobalErrorCode.INVALID_INPUT);
        }

        // 명시적 fast-fail. 하위 서비스도 자체 auth 를 하지만 P-001 으로 통일된 에러 코드 보장.
        patientProfileService.findOwnedOrThrow(currentUserId, patientProfileId);

        LocalDate weekEnd = weekStart.plusDays(6);
        LocalDate today = LocalDate.now();
        boolean isCurrentWeek = !weekStart.isAfter(today) && !weekEnd.isBefore(today);
        int daysElapsed =
                isCurrentWeek
                        ? (int) Math.min(7, ChronoUnit.DAYS.between(weekStart, today) + 1)
                        : 7;

        UsageStatDailyResponse thisWeekUsage =
                usageStatService.daily(currentUserId, role, patientProfileId, weekStart, weekEnd);
        WeeklyDialogueTrendResponse trend =
                dialogueSummaryService.weekly(currentUserId, patientProfileId, weekEnd);

        LocalDate prevWeekStart = weekStart.minusDays(7);
        LocalDate prevWeekEnd = weekStart.minusDays(1);
        UsageStatDailyResponse prevWeekUsage =
                usageStatService.daily(
                        currentUserId, role, patientProfileId, prevWeekStart, prevWeekEnd);

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("patient_profile_id", patientProfileId);
        payload.put("week_start", weekStart.toString());
        payload.put("week_end", weekEnd.toString());
        payload.put("is_current_week", isCurrentWeek);
        payload.put("days_elapsed", daysElapsed);
        payload.put("activity", buildActivityPayload(thisWeekUsage));
        payload.put("dialogue", buildDialoguePayload(trend));
        payload.put("previous_week_delta", buildPreviousWeekDelta(thisWeekUsage, prevWeekUsage));

        return aiClient.summarize(payload);
    }

    private static Map<String, Object> buildActivityPayload(UsageStatDailyResponse usage) {
        long totalLoginSec = 0;
        long musicSec = 0;
        long taekwondoSec = 0;
        long gymnasticsSec = 0;
        long artSec = 0;
        int participatedDays = 0;
        int sessionCount = 0; // 활동 세션 개수는 별도 집계 (v1 미포함 → 0)
        for (UsageStatDailyResponse.Item item : usage.items()) {
            totalLoginSec += item.login();
            musicSec += item.music();
            taekwondoSec += item.taekwondo();
            gymnasticsSec += item.gymnastics();
            artSec += item.art();
            if (item.login() > 0) participatedDays++;
        }

        Map<String, Map<String, Number>> achievements = new LinkedHashMap<>();
        achievements.put("music", Map.of("seconds", musicSec));
        achievements.put("taekwondo", Map.of("seconds", taekwondoSec));
        achievements.put("exercise", Map.of("seconds", gymnasticsSec));
        achievements.put("art", Map.of("seconds", artSec));

        Map<String, Object> activity = new LinkedHashMap<>();
        activity.put("participated_days", participatedDays);
        activity.put("total_minutes", (int) (totalLoginSec / 60));
        activity.put("session_count", sessionCount);
        activity.put("fuel_earned", 0); // v1 미포함
        activity.put("time_of_day", Map.of()); // v1 미포함
        activity.put("achievements", achievements);
        return activity;
    }

    private static Map<String, Object> buildDialoguePayload(WeeklyDialogueTrendResponse trend) {
        int totalSessions = 0;
        List<Map<String, Object>> trendPoints = new ArrayList<>(trend.points().size());
        for (WeeklyDialogueTrendResponse.TrendPoint p : trend.points()) {
            totalSessions += p.sessionCount();
            Map<String, Object> point = new LinkedHashMap<>();
            point.put("date", p.date().toString());
            point.put("positive_neutral_percent", p.positiveNeutralPercent());
            point.put("session_count", p.sessionCount());
            trendPoints.add(point);
        }

        Map<String, Object> dialogue = new LinkedHashMap<>();
        // valence_distribution / concern_signals / protective_factors / topics 는 v2 보강.
        // 현재는 일별 톤 트렌드와 총 세션 수만 전달 → AI 가 가용 데이터로 의견 생성.
        // qualitative_summary 는 AI 스키마에서 Optional 이라 미포함 (null 값 직렬화 회피).
        dialogue.put("valence_distribution", Map.of());
        dialogue.put("concern_signals", List.of());
        dialogue.put("protective_factors", List.of());
        dialogue.put("topics", List.of());
        dialogue.put("npc_visits", Map.of());
        dialogue.put("daily_trend", trendPoints);
        dialogue.put("total_sessions", totalSessions);
        return dialogue;
    }

    private static Map<String, Object> buildPreviousWeekDelta(
            UsageStatDailyResponse thisWeek, UsageStatDailyResponse prevWeek) {
        int thisDays = 0;
        long thisLogin = 0;
        for (UsageStatDailyResponse.Item it : thisWeek.items()) {
            thisLogin += it.login();
            if (it.login() > 0) thisDays++;
        }
        int prevDays = 0;
        long prevLogin = 0;
        for (UsageStatDailyResponse.Item it : prevWeek.items()) {
            prevLogin += it.login();
            if (it.login() > 0) prevDays++;
        }
        Map<String, Object> delta = new LinkedHashMap<>();
        delta.put("participated_days_delta", thisDays - prevDays);
        delta.put("total_minutes_delta", (int) ((thisLogin - prevLogin) / 60));
        delta.put("session_count_delta", 0); // v1 미포함
        return delta;
    }
}
