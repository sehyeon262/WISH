package com.comong.backend.domain.taekwondo.controller;

import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.comong.backend.domain.taekwondo.dto.TaekwondoBeltHistoryResponse;
import com.comong.backend.domain.taekwondo.service.TaekwondoProgressService;
import com.comong.backend.global.common.response.ApiResponse;
import com.comong.backend.global.security.JwtTokenProvider.AuthenticatedUser;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;

@Tag(name = "Taekwondo Belt History", description = "태권도 띠 승급 이력 API")
@RestController
@RequestMapping("/taekwondo-belt-history")
@RequiredArgsConstructor
public class TaekwondoBeltHistoryController {

    private final TaekwondoProgressService taekwondoProgressService;

    @Operation(
            summary = "태권도 띠 승급 이력 조회",
            description =
                    "환자별 띠 승급 이벤트를 최신 순으로 조회합니다. 첫 진입은 fromBelt = null 로 표시됩니다."
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
                description = "환자 프로필이 없거나 본인 소유가 아님 (P-001) — 비소유/비존재를 구분하지 않는 enumeration 방지 정책")
    })
    @GetMapping
    public ResponseEntity<ApiResponse<List<TaekwondoBeltHistoryResponse>>> findHistory(
            @AuthenticationPrincipal AuthenticatedUser currentUser,
            @Parameter(description = "조회 대상 환자 프로필 ID (본인 소유)", required = true) @RequestParam
                    Long patientProfileId) {
        return ResponseEntity.ok(
                ApiResponse.success(
                        taekwondoProgressService.findHistory(
                                currentUser.userId(), patientProfileId)));
    }
}
