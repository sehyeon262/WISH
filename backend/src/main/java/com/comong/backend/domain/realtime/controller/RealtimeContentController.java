package com.comong.backend.domain.realtime.controller;

import jakarta.validation.Valid;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.comong.backend.domain.realtime.dto.RealtimeContentStartRequest;
import com.comong.backend.domain.realtime.service.RealtimeContentService;
import com.comong.backend.global.common.response.ApiResponse;
import com.comong.backend.global.security.JwtTokenProvider.AuthenticatedUser;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;

@Tag(name = "Realtime", description = "LiveKit 실시간 모니터링 API")
@RestController
@RequestMapping("/realtime/login-sessions/{loginSessionId}/content")
@RequiredArgsConstructor
public class RealtimeContentController {

    private final RealtimeContentService realtimeContentService;

    @Operation(
            summary = "실시간 콘텐츠 시작",
            description = "게임앱이 콘텐츠 scene 에 진입했을 때 보호자앱에 콘텐츠 시작 이벤트를 발행합니다.")
    @ApiResponses({
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "200",
                description = "콘텐츠 시작 처리 성공"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "400",
                description = "실시간 콘텐츠 타입이 아님 (RT-004)"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "401",
                description = "인증 필요 (G-003)"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "404",
                description = "세션이 없거나 본인 환자 프로필 소유가 아님 (US-001)"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "409",
                description = "이미 종료된 접속 세션 (RT-002)")
    })
    @PostMapping("/start")
    public ResponseEntity<ApiResponse<Void>> start(
            @AuthenticationPrincipal AuthenticatedUser currentUser,
            @Parameter(description = "접속 세션 ID", required = true) @PathVariable Long loginSessionId,
            @Valid @RequestBody RealtimeContentStartRequest request) {
        realtimeContentService.start(currentUser.userId(), loginSessionId, request.contentType());
        return ResponseEntity.ok(ApiResponse.success());
    }

    @Operation(
            summary = "실시간 콘텐츠 종료",
            description = "게임앱이 콘텐츠 scene 에서 이탈했을 때 보호자앱에 콘텐츠 종료 이벤트를 발행합니다.")
    @ApiResponses({
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "200",
                description = "콘텐츠 종료 처리 성공"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "401",
                description = "인증 필요 (G-003)"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "404",
                description = "세션이 없거나 본인 환자 프로필 소유가 아님 (US-001)"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "409",
                description = "이미 종료된 접속 세션 (RT-002)")
    })
    @PostMapping("/end")
    public ResponseEntity<ApiResponse<Void>> end(
            @AuthenticationPrincipal AuthenticatedUser currentUser,
            @Parameter(description = "접속 세션 ID", required = true) @PathVariable
                    Long loginSessionId) {
        realtimeContentService.end(currentUser.userId(), loginSessionId);
        return ResponseEntity.ok(ApiResponse.success());
    }
}
