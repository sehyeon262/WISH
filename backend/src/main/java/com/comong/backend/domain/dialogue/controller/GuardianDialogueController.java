package com.comong.backend.domain.dialogue.controller;

import java.time.LocalDate;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.comong.backend.domain.dialogue.dto.GuardianSessionListItemResponse;
import com.comong.backend.domain.dialogue.dto.SessionDetailResponse;
import com.comong.backend.domain.dialogue.entity.NpcName;
import com.comong.backend.domain.dialogue.service.DialogueService;
import com.comong.backend.global.common.response.ApiResponse;
import com.comong.backend.global.security.JwtTokenProvider.AuthenticatedUser;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;

/**
 * 보호자 페이지 — 본인 환자의 NPC 대화 이력 조회.
 *
 * <p>아이 화면 (DialogueController) 과 별개 path 로 분리. 인가는 환자 owner 1단계 (보호자 user ↔ patient_profile) 로 끝.
 * 비소유/비존재 모두 404 통일 (enumeration 방지).
 */
@Tag(name = "Guardian Dialogue", description = "보호자 페이지에서 본인 환자의 NPC 대화 이력을 조회한다.")
@RestController
@RequestMapping("/guardian/patients/{patientProfileId}/dialogue/sessions")
@RequiredArgsConstructor
public class GuardianDialogueController {

    /** 페이지 사이즈 상한 — 사용자 입력 size 가 이를 넘어도 50 으로 clamp. */
    private static final int MAX_PAGE_SIZE = 50;

    private final DialogueService dialogueService;

    @Operation(
            summary = "대화 이력 목록 (NPC/기간 필터)",
            description =
                    "본인 환자의 대화 세션 메타 목록. {@code npc} / {@code from} / {@code to} 모두 옵션이며 비어 있으면 전체."
                            + " {@code from}/{@code to} 는 KST 날짜 (ISO YYYY-MM-DD). {@code to} 미지정 시 오늘까지 cap."
                            + " 정렬은 항상 {@code startedAt DESC}, 페이지 사이즈는 최대 50 으로 강제. 응답에는 turns 가 포함되지 않으며"
                            + " 카드 클릭 시 detail API 로 별도 조회한다.")
    @ApiResponses({
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "200",
                description = "조회 성공"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "400",
                description = "입력값 검증 실패 (G-001) — 예: from > to"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "401",
                description = "인증 필요 (G-003)"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "404",
                description = "환자 프로필이 없거나 본인 소유가 아님 (P-001) — enumeration 방지")
    })
    @GetMapping
    public ResponseEntity<ApiResponse<Page<GuardianSessionListItemResponse>>> list(
            @AuthenticationPrincipal AuthenticatedUser currentUser,
            @Parameter(description = "환자 프로필 ID (본인 소유)", required = true) @PathVariable
                    Long patientProfileId,
            @Parameter(description = "필터링할 NPC (옵션, 미지정 시 전체)") @RequestParam(required = false)
                    NpcName npc,
            @Parameter(description = "조회 시작 날짜 (KST, ISO YYYY-MM-DD, 옵션)")
                    @RequestParam(required = false)
                    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
                    LocalDate from,
            @Parameter(description = "조회 종료 날짜 (KST, ISO YYYY-MM-DD, 미지정 시 오늘까지)")
                    @RequestParam(required = false)
                    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
                    LocalDate to,
            Pageable pageable) {
        return ResponseEntity.ok(
                ApiResponse.success(
                        dialogueService.searchForGuardian(
                                currentUser.userId(),
                                patientProfileId,
                                npc,
                                from,
                                to,
                                withStartedAtDesc(pageable))));
    }

    @Operation(
            summary = "대화 세션 상세",
            description = "본인 환자의 단일 세션 메타 + 모든 turn 이벤트 (질문/선택/태그). 카드 클릭으로 채팅 버블 재구성에 사용.")
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
                        "환자 프로필이 없거나 본인 소유가 아님 (P-001), 또는 세션이 없거나 해당 환자 소유가 아님 (DL-001)."
                                + " 응답 body 의 code 필드로 구분. enumeration 방지를 위해 둘 다 404 통일.")
    })
    @GetMapping("/{sessionId}")
    public ResponseEntity<ApiResponse<SessionDetailResponse>> detail(
            @AuthenticationPrincipal AuthenticatedUser currentUser,
            @Parameter(description = "환자 프로필 ID (본인 소유)", required = true) @PathVariable
                    Long patientProfileId,
            @Parameter(description = "대화 세션 ID (해당 환자 소유)", required = true) @PathVariable
                    Long sessionId) {
        return ResponseEntity.ok(
                ApiResponse.success(
                        dialogueService.getSessionForGuardian(
                                currentUser.userId(), patientProfileId, sessionId)));
    }

    /**
     * 정렬 + 사이즈 강제 — {@code startedAt DESC} 고정, 사이즈 상한 {@link #MAX_PAGE_SIZE}.
     *
     * <p>인덱스 {@code (patient_profile_id, started_at DESC)} (V21) 를 활용하면서 임의 컬럼 정렬로 인한 풀스캔 / 정보 노출
     * 표면을 차단. 사이즈 상한은 한 요청이 과도한 row 를 끌어가지 못하게 한다 (artwork 컨트롤러와 동일 패턴).
     */
    private Pageable withStartedAtDesc(Pageable pageable) {
        int size = Math.min(pageable.getPageSize(), MAX_PAGE_SIZE);
        return PageRequest.of(
                pageable.getPageNumber(), size, Sort.by(Sort.Direction.DESC, "startedAt"));
    }
}
