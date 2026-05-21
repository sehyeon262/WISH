package com.comong.backend.domain.usage.controller;

import java.time.LocalDate;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.comong.backend.domain.usage.dto.UsageAverageResponse;
import com.comong.backend.domain.usage.service.UsageAverageService;
import com.comong.backend.global.common.response.ApiResponse;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;

@Tag(name = "Usage Stat", description = "사용시간 통계 API")
@RestController
@RequestMapping("/usage-stats")
@RequiredArgsConstructor
public class UsageAverageController {

    private final UsageAverageService usageAverageService;

    @Operation(
            summary = "활동 환자 기준 기간 평균 사용시간 조회",
            description = "조회 기간 내 실제 활동 환자 수를 분모로 접속 시간과 콘텐츠별 이용시간 평균을 조회합니다.")
    @GetMapping("/period-averages")
    public ResponseEntity<ApiResponse<UsageAverageResponse>> getPeriodAverages(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
                    LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
                    LocalDate to) {
        return ResponseEntity.ok(ApiResponse.success(usageAverageService.periodAverages(from, to)));
    }
}
