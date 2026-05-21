package com.comong.backend.domain.admin.dto;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

import com.comong.backend.domain.patient.entity.Gender;

public record AdminPatientDashboardResponse(
        LocalDate from,
        LocalDate to,
        Patient patient,
        Summary summary,
        List<DailyUsage> dailyUsage,
        List<AdminDashboardResponse.ContentShare> contentShares,
        HourlyHeatmap heatmap) {

    /**
     * 요일×시간대 사용시간 히트맵. cells 는 7(요일)×24(시간) = 168 개 셀. weekday 1=월 ... 7=일 (Java DayOfWeek 동일).
     * maxSeconds 는 색상 스케일 정규화용.
     */
    public record HourlyHeatmap(long maxSeconds, List<HeatmapCell> cells) {}

    public record HeatmapCell(int weekday, int hour, long totalSeconds) {}

    public record Patient(
            long patientId,
            String patientName,
            String patientNickname,
            Gender gender,
            LocalDate birthDate,
            LocalDateTime createdAt,
            String guardianEmail) {}

    public record Summary(
            long todaySeconds,
            long periodSeconds,
            long contentSeconds,
            long averageDailySeconds,
            long activeDays,
            LocalDate lastActiveDate,
            String status,
            String favoriteContent,
            boolean contentSkewed,
            int riskInactiveDays) {}

    public record DailyUsage(
            LocalDate date,
            long login,
            long art,
            long music,
            long taekwondo,
            long gymnastics,
            long total,
            boolean active) {}
}
