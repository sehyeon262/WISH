package com.comong.backend.domain.fuel.controller;

import java.net.URI;
import java.util.List;

import jakarta.validation.Valid;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.comong.backend.domain.fuel.dto.FuelConsumeRequest;
import com.comong.backend.domain.fuel.dto.FuelConsumeResponse;
import com.comong.backend.domain.fuel.dto.FuelEventResponse;
import com.comong.backend.domain.fuel.dto.FuelInboxEventResponse;
import com.comong.backend.domain.fuel.dto.FuelSendRequest;
import com.comong.backend.domain.fuel.dto.FuelStatusResponse;
import com.comong.backend.domain.fuel.service.FuelService;
import com.comong.backend.global.common.response.ApiResponse;
import com.comong.backend.global.security.JwtTokenProvider.AuthenticatedUser;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;

@Tag(name = "Fuel", description = "보호자 별빛 연료 전송 및 게임 수신함 API")
@RestController
@RequestMapping("/fuel")
@RequiredArgsConstructor
public class FuelController {

    private final FuelService fuelService;

    @Operation(summary = "별빛 연료 보내기", description = "보호자가 환자에게 별빛 연료와 응원 메시지를 보냅니다.")
    @ApiResponses({
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "201",
                description = "연료 저장 성공"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "400",
                description = "입력값 검증 실패 (G-001)"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "401",
                description = "인증 필요 (G-003)"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "404",
                description = "환자 프로필이 없거나 본인 소유가 아님 (P-001)"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "409",
                description = "연료 게이지가 이미 100%에 도달함 (FL-001)")
    })
    @PostMapping
    public ResponseEntity<ApiResponse<FuelEventResponse>> send(
            @AuthenticationPrincipal AuthenticatedUser currentUser,
            @Valid @RequestBody FuelSendRequest request) {
        FuelEventResponse response = fuelService.send(currentUser.userId(), request);
        return ResponseEntity.created(URI.create("/fuel/" + response.id()))
                .body(ApiResponse.success(response));
    }

    @Operation(summary = "연료 상태 조회", description = "환자별 누적 연료 게이지와 연료 전송 기록을 조회합니다.")
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
    @GetMapping("/status")
    public ResponseEntity<ApiResponse<FuelStatusResponse>> status(
            @AuthenticationPrincipal AuthenticatedUser currentUser) {
        return ResponseEntity.ok(ApiResponse.success(fuelService.status(currentUser.userId())));
    }

    @Operation(summary = "미확인 별빛 메시지 조회", description = "게임에서 아직 연출하지 않은 별빛 연료 메시지를 시간순으로 조회합니다.")
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
    @GetMapping("/inbox")
    public ResponseEntity<ApiResponse<List<FuelInboxEventResponse>>> inbox(
            @AuthenticationPrincipal AuthenticatedUser currentUser) {
        return ResponseEntity.ok(ApiResponse.success(fuelService.inbox(currentUser.userId())));
    }

    @Operation(summary = "별빛 메시지 확인 처리", description = "게임에서 연출이 끝난 별빛 연료 메시지를 확인 완료로 표시합니다.")
    @ApiResponses({
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "200",
                description = "확인 처리 성공"),
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
    @PostMapping("/consume")
    public ResponseEntity<ApiResponse<FuelConsumeResponse>> consume(
            @AuthenticationPrincipal AuthenticatedUser currentUser,
            @Valid @RequestBody FuelConsumeRequest request) {
        return ResponseEntity.ok(
                ApiResponse.success(fuelService.consume(currentUser.userId(), request)));
    }
}
