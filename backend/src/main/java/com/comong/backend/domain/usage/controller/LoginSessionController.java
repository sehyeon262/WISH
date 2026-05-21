package com.comong.backend.domain.usage.controller;

import jakarta.validation.Valid;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.comong.backend.domain.usage.dto.LoginSessionResponse;
import com.comong.backend.domain.usage.dto.LoginSessionStartRequest;
import com.comong.backend.domain.usage.service.LoginSessionService;
import com.comong.backend.global.common.response.ApiResponse;
import com.comong.backend.global.security.JwtTokenProvider.AuthenticatedUser;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;

@Tag(name = "Login Session", description = "환자 앱 접속 시간 추적용 세션 API")
@RestController
@RequestMapping("/login-sessions")
@RequiredArgsConstructor
public class LoginSessionController {

    private final LoginSessionService loginSessionService;

    @Operation(
            summary = "접속 세션 시작",
            description =
                    "환자가 앱에 진입한 순간 호출하여 활동 시간 추적용 세션을 시작합니다. 반환된 ID 로 이후 heartbeat/end 를 호출합니다.")
    @ApiResponses({
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "201",
                description = "세션 생성 성공"),
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
    public ResponseEntity<ApiResponse<LoginSessionResponse>> start(
            @AuthenticationPrincipal AuthenticatedUser currentUser,
            @Valid @RequestBody LoginSessionStartRequest request) {
        LoginSessionResponse response =
                loginSessionService.start(currentUser.userId(), request.patientProfileId());
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(response));
    }

    @Operation(
            summary = "접속 세션 heartbeat",
            description =
                    "FE 가 주기적(권장 30~60초)으로 호출하여 세션 유효성을 갱신합니다. 종료된 세션이거나 out-of-order 호출은 no-op 으로"
                            + " 처리됩니다.")
    @ApiResponses({
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "200",
                description = "heartbeat 성공"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "401",
                description = "인증 필요 (G-003)"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "404",
                description =
                        "세션이 없거나 본인 환자 프로필 소유가 아님 (US-001) — enumeration 방지를 위해 비소유/비존재를 구분하지 않음")
    })
    @PatchMapping("/{id}/heartbeat")
    public ResponseEntity<ApiResponse<LoginSessionResponse>> heartbeat(
            @AuthenticationPrincipal AuthenticatedUser currentUser,
            @Parameter(description = "세션 ID", required = true) @PathVariable Long id) {
        return ResponseEntity.ok(
                ApiResponse.success(loginSessionService.heartbeat(currentUser.userId(), id)));
    }

    @Operation(
            summary = "접속 세션 종료",
            description = "환자가 앱을 종료한 시점에 호출하여 세션을 닫습니다. 이미 종료된 세션이면 no-op 으로 처리됩니다 (idempotent).")
    @ApiResponses({
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "200",
                description = "종료 성공"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "401",
                description = "인증 필요 (G-003)"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "404",
                description = "세션이 없거나 본인 환자 프로필 소유가 아님 (US-001)")
    })
    @PatchMapping("/{id}/end")
    public ResponseEntity<ApiResponse<LoginSessionResponse>> end(
            @AuthenticationPrincipal AuthenticatedUser currentUser,
            @Parameter(description = "세션 ID", required = true) @PathVariable Long id) {
        return ResponseEntity.ok(
                ApiResponse.success(loginSessionService.end(currentUser.userId(), id)));
    }
}
