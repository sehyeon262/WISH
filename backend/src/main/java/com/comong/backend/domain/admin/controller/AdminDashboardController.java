package com.comong.backend.domain.admin.controller;

import java.time.LocalDate;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.comong.backend.domain.admin.dto.AdminDashboardResponse;
import com.comong.backend.domain.admin.dto.AdminPatientDashboardResponse;
import com.comong.backend.domain.admin.service.AdminDashboardService;
import com.comong.backend.global.common.response.ApiResponse;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;

@Tag(name = "Admin Dashboard", description = "관리자 운영 대시보드 API")
@RestController
@RequestMapping("/admin/dashboard")
@RequiredArgsConstructor
public class AdminDashboardController {

    private final AdminDashboardService adminDashboardService;

    @Operation(summary = "관리자 대시보드 조회", description = "사용시간 집계 기반 KPI, 추이, 환자 활동 현황을 조회합니다.")
    @PreAuthorize("hasRole('ADMIN')")
    @GetMapping
    public ResponseEntity<ApiResponse<AdminDashboardResponse>> getDashboard(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
                    LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
                    LocalDate to) {
        return ResponseEntity.ok(ApiResponse.success(adminDashboardService.getDashboard(from, to)));
    }

    @Operation(summary = "관리자 환자 활동 상세 조회", description = "환자별 사용시간 추이와 콘텐츠 활동 상세를 조회합니다.")
    @PreAuthorize("hasRole('ADMIN')")
    @GetMapping("/patients/{patientId}")
    public ResponseEntity<ApiResponse<AdminPatientDashboardResponse>> getPatientDashboard(
            @PathVariable Long patientId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
                    LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
                    LocalDate to) {
        return ResponseEntity.ok(
                ApiResponse.success(
                        adminDashboardService.getPatientDashboard(patientId, from, to)));
    }
}
