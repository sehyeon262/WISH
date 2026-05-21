package com.comong.backend.domain.music.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.comong.backend.domain.music.dto.YoutubeSearchResponse;
import com.comong.backend.domain.music.service.YoutubeSearchService;
import com.comong.backend.global.common.response.ApiResponse;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;

/**
 * 유튜브 검색 프록시 컨트롤러. API 키 노출/할당량 보호 목적으로 BE 경유 강제 (S14P31E103-781).
 *
 * <p>SecurityConfig 의 디폴트 정책 ({@code anyRequest().authenticated()}) 으로 인증 필수.
 */
@Tag(name = "Music YouTube", description = "유튜브 검색 프록시 API")
@RestController
@RequestMapping("/music/youtube")
@RequiredArgsConstructor
public class YoutubeSearchController {

    private final YoutubeSearchService youtubeSearchService;

    @Operation(
            summary = "유튜브 검색",
            description = "음악 카테고리 한정으로 유튜브 영상을 검색해 video id/제목/채널/썸네일/재생시간을 반환한다.")
    @ApiResponses({
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "200",
                description = "검색 성공"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "401",
                description = "인증 필요 (G-003)"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "502",
                description = "유튜브 호출 실패 (MU-006)"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "503",
                description = "유튜브 검색 비활성화 — API 키 미설정 (MU-005)")
    })
    @GetMapping("/search")
    public ResponseEntity<ApiResponse<YoutubeSearchResponse>> search(
            @RequestParam("q") String query,
            @RequestParam(name = "limit", required = false) Integer limit) {
        return ResponseEntity.ok(ApiResponse.success(youtubeSearchService.search(query, limit)));
    }
}
