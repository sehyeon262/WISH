package com.comong.backend.domain.realtime.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.comong.backend.domain.realtime.dto.ActiveLiveSessionResponse;
import com.comong.backend.domain.realtime.service.RealtimeActiveSessionService;
import com.comong.backend.global.common.response.ApiResponse;
import com.comong.backend.global.security.JwtTokenProvider.AuthenticatedUser;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;

@Tag(name = "Realtime", description = "LiveKit 실시간 모니터링 API")
@RestController
@RequestMapping("/realtime")
@RequiredArgsConstructor
public class RealtimeActiveSessionController {

    private final RealtimeActiveSessionService realtimeActiveSessionService;

    @Operation(
            summary = "현재 활성 실시간 세션 조회",
            description = "보호자앱이 SSE 이벤트를 놓친 경우에도 현재 진행 중인 아이 게임 세션을 1회 조회합니다.")
    @ApiResponses({
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "200",
                description = "현재 활성 세션 조회 성공"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "401",
                description = "인증 실패 (G-003)")
    })
    @GetMapping("/active-login-session")
    public ResponseEntity<ApiResponse<ActiveLiveSessionResponse>> findActiveSession(
            @AuthenticationPrincipal AuthenticatedUser currentUser) {
        ActiveLiveSessionResponse response =
                realtimeActiveSessionService.findActiveSession(currentUser.userId()).orElse(null);
        return ResponseEntity.ok(ApiResponse.success(response));
    }
}
