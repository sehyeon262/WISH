package com.comong.backend.domain.dialogue.controller;

import java.time.LocalDate;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.comong.backend.domain.dialogue.dto.DailyDialogueSummaryResponse;
import com.comong.backend.domain.dialogue.dto.WeeklyDialogueTrendResponse;
import com.comong.backend.domain.dialogue.service.GuardianDialogueSummaryService;
import com.comong.backend.global.common.response.ApiResponse;
import com.comong.backend.global.security.JwtTokenProvider.AuthenticatedUser;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;

/**
 * 보호자 페이지의 *오늘 종합 요약* + *주간 응답 톤 변화* 조회.
 *
 * <p>점수는 제공하지 않음 — 임상 진단 위험 회피 (설계 문서 v3 섹션 2). 대신 응답 톤 분포 (긍정/보통/부정 카운트), 시그널 카드, 정성 요약 텍스트를 내린다.
 */
@Tag(name = "Guardian Dialogue Summary", description = "보호자 페이지의 오늘 종합 + 주간 응답 톤 변화 API")
@RestController
@RequestMapping("/guardian/patients/{patientProfileId}/dialogue/summary")
@RequiredArgsConstructor
public class GuardianDialogueSummaryController {

    private final GuardianDialogueSummaryService summaryService;

    @Operation(
            summary = "오늘의 대화 종합",
            description =
                    "환자의 특정 일자 (KST) 모든 세션을 합쳐 응답 톤 분포 + 정성 요약 + 시그널 + 주제 + 만난 NPC 를 반환한다."
                            + " 점수는 제공하지 않는다 (임상 진단 회피).")
    @GetMapping("/daily")
    public ResponseEntity<ApiResponse<DailyDialogueSummaryResponse>> daily(
            @AuthenticationPrincipal AuthenticatedUser currentUser,
            @Parameter(description = "환자 프로필 ID (본인 소유)", required = true) @PathVariable
                    Long patientProfileId,
            @Parameter(description = "조회 일자 (KST). 미지정 시 오늘.")
                    @RequestParam(required = false)
                    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
                    LocalDate date) {
        LocalDate target = date != null ? date : LocalDate.now();
        return ResponseEntity.ok(
                ApiResponse.success(
                        summaryService.daily(currentUser.userId(), patientProfileId, target)));
    }

    @Operation(
            summary = "주간 응답 톤 변화",
            description = "{@code endDate} (포함) 직전 7일치 일별 '긍정+보통 비율 %'. 점수 아님.")
    @GetMapping("/weekly")
    public ResponseEntity<ApiResponse<WeeklyDialogueTrendResponse>> weekly(
            @AuthenticationPrincipal AuthenticatedUser currentUser,
            @Parameter(description = "환자 프로필 ID (본인 소유)", required = true) @PathVariable
                    Long patientProfileId,
            @Parameter(description = "마지막 일자 (KST). 미지정 시 오늘.")
                    @RequestParam(required = false)
                    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
                    LocalDate endDate) {
        LocalDate target = endDate != null ? endDate : LocalDate.now();
        return ResponseEntity.ok(
                ApiResponse.success(
                        summaryService.weekly(currentUser.userId(), patientProfileId, target)));
    }
}
