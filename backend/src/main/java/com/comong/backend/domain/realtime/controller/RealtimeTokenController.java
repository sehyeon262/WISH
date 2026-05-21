package com.comong.backend.domain.realtime.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.comong.backend.domain.realtime.dto.LiveKitTokenResponse;
import com.comong.backend.domain.realtime.service.RealtimeTokenService;
import com.comong.backend.global.common.response.ApiResponse;
import com.comong.backend.global.security.JwtTokenProvider.AuthenticatedUser;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;

@Tag(name = "Realtime", description = "LiveKit 실시간 모니터링 API")
@RestController
@RequestMapping("/realtime/login-sessions/{loginSessionId}")
@RequiredArgsConstructor
public class RealtimeTokenController {

    private final RealtimeTokenService realtimeTokenService;

    @Operation(
            summary = "게임앱 LiveKit 토큰 발급",
            description = "아이 게임앱이 로그인 세션에 대응되는 LiveKit 룸에 입장하기 위한 토큰을 발급합니다.")
    @ApiResponses({
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "200",
                description = "토큰 발급 성공"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "401",
                description = "인증 필요 (G-003)"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "404",
                description = "세션이 없거나 본인 환자 프로필 소유가 아님 (US-001)"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "409",
                description = "이미 종료된 접속 세션 (RT-002)"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "503",
                description = "LiveKit 설정 누락 (RT-001)")
    })
    @PostMapping("/game-token")
    public ResponseEntity<ApiResponse<LiveKitTokenResponse>> issueGameToken(
            @AuthenticationPrincipal AuthenticatedUser currentUser,
            @Parameter(description = "접속 세션 ID", required = true) @PathVariable
                    Long loginSessionId) {
        return ResponseEntity.ok(
                ApiResponse.success(
                        realtimeTokenService.issueGameToken(currentUser.userId(), loginSessionId)));
    }

    @Operation(
            summary = "보호자앱 LiveKit 토큰 발급",
            description = "보호자앱이 로그인 세션에 대응되는 LiveKit 룸에 입장하기 위한 토큰을 발급합니다.")
    @ApiResponses({
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "200",
                description = "토큰 발급 성공"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "401",
                description = "인증 필요 (G-003)"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "404",
                description = "세션이 없거나 본인 환자 프로필 소유가 아님 (US-001)"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "409",
                description = "이미 종료된 접속 세션 (RT-002)"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "503",
                description = "LiveKit 설정 누락 (RT-001)")
    })
    @PostMapping("/guardian-token")
    public ResponseEntity<ApiResponse<LiveKitTokenResponse>> issueGuardianToken(
            @AuthenticationPrincipal AuthenticatedUser currentUser,
            @Parameter(description = "접속 세션 ID", required = true) @PathVariable
                    Long loginSessionId) {
        return ResponseEntity.ok(
                ApiResponse.success(
                        realtimeTokenService.issueGuardianToken(
                                currentUser.userId(), loginSessionId)));
    }
}
