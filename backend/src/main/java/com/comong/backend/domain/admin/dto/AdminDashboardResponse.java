package com.comong.backend.domain.admin.dto;

import java.time.LocalDate;
import java.util.List;

public record AdminDashboardResponse(
        LocalDate from,
        LocalDate to,
        Summary summary,
        PreviousPeriodSummary previous,
        List<DailyUsage> dailyUsage,
        List<ContentShare> contentShares,
        List<PatientActivity> patientActivities,
        List<DashboardAlert> alerts) {

    public record Summary(
            long totalUsers,
            long guardianUsers,
            long adminUsers,
            long totalPatients,
            long todayActivePatients,
            long todayTotalSeconds,
            long periodTotalSeconds,
            long averageDailySeconds,
            long periodActivePatients,
            long atRiskPatients,
            long newUsersToday,
            long newPatientsToday) {}

    /**
     * 직전 동기간 비교용 요약. 기간이 7 일이면 그 7 일 전 7 일 분, 14 일이면 그 14 일 전 14 일 분의 동일 지표를 담는다. KPI 카드의 추세
     * 화살표/퍼센트 산출 근거.
     */
    public record PreviousPeriodSummary(
            LocalDate from,
            LocalDate to,
            long periodTotalSeconds,
            long averageDailySeconds,
            long periodActivePatients) {}

    public record DailyUsage(
            LocalDate date,
            long login,
            long art,
            long music,
            long taekwondo,
            long gymnastics,
            long total,
            long activePatients) {}

    public record ContentShare(
            String contentType, String label, long totalSeconds, double percentage) {}

    public record PatientActivity(
            long patientId,
            String patientName,
            String patientNickname,
            String guardianEmail,
            long todaySeconds,
            long periodSeconds,
            String favoriteContent,
            LocalDate lastActiveDate,
            String status) {}

    public record DashboardAlert(
            String type, String title, String description, String severity, long count) {}
}
