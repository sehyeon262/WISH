package com.comong.backend.domain.usage.controller;

import java.time.LocalDate;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.comong.backend.domain.usage.dto.UsageRankingResponse;
import com.comong.backend.domain.usage.service.UsageRankingService;
import com.comong.backend.global.common.response.ApiResponse;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;

@Tag(name = "Usage Stat", description = "사용시간 통계 API")
@RestController
@RequestMapping("/usage-stats")
@RequiredArgsConstructor
public class UsageRankingController {

    private final UsageRankingService usageRankingService;

    @Operation(
            summary = "전체 환자 사용 시간 순위 조회",
            description =
                    "조회 기간 내 컨텐츠(미술/음악/태권도/체조) 합산 시간을 환자별로 집계해 닉네임과 함께 내림차순으로 응답합니다."
                            + " LOGIN(로비/메뉴) 시간은 제외합니다. 보호자 리포트의 \"사용 시간 순위\" 카드용.")
    @GetMapping("/period-rankings")
    public ResponseEntity<ApiResponse<UsageRankingResponse>> getPeriodRankings(
            @Parameter(description = "조회 시작일 (YYYY-MM-DD, 미지정 시 전체 누적)")
                    @RequestParam(required = false)
                    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
                    LocalDate from,
            @Parameter(description = "조회 종료일 (YYYY-MM-DD, 미지정 시 오늘)")
                    @RequestParam(required = false)
                    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
                    LocalDate to) {
        return ResponseEntity.ok(ApiResponse.success(usageRankingService.periodRankings(from, to)));
    }
}
