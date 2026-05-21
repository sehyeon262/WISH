package com.comong.backend.domain.realtime.controller;

import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import com.comong.backend.domain.realtime.service.RealtimeEventService;
import com.comong.backend.global.security.JwtTokenProvider.AuthenticatedUser;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;

@Tag(name = "Realtime", description = "LiveKit 실시간 모니터링 API")
@RestController
@RequestMapping("/realtime")
@RequiredArgsConstructor
public class RealtimeEventController {

    private final RealtimeEventService realtimeEventService;

    @Operation(
            summary = "보호자 실시간 이벤트 구독",
            description = "보호자앱이 SSE 연결을 열어 아이의 게임/콘텐츠 상태 이벤트를 수신합니다.")
    @ApiResponses({
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "200",
                description = "SSE 연결 성공"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "401",
                description = "인증 필요 (G-003)")
    })
    @GetMapping(value = "/events", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter subscribe(@AuthenticationPrincipal AuthenticatedUser currentUser) {
        return realtimeEventService.subscribe(currentUser.userId());
    }
}
