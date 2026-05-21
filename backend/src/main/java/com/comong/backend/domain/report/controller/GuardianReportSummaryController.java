package com.comong.backend.domain.report.controller;

import java.time.LocalDate;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.comong.backend.domain.report.dto.WeeklyReportAiSummaryResponse;
import com.comong.backend.domain.report.service.GuardianReportSummaryService;
import com.comong.backend.global.common.response.ApiResponse;
import com.comong.backend.global.security.JwtTokenProvider.AuthenticatedUser;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;

/**
 * 보호자 페이지 주간 리포트 AI 요약 (S14P31E103-745).
 *
 * <p>월~일 한 주의 활동/대화 집계를 AI 서버에 던져 종합 코멘트와 제안을 받는다. AI 호출 실패 시에도 안전 문구 응답을 내려서 리포트 화면은 항상 유지된다.
 */
@Tag(name = "Guardian Report AI Summary", description = "보호자 주간 리포트 AI 요약 API")
@RestController
@RequestMapping("/guardian/patients/{patientProfileId}/report")
@RequiredArgsConstructor
public class GuardianReportSummaryController {

    private final GuardianReportSummaryService summaryService;

    @Operation(
            summary = "주간 리포트 AI 요약",
            description =
                    "월요일 weekStart 부터 그 주 일요일까지의 활동·대화 데이터를 모아 AI 가 보호자용 종합 코멘트와"
                            + " 제안을 생성한다. AI 호출 실패 시에도 안전 문구로 fallback 응답을 보장한다.")
    @GetMapping("/ai-summary")
    public ResponseEntity<ApiResponse<WeeklyReportAiSummaryResponse>> aiSummary(
            @AuthenticationPrincipal AuthenticatedUser currentUser,
            @Parameter(description = "환자 프로필 ID (본인 소유)", required = true) @PathVariable
                    Long patientProfileId,
            @Parameter(description = "주 시작일 — 반드시 월요일 (YYYY-MM-DD)", required = true)
                    @RequestParam
                    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
                    LocalDate weekStart) {
        return ResponseEntity.ok(
                ApiResponse.success(
                        summaryService.summary(
                                currentUser.userId(),
                                currentUser.role(),
                                patientProfileId,
                                weekStart)));
    }
}
