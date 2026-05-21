package com.comong.backend.domain.music.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.comong.backend.domain.music.dto.MusicChartRankingResponse;
import com.comong.backend.domain.music.service.MusicResultService;
import com.comong.backend.global.common.response.ApiResponse;
import com.comong.backend.global.security.JwtTokenProvider.AuthenticatedUser;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;

@Tag(name = "Music Chart", description = "음악 차트 부가 API (랭킹/통계)")
@RestController
@RequestMapping("/music/charts")
@RequiredArgsConstructor
public class MusicChartController {

    private final MusicResultService musicResultService;

    @Operation(
            summary = "곡별 랭킹 조회",
            description = "곡 chartId 의 환자별 최고기록 상위 N 명과 내 순위/최고기록을 함께 반환한다.")
    @ApiResponses({
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "200",
                description = "조회 성공"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "401",
                description = "인증 필요 (G-003)"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "404",
                description = "음악 차트 없음 (MU-001)")
    })
    @GetMapping("/{chartId}/ranking")
    public ResponseEntity<ApiResponse<MusicChartRankingResponse>> findChartRanking(
            @AuthenticationPrincipal AuthenticatedUser currentUser,
            @PathVariable String chartId,
            @RequestParam(name = "limit", defaultValue = "10") int limit) {
        return ResponseEntity.ok(
                ApiResponse.success(
                        musicResultService.findChartRanking(currentUser.userId(), chartId, limit)));
    }
}
