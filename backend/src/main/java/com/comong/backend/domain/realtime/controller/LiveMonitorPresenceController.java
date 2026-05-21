package com.comong.backend.domain.realtime.controller;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import com.comong.backend.domain.realtime.service.LiveMonitorPresenceService;
import com.comong.backend.global.common.response.ApiResponse;
import com.comong.backend.global.exception.BusinessException;
import com.comong.backend.global.exception.ErrorCode;
import com.comong.backend.global.security.JwtTokenProvider.AuthenticatedUser;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;

@Tag(name = "Realtime", description = "LiveKit 실시간 모니터링 API")
@RestController
@RequestMapping("/realtime/login-sessions/{loginSessionId}")
@RequiredArgsConstructor
public class LiveMonitorPresenceController {

    private final LiveMonitorPresenceService liveMonitorPresenceService;

    @Operation(
            summary = "보호자 실시간 보기 presence 연결",
            description = "보호자가 실시간 보기 화면을 실제로 보고 있는 동안 유지하는 SSE 연결입니다.")
    @GetMapping(
            value = "/watching",
            produces = {MediaType.TEXT_EVENT_STREAM_VALUE, MediaType.APPLICATION_JSON_VALUE})
    public ResponseEntity<?> watch(
            @AuthenticationPrincipal AuthenticatedUser currentUser,
            @Parameter(description = "접속 세션 ID", required = true) @PathVariable
                    Long loginSessionId) {
        try {
            return sse(
                    liveMonitorPresenceService.subscribeWatching(
                            currentUser.userId(), loginSessionId));
        } catch (BusinessException e) {
            return businessError(e);
        }
    }

    @Operation(
            summary = "게임앱 실시간 보기 presence 이벤트 구독",
            description = "게임앱이 현재 실시간 보기 보호자 수를 수신하는 SSE 연결입니다.")
    @GetMapping(
            value = "/game-presence",
            produces = {MediaType.TEXT_EVENT_STREAM_VALUE, MediaType.APPLICATION_JSON_VALUE})
    public ResponseEntity<?> gamePresence(
            @AuthenticationPrincipal AuthenticatedUser currentUser,
            @Parameter(description = "접속 세션 ID", required = true) @PathVariable
                    Long loginSessionId) {
        try {
            return sse(
                    liveMonitorPresenceService.subscribeGamePresence(
                            currentUser.userId(), loginSessionId));
        } catch (BusinessException e) {
            return businessError(e);
        }
    }

    private ResponseEntity<SseEmitter> sse(SseEmitter emitter) {
        return ResponseEntity.ok().contentType(MediaType.TEXT_EVENT_STREAM).body(emitter);
    }

    private ResponseEntity<ApiResponse<Void>> businessError(BusinessException e) {
        ErrorCode errorCode = e.getErrorCode();
        return ResponseEntity.status(errorCode.getStatus())
                .contentType(MediaType.APPLICATION_JSON)
                .body(ApiResponse.error(errorCode));
    }
}
