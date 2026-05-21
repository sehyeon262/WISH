package com.comong.backend.domain.patient.controller;

import java.net.URI;
import java.util.List;

import jakarta.validation.Valid;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.comong.backend.domain.patient.dto.PatientProfileCreateRequest;
import com.comong.backend.domain.patient.dto.PatientProfileResponse;
import com.comong.backend.domain.patient.dto.PatientProfileUpdateRequest;
import com.comong.backend.domain.patient.service.PatientProfileService;
import com.comong.backend.global.common.response.ApiResponse;
import com.comong.backend.global.security.JwtTokenProvider.AuthenticatedUser;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;

@Tag(name = "PatientProfile", description = "환자 프로필 API")
@RestController
@RequestMapping("/patient-profiles")
@RequiredArgsConstructor
public class PatientProfileController {

    private final PatientProfileService patientProfileService;

    @Operation(summary = "환자 프로필 등록", description = "현재 로그인한 보호자 계정 하위로 환자 프로필을 생성한다.")
    @ApiResponses({
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "201",
                description = "생성 성공 — Location 헤더에 새 프로필 URI"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "400",
                description = "입력값 검증 실패 (G-001)"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "401",
                description = "인증 필요 (G-003)"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "409",
                description = "보호자가 이미 환자 프로필을 가짐 (P-002) — MVP 1:1 정책")
    })
    @PostMapping
    public ResponseEntity<ApiResponse<PatientProfileResponse>> create(
            @AuthenticationPrincipal AuthenticatedUser currentUser,
            @Valid @RequestBody PatientProfileCreateRequest request) {
        PatientProfileResponse response =
                patientProfileService.create(currentUser.userId(), request);
        URI location = URI.create("/patient-profiles/" + response.id());
        return ResponseEntity.created(location).body(ApiResponse.success(response));
    }

    @Operation(summary = "환자 프로필 목록 조회", description = "현재 로그인한 보호자 계정이 소유한 환자 프로필 목록을 반환한다.")
    @ApiResponses({
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "200",
                description = "조회 성공"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "401",
                description = "인증 필요 (G-003)")
    })
    @GetMapping
    public ResponseEntity<ApiResponse<List<PatientProfileResponse>>> list(
            @AuthenticationPrincipal AuthenticatedUser currentUser) {
        return ResponseEntity.ok(
                ApiResponse.success(patientProfileService.findMine(currentUser.userId())));
    }

    @Operation(summary = "환자 프로필 단건 조회", description = "ID 로 환자 프로필을 조회한다. 본인 소유가 아니면 404 로 응답한다.")
    @ApiResponses({
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "200",
                description = "조회 성공"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "401",
                description = "인증 필요 (G-003)"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "404",
                description = "프로필이 없거나 본인 소유가 아님 (P-001) — enumeration 방지를 위해 비소유/비존재를 구분하지 않음")
    })
    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<PatientProfileResponse>> detail(
            @AuthenticationPrincipal AuthenticatedUser currentUser,
            @Parameter(description = "환자 프로필 ID (본인 소유)", required = true) @PathVariable Long id) {
        return ResponseEntity.ok(
                ApiResponse.success(patientProfileService.findOne(currentUser.userId(), id)));
    }

    @Operation(
            summary = "환자 프로필 부분 수정",
            description =
                    "ID 로 지정한 환자 프로필의 필드를 부분 수정한다. null 인 필드는 기존 값을 유지한다. 본인 소유가 아니면 404 로 응답한다.")
    @ApiResponses({
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "200",
                description = "수정 성공"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "400",
                description = "입력값 검증 실패 (G-001)"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "401",
                description = "인증 필요 (G-003)"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "404",
                description = "프로필이 없거나 본인 소유가 아님 (P-001)")
    })
    @PatchMapping("/{id}")
    public ResponseEntity<ApiResponse<PatientProfileResponse>> update(
            @AuthenticationPrincipal AuthenticatedUser currentUser,
            @Parameter(description = "환자 프로필 ID (본인 소유)", required = true) @PathVariable Long id,
            @Valid @RequestBody PatientProfileUpdateRequest request) {
        return ResponseEntity.ok(
                ApiResponse.success(
                        patientProfileService.update(currentUser.userId(), id, request)));
    }
}
