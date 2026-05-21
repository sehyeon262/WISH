package com.comong.backend.domain.quiz.controller;

import java.util.List;

import jakarta.validation.Valid;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.comong.backend.domain.quiz.dto.JoinRoomRequest;
import com.comong.backend.domain.quiz.dto.QuizGameStartRequest;
import com.comong.backend.domain.quiz.dto.QuizGameStartedResponse;
import com.comong.backend.domain.quiz.dto.QuizRoomListItem;
import com.comong.backend.domain.quiz.dto.QuizRoomSnapshot;
import com.comong.backend.domain.quiz.service.QuizRoomService;
import com.comong.backend.global.common.response.ApiResponse;
import com.comong.backend.global.security.JwtTokenProvider.AuthenticatedUser;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;

/**
 * 그림 퀴즈 멀티플레이 방 REST 컨트롤러 (S14P31E103-820).
 *
 * <p>방 생성/입장/퇴장/조회. 게임 진행 (라운드/스트로크) 자체는 STOMP 로 처리하며, REST 는 방의 lifecycle 만 다룬다.
 */
@Tag(name = "Quiz", description = "그림 퀴즈 멀티플레이 방 API")
@RestController
@RequestMapping("/quiz/rooms")
@RequiredArgsConstructor
public class QuizRoomController {

    private final QuizRoomService quizRoomService;

    @Operation(
            summary = "방 생성",
            description = "새 방을 만들고 호출자를 호스트 + 첫 멤버로 등록합니다. 응답의 code 를 다른 환자에게 공유해 입장시킵니다.")
    @ApiResponses({
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "200",
                description = "생성 성공"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "409",
                description = "이미 다른 방에 입장 중 (Q-004) / 환자 프로필 없음 (Q-005)")
    })
    @PostMapping
    public ResponseEntity<ApiResponse<QuizRoomSnapshot>> create(
            @AuthenticationPrincipal AuthenticatedUser currentUser) {
        QuizRoomSnapshot snapshot = quizRoomService.createRoom(currentUser.userId());
        return ResponseEntity.ok(ApiResponse.success(snapshot));
    }

    @Operation(
            summary = "입장 가능한 방 목록",
            description =
                    "WAITING 상태이며 정원 미만인 방을 createdAt 내림차순으로 반환합니다. 코드는 노출하지 않고 roomId 만 내려 입장에 사용합니다.")
    @GetMapping("/waiting")
    public ResponseEntity<ApiResponse<List<QuizRoomListItem>>> findWaiting() {
        return ResponseEntity.ok(ApiResponse.success(quizRoomService.findWaitingRooms()));
    }

    @Operation(summary = "코드로 방 입장", description = "방장이 공유한 6자리 코드로 입장합니다.")
    @ApiResponses({
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "200",
                description = "입장 성공"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "404",
                description = "방을 찾을 수 없음 (Q-001)"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "409",
                description =
                        "정원 초과 (Q-002) / 진행 중인 방 (Q-003) / 이미 입장 중 (Q-004) / 환자 프로필 없음 (Q-005)")
    })
    @PostMapping("/join")
    public ResponseEntity<ApiResponse<QuizRoomSnapshot>> join(
            @AuthenticationPrincipal AuthenticatedUser currentUser,
            @Valid @RequestBody JoinRoomRequest request) {
        QuizRoomSnapshot snapshot =
                quizRoomService.joinByCode(currentUser.userId(), request.code());
        return ResponseEntity.ok(ApiResponse.success(snapshot));
    }

    @Operation(summary = "방 퇴장", description = "본인이 들어간 방에서 명시적으로 나갑니다. WS disconnect 와 동등.")
    @PostMapping("/leave")
    public ResponseEntity<ApiResponse<Void>> leave(
            @AuthenticationPrincipal AuthenticatedUser currentUser) {
        quizRoomService.leave(currentUser.userId());
        return ResponseEntity.ok(ApiResponse.success());
    }

    @Operation(
            summary = "방 스냅샷 조회",
            description = "재접속 / 새로고침 시 현재 상태를 가져옵니다. 비멤버도 호출 가능 — 멤버 검증은 WS CONNECT 단계에서.")
    @ApiResponses({
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "404",
                description = "방을 찾을 수 없음 (Q-001)")
    })
    @GetMapping("/{roomId}")
    public ResponseEntity<ApiResponse<QuizRoomSnapshot>> get(@PathVariable String roomId) {
        return ResponseEntity.ok(ApiResponse.success(quizRoomService.snapshot(roomId)));
    }

    @Operation(
            summary = "라운드 시작",
            description =
                    "방장이 호출하여 다음 라운드를 시작합니다. WAITING 이면 게임 시작, PLAYING 이면 다음 라운드. 토픽에 round_started 이벤트가, 출제자 user queue 에는 제시어가 push 됩니다.")
    @ApiResponses({
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "200",
                description = "시작 성공"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "403",
                description = "호출자가 방장이 아님 (Q-006)"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "404",
                description = "방을 찾을 수 없음 (Q-001)"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "409",
                description = "인원 부족 또는 종료된 방 (Q-008)")
    })
    @PostMapping("/{roomId}/start")
    public ResponseEntity<ApiResponse<QuizGameStartedResponse>> start(
            @AuthenticationPrincipal AuthenticatedUser currentUser,
            @PathVariable String roomId,
            @Valid @RequestBody(required = false) QuizGameStartRequest request) {
        QuizGameStartedResponse response =
                quizRoomService.startGame(
                        currentUser.userId(),
                        roomId,
                        request == null ? null : request.totalRounds());
        return ResponseEntity.ok(ApiResponse.success(response));
    }
}
