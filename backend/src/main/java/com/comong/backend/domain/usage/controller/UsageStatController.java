package com.comong.backend.domain.usage.controller;

import java.time.LocalDate;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.comong.backend.domain.usage.dto.UsageStatCumulativeResponse;
import com.comong.backend.domain.usage.dto.UsageStatDailyResponse;
import com.comong.backend.domain.usage.service.UsageStatService;
import com.comong.backend.global.common.response.ApiResponse;
import com.comong.backend.global.security.JwtTokenProvider.AuthenticatedUser;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;

@Tag(name = "Usage Stat", description = "환자 활동 시간 통계 조회 API")
@RestController
@RequestMapping("/patients/{patientId}/usage-stats")
@RequiredArgsConstructor
public class UsageStatController {

    private final UsageStatService usageStatService;

    @Operation(
            summary = "일별 사용 시간 조회",
            description =
                    "환자의 일별 사용 시간을 조회합니다 (전체 접속 + 컨텐츠별 4종). 과거 날짜는 매일 KST 01:00 배치가"
                            + " 적재한 캐시를 읽고, 오늘 분은 source 테이블에서 즉석 계산합니다. from 미지정 시"
                            + " to-7일, to 미지정 시 오늘이 기본값.")
    @ApiResponses({
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "200",
                description = "조회 성공"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "400",
                description = "from > to 등 잘못된 입력 (G-001)"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "401",
                description = "인증 필요 (G-003)"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "404",
                description = "환자 프로필이 없거나 본인 소유가 아님 (P-001) — enumeration 방지")
    })
    @GetMapping("/daily")
    public ResponseEntity<ApiResponse<UsageStatDailyResponse>> daily(
            @AuthenticationPrincipal AuthenticatedUser currentUser,
            @Parameter(description = "조회 대상 환자 ID", required = true) @PathVariable Long patientId,
            @Parameter(description = "조회 시작일 (YYYY-MM-DD, 기본 to-7일)")
                    @RequestParam(required = false)
                    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
                    LocalDate from,
            @Parameter(description = "조회 종료일 (YYYY-MM-DD, 기본 오늘)")
                    @RequestParam(required = false)
                    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
                    LocalDate to) {
        return ResponseEntity.ok(
                ApiResponse.success(
                        usageStatService.daily(
                                currentUser.userId(), currentUser.role(), patientId, from, to)));
    }

    @Operation(
            summary = "누적 사용 시간 조회",
            description =
                    "환자의 컨텐츠 타입별 누적 사용 시간을 조회합니다. 과거는 daily_usage_stat 합산, 오늘 분은 source 즉석 계산.")
    @ApiResponses({
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "200",
                description = "조회 성공"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "401",
                description = "인증 필요 (G-003)"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "404",
                description = "환자 프로필이 없거나 본인 소유가 아님 (P-001)")
    })
    @GetMapping("/cumulative")
    public ResponseEntity<ApiResponse<UsageStatCumulativeResponse>> cumulative(
            @AuthenticationPrincipal AuthenticatedUser currentUser,
            @Parameter(description = "조회 대상 환자 ID", required = true) @PathVariable Long patientId) {
        return ResponseEntity.ok(
                ApiResponse.success(
                        usageStatService.cumulative(
                                currentUser.userId(), currentUser.role(), patientId)));
    }
}
