package com.comong.backend.domain.taekwondo.controller;

import java.util.List;

import jakarta.validation.Valid;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.comong.backend.domain.taekwondo.dto.TaekwondoSessionCreateRequest;
import com.comong.backend.domain.taekwondo.dto.TaekwondoSessionMotionSaveRequest;
import com.comong.backend.domain.taekwondo.dto.TaekwondoSessionMotionSaveResponse;
import com.comong.backend.domain.taekwondo.dto.TaekwondoSessionResponse;
import com.comong.backend.domain.taekwondo.dto.TaekwondoSessionSummaryResponse;
import com.comong.backend.domain.taekwondo.service.TaekwondoSessionService;
import com.comong.backend.global.common.response.ApiResponse;
import com.comong.backend.global.security.JwtTokenProvider.AuthenticatedUser;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;

@Tag(name = "Taekwondo Session", description = "태권도 세션 결과 API")
@RestController
@RequestMapping("/taekwondo-sessions")
@RequiredArgsConstructor
public class TaekwondoSessionController {

    private final TaekwondoSessionService taekwondoSessionService;

    @Operation(
            summary = "태권도 세션 기록 목록 조회",
            description =
                    "환자별 태권도 세션 기록 요약 목록을 조회합니다."
                            + " 환자별 컬렉션 조회 패턴 — 다중 환자/의료진 확장 대비로 patientProfileId 를 명시적으로"
                            + " 받습니다 (guardian-patient.md 4.2 예외 케이스).")
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
    @GetMapping
    public ResponseEntity<ApiResponse<List<TaekwondoSessionSummaryResponse>>> list(
            @AuthenticationPrincipal AuthenticatedUser currentUser,
            @Parameter(description = "조회 대상 환자 프로필 ID (본인 소유)", required = true) @RequestParam
                    Long patientProfileId) {
        return ResponseEntity.ok(
                ApiResponse.success(
                        taekwondoSessionService.findAll(currentUser.userId(), patientProfileId)));
    }

    @Operation(summary = "태권도 세션 기록 상세 조회", description = "태권도 세션과 동작별 수행 결과를 조회합니다.")
    @ApiResponses({
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "200",
                description = "조회 성공"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "401",
                description = "인증 필요 (G-003)"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "404",
                description =
                        "세션이 없거나 본인 환자 프로필 소유가 아님 (TK-005) — enumeration 방지를 위해 비소유/비존재를 구분하지 않음")
    })
    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<TaekwondoSessionResponse>> detail(
            @AuthenticationPrincipal AuthenticatedUser currentUser,
            @Parameter(description = "태권도 세션 ID (본인 환자 프로필 소유)", required = true) @PathVariable
                    Long id) {
        return ResponseEntity.ok(
                ApiResponse.success(taekwondoSessionService.findOne(currentUser.userId(), id)));
    }

    @Operation(
            summary = "태권도 세션 생성",
            description =
                    "빈 태권도 세션을 생성하고 sessionId 를 반환합니다. 이후 동작별 결과는 `POST /taekwondo-sessions/{id}/motions` 로 누적 저장합니다.")
    @ApiResponses({
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "201",
                description = "생성 성공"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "400",
                description = "입력값 검증 실패 (G-001)"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "401",
                description = "인증 필요 (G-003)"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "404",
                description = "환자 프로필이 없거나 본인 소유가 아님 (P-001)")
    })
    @PostMapping
    public ResponseEntity<ApiResponse<TaekwondoSessionResponse>> create(
            @AuthenticationPrincipal AuthenticatedUser currentUser,
            @Valid @RequestBody TaekwondoSessionCreateRequest request) {
        TaekwondoSessionResponse response =
                taekwondoSessionService.create(currentUser.userId(), request);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(response));
    }

    @Operation(
            summary = "태권도 세션 동작 단건 저장",
            description =
                    "지정한 태권도 세션에 동작 1건을 추가 저장하고 세션의 누적 통계 (duration, averageAccuracy, completedMotionCount, monstersDefeated) 를 재계산합니다.")
    @ApiResponses({
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "201",
                description = "저장 성공"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "400",
                description = "입력값 검증 실패 (G-001) 또는 세션 품새와 동작 품새 불일치 (TK-004)"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "401",
                description = "인증 필요 (G-003)"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "404",
                description = "세션이 없거나 본인 소유가 아님 (TK-005) 또는 요청한 동작 ID 가 존재하지 않음 (TK-001)")
    })
    @PostMapping("/{id}/motions")
    public ResponseEntity<ApiResponse<TaekwondoSessionMotionSaveResponse>> saveMotion(
            @AuthenticationPrincipal AuthenticatedUser currentUser,
            @Parameter(description = "태권도 세션 ID (본인 환자 프로필 소유)", required = true) @PathVariable
                    Long id,
            @Valid @RequestBody TaekwondoSessionMotionSaveRequest request) {
        TaekwondoSessionMotionSaveResponse response =
                taekwondoSessionService.saveMotion(currentUser.userId(), id, request);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(response));
    }
}
