package com.comong.backend.domain.dialogue.controller;

import jakarta.validation.Valid;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.comong.backend.domain.dialogue.dto.FinishSessionRequest;
import com.comong.backend.domain.dialogue.dto.FinishSessionResponse;
import com.comong.backend.domain.dialogue.dto.SessionDetailResponse;
import com.comong.backend.domain.dialogue.dto.StartSessionRequest;
import com.comong.backend.domain.dialogue.dto.StartSessionResponse;
import com.comong.backend.domain.dialogue.dto.SubmitTurnRequest;
import com.comong.backend.domain.dialogue.dto.SubmitTurnResponse;
import com.comong.backend.domain.dialogue.service.DialogueService;
import com.comong.backend.global.common.response.ApiResponse;
import com.comong.backend.global.security.JwtTokenProvider.AuthenticatedUser;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;

@Tag(name = "Dialogue", description = "NPC 와의 턴 기반 대화 (등대지기 영철 + 마을 주민 5인) API")
@RestController
@RequestMapping("/dialogue/sessions")
@RequiredArgsConstructor
public class DialogueController {

    private final DialogueService dialogueService;

    @Operation(
            summary = "대화 세션 시작",
            description =
                    "환자가 지정 NPC 와 대화 세션을 시작하고 첫 장면을 받는다."
                            + " 등대지기 영철(YEONGCHEOL) 만 BE 가 scene 을 생성하고 첫 화면에 'rest_today'"
                            + " secondaryAction 을 포함한다. 마을 주민 6인은 FE 가 정적 스크립트로 자체 진행하므로"
                            + " 응답의 {@code scene} 필드는 {@code null} 로 내려간다.")
    @ApiResponses({
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "201",
                description = "세션 생성"),
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
    public ResponseEntity<ApiResponse<StartSessionResponse>> create(
            @AuthenticationPrincipal AuthenticatedUser currentUser,
            @Valid @RequestBody StartSessionRequest request) {
        StartSessionResponse response =
                dialogueService.createSession(currentUser.userId(), request);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(response));
    }

    @Operation(
            summary = "Dialogue session detail",
            description = "Returns a dialogue session and turns owned by the current user.")
    @GetMapping("/{sessionId}")
    public ResponseEntity<ApiResponse<SessionDetailResponse>> detail(
            @AuthenticationPrincipal AuthenticatedUser currentUser,
            @Parameter(description = "Dialogue session ID", required = true) @PathVariable
                    Long sessionId) {
        return ResponseEntity.ok(
                ApiResponse.success(dialogueService.getSession(currentUser.userId(), sessionId)));
    }

    @Operation(
            summary = "대화 턴 제출",
            description =
                    "아이가 누른 선택지를 저장하고 다음 장면을 반환한다."
                            + " {@code shouldEndSession=true} 가 내려오면 FE 는 다음 호출을 finish 로 전환한다."
                            + " 후속 장면에선 secondaryAction 이 항상 null.")
    @ApiResponses({
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "200",
                description = "다음 장면 또는 종료 신호"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "400",
                description = "입력값 검증 실패 (G-001)"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "401",
                description = "인증 필요 (G-003)"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "404",
                description = "세션이 없거나 본인 환자 프로필 소유가 아님 (DL-001) — enumeration 방지"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "409",
                description = "이미 종료된 세션 (DL-003) 또는 동일 step 중복 (DL-004)")
    })
    @PostMapping("/{sessionId}/turns")
    public ResponseEntity<ApiResponse<SubmitTurnResponse>> submitTurn(
            @AuthenticationPrincipal AuthenticatedUser currentUser,
            @Parameter(description = "대화 세션 ID (본인 소유)", required = true) @PathVariable
                    Long sessionId,
            @Valid @RequestBody SubmitTurnRequest request) {
        return ResponseEntity.ok(
                ApiResponse.success(
                        dialogueService.submitTurn(currentUser.userId(), sessionId, request)));
    }

    @Operation(
            summary = "대화 세션 종료",
            description =
                    "세션을 종료하고 마무리 대사 (closingLines, 1~2 줄) 만 반환한다."
                            + " 마음엽서 / caregiverFacingNote / 분석 결과는 내려주지 않는다.")
    @ApiResponses({
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "200",
                description = "종료 완료, 마무리 대사 반환"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "400",
                description = "입력값 검증 실패 (G-001)"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "401",
                description = "인증 필요 (G-003)"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "404",
                description = "세션이 없거나 본인 환자 프로필 소유가 아님 (DL-001) — enumeration 방지"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "409",
                description = "이미 종료된 세션 (DL-003)")
    })
    @PostMapping("/{sessionId}/finish")
    public ResponseEntity<ApiResponse<FinishSessionResponse>> finish(
            @AuthenticationPrincipal AuthenticatedUser currentUser,
            @Parameter(description = "대화 세션 ID (본인 소유)", required = true) @PathVariable
                    Long sessionId,
            @Valid @RequestBody FinishSessionRequest request) {
        return ResponseEntity.ok(
                ApiResponse.success(
                        dialogueService.finishSession(currentUser.userId(), sessionId, request)));
    }
}
