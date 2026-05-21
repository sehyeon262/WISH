package com.comong.backend.domain.gomoku.controller;

import java.net.URI;
import java.util.List;

import jakarta.validation.Valid;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.comong.backend.domain.gomoku.dto.GomokuChatMessageResponse;
import com.comong.backend.domain.gomoku.dto.GomokuChatMessageSendRequest;
import com.comong.backend.domain.gomoku.dto.GomokuMatchSummaryResponse;
import com.comong.backend.domain.gomoku.dto.GomokuMoveRequest;
import com.comong.backend.domain.gomoku.dto.GomokuRankingResponse;
import com.comong.backend.domain.gomoku.dto.GomokuRoomCreateRequest;
import com.comong.backend.domain.gomoku.dto.GomokuRoomJoinRequest;
import com.comong.backend.domain.gomoku.dto.GomokuRoomResponse;
import com.comong.backend.domain.gomoku.dto.GomokuStatsResponse;
import com.comong.backend.domain.gomoku.service.GomokuService;
import com.comong.backend.global.common.response.ApiResponse;
import com.comong.backend.global.security.JwtTokenProvider.AuthenticatedUser;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;

@Tag(name = "Gomoku", description = "Gomoku online room, match record, and ranking API")
@RestController
@RequestMapping("/gomoku")
@RequiredArgsConstructor
public class GomokuController {

    private final GomokuService gomokuService;

    @Operation(summary = "Create online Gomoku room")
    @PostMapping("/rooms")
    public ResponseEntity<ApiResponse<GomokuRoomResponse>> createRoom(
            @AuthenticationPrincipal AuthenticatedUser currentUser,
            @Valid @RequestBody GomokuRoomCreateRequest request) {
        GomokuRoomResponse response = gomokuService.createRoom(currentUser.userId(), request);
        URI location = URI.create("/gomoku/rooms/" + response.id());
        return ResponseEntity.created(location).body(ApiResponse.success(response));
    }

    @Operation(summary = "List waiting online Gomoku rooms")
    @GetMapping("/rooms/waiting")
    public ResponseEntity<ApiResponse<Page<GomokuRoomResponse>>> findWaitingRooms(
            @AuthenticationPrincipal AuthenticatedUser currentUser, Pageable pageable) {
        return ResponseEntity.ok(
                ApiResponse.success(
                        gomokuService.findWaitingRooms(
                                currentUser.userId(), withCreatedAtDesc(pageable))));
    }

    @Operation(summary = "List open online Gomoku rooms (waiting or playing)")
    @GetMapping("/rooms")
    public ResponseEntity<ApiResponse<Page<GomokuRoomResponse>>> findOpenRooms(
            @AuthenticationPrincipal AuthenticatedUser currentUser, Pageable pageable) {
        return ResponseEntity.ok(
                ApiResponse.success(
                        gomokuService.findOpenRooms(
                                currentUser.userId(), withCreatedAtDesc(pageable))));
    }

    @Operation(summary = "Join online Gomoku room")
    @PostMapping("/rooms/{roomId}/join")
    public ResponseEntity<ApiResponse<GomokuRoomResponse>> joinRoom(
            @AuthenticationPrincipal AuthenticatedUser currentUser,
            @PathVariable Long roomId,
            @Valid @RequestBody(required = false) GomokuRoomJoinRequest request) {
        return ResponseEntity.ok(
                ApiResponse.success(gomokuService.joinRoom(currentUser.userId(), roomId, request)));
    }

    @Operation(summary = "Start online Gomoku room")
    @PostMapping("/rooms/{roomId}/start")
    public ResponseEntity<ApiResponse<GomokuRoomResponse>> startRoom(
            @AuthenticationPrincipal AuthenticatedUser currentUser, @PathVariable Long roomId) {
        return ResponseEntity.ok(
                ApiResponse.success(gomokuService.startRoom(currentUser.userId(), roomId)));
    }

    @Operation(summary = "Swap online Gomoku room stones before start")
    @PostMapping("/rooms/{roomId}/swap-stones")
    public ResponseEntity<ApiResponse<GomokuRoomResponse>> swapStones(
            @AuthenticationPrincipal AuthenticatedUser currentUser, @PathVariable Long roomId) {
        return ResponseEntity.ok(
                ApiResponse.success(gomokuService.swapStones(currentUser.userId(), roomId)));
    }

    @Operation(summary = "Create swapped rematch for finished online Gomoku room")
    @PostMapping("/rooms/{roomId}/rematch")
    public ResponseEntity<ApiResponse<GomokuRoomResponse>> rematchRoom(
            @AuthenticationPrincipal AuthenticatedUser currentUser, @PathVariable Long roomId) {
        return ResponseEntity.ok(
                ApiResponse.success(gomokuService.rematchRoom(currentUser.userId(), roomId)));
    }

    @Operation(summary = "Get online Gomoku room state")
    @GetMapping("/rooms/{roomId}")
    public ResponseEntity<ApiResponse<GomokuRoomResponse>> findRoom(
            @AuthenticationPrincipal AuthenticatedUser currentUser, @PathVariable Long roomId) {
        return ResponseEntity.ok(
                ApiResponse.success(gomokuService.findRoom(currentUser.userId(), roomId)));
    }

    @Operation(summary = "Refresh online Gomoku room presence")
    @PostMapping("/rooms/{roomId}/heartbeat")
    public ResponseEntity<ApiResponse<GomokuRoomResponse>> heartbeat(
            @AuthenticationPrincipal AuthenticatedUser currentUser, @PathVariable Long roomId) {
        return ResponseEntity.ok(
                ApiResponse.success(gomokuService.heartbeat(currentUser.userId(), roomId)));
    }

    @Operation(summary = "Play online Gomoku move")
    @PostMapping("/rooms/{roomId}/moves")
    public ResponseEntity<ApiResponse<GomokuRoomResponse>> playMove(
            @AuthenticationPrincipal AuthenticatedUser currentUser,
            @PathVariable Long roomId,
            @Valid @RequestBody GomokuMoveRequest request) {
        return ResponseEntity.ok(
                ApiResponse.success(gomokuService.playMove(currentUser.userId(), roomId, request)));
    }

    @Operation(summary = "Resign online Gomoku match")
    @PostMapping("/rooms/{roomId}/resign")
    public ResponseEntity<ApiResponse<GomokuRoomResponse>> resign(
            @AuthenticationPrincipal AuthenticatedUser currentUser, @PathVariable Long roomId) {
        return ResponseEntity.ok(
                ApiResponse.success(gomokuService.resign(currentUser.userId(), roomId)));
    }

    @Operation(summary = "Leave online Gomoku room")
    @PostMapping("/rooms/{roomId}/leave")
    public ResponseEntity<ApiResponse<GomokuRoomResponse>> leave(
            @AuthenticationPrincipal AuthenticatedUser currentUser, @PathVariable Long roomId) {
        return ResponseEntity.ok(
                ApiResponse.success(gomokuService.leave(currentUser.userId(), roomId)));
    }

    @Operation(summary = "Send online Gomoku room chat message")
    @PostMapping("/rooms/{roomId}/messages")
    public ResponseEntity<ApiResponse<GomokuChatMessageResponse>> sendChatMessage(
            @AuthenticationPrincipal AuthenticatedUser currentUser,
            @PathVariable Long roomId,
            @Valid @RequestBody GomokuChatMessageSendRequest request) {
        return ResponseEntity.ok(
                ApiResponse.success(
                        gomokuService.sendChatMessage(currentUser.userId(), roomId, request)));
    }

    @Operation(summary = "List recent online Gomoku room chat messages")
    @GetMapping("/rooms/{roomId}/messages")
    public ResponseEntity<ApiResponse<List<GomokuChatMessageResponse>>> findRecentChatMessages(
            @AuthenticationPrincipal AuthenticatedUser currentUser, @PathVariable Long roomId) {
        return ResponseEntity.ok(
                ApiResponse.success(
                        gomokuService.findRecentChatMessages(currentUser.userId(), roomId)));
    }

    @Operation(summary = "List my Gomoku matches")
    @GetMapping("/matches/me")
    public ResponseEntity<ApiResponse<Page<GomokuMatchSummaryResponse>>> findMine(
            @AuthenticationPrincipal AuthenticatedUser currentUser, Pageable pageable) {
        return ResponseEntity.ok(
                ApiResponse.success(
                        gomokuService.findMine(currentUser.userId(), withPlayedAtDesc(pageable))));
    }

    @Operation(summary = "Get my online Gomoku stats")
    @GetMapping("/stats/me")
    public ResponseEntity<ApiResponse<GomokuStatsResponse>> findMyStats(
            @AuthenticationPrincipal AuthenticatedUser currentUser) {
        return ResponseEntity.ok(
                ApiResponse.success(gomokuService.findMyStats(currentUser.userId())));
    }

    @Operation(summary = "Get online Gomoku ranking")
    @GetMapping("/ranking")
    public ResponseEntity<ApiResponse<GomokuRankingResponse>> findRanking(
            @AuthenticationPrincipal AuthenticatedUser currentUser,
            @RequestParam(defaultValue = "50") int limit,
            @RequestParam(defaultValue = "5") int minGames) {
        return ResponseEntity.ok(
                ApiResponse.success(
                        gomokuService.findRanking(currentUser.userId(), limit, minGames)));
    }

    private Pageable withCreatedAtDesc(Pageable pageable) {
        return PageRequest.of(
                pageable.getPageNumber(),
                pageable.getPageSize(),
                Sort.by(Sort.Direction.DESC, "createdAt"));
    }

    private Pageable withPlayedAtDesc(Pageable pageable) {
        return PageRequest.of(
                pageable.getPageNumber(),
                pageable.getPageSize(),
                Sort.by(Sort.Direction.DESC, "finishedAt")
                        .and(Sort.by(Sort.Direction.DESC, "createdAt")));
    }
}
