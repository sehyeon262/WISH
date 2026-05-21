package com.comong.backend.domain.taekwondo.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.comong.backend.domain.taekwondo.dto.TaekwondoProgressResponse;
import com.comong.backend.domain.taekwondo.service.TaekwondoProgressService;
import com.comong.backend.global.common.response.ApiResponse;
import com.comong.backend.global.security.JwtTokenProvider.AuthenticatedUser;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;

@Tag(name = "Taekwondo Progress", description = "태권도 진행 상태 API")
@RestController
@RequestMapping("/taekwondo-progress")
@RequiredArgsConstructor
public class TaekwondoProgressController {

    private final TaekwondoProgressService taekwondoProgressService;

    @Operation(
            summary = "태권도 진행 상태 조회",
            description =
                    "현재 띠, 누적 처치수, 다음 띠 임계값까지 남은 처치수, 세션 수, 평균 정확도를 조회합니다."
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
                description =
                        "환자 프로필이 없거나 본인 소유가 아님 (P-001), 또는 진척도 데이터 없음 (TK-006)."
                                + " 응답 body 의 code 필드로 구분.")
    })
    @GetMapping
    public ResponseEntity<ApiResponse<TaekwondoProgressResponse>> findOne(
            @AuthenticationPrincipal AuthenticatedUser currentUser,
            @Parameter(description = "조회 대상 환자 프로필 ID (본인 소유)", required = true) @RequestParam
                    Long patientProfileId) {
        return ResponseEntity.ok(
                ApiResponse.success(
                        taekwondoProgressService.findOne(currentUser.userId(), patientProfileId)));
    }
}
