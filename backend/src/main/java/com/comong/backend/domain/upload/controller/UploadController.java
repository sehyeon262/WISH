package com.comong.backend.domain.upload.controller;

import jakarta.validation.Valid;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.comong.backend.domain.upload.dto.PresignedUploadRequest;
import com.comong.backend.domain.upload.dto.PresignedUploadResponse;
import com.comong.backend.domain.upload.service.PresignedUploadService;
import com.comong.backend.global.common.response.ApiResponse;
import com.comong.backend.global.security.JwtTokenProvider.AuthenticatedUser;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;

@Tag(name = "Upload", description = "파일 업로드 API")
@RestController
@RequestMapping("/uploads")
@RequiredArgsConstructor
public class UploadController {

    private final PresignedUploadService presignedUploadService;

    @Operation(
            summary = "음악 결과 영상 presigned 업로드 URL 발급",
            description = "음악 결과 영상과 썸네일을 private S3 버킷에 직접 PUT 업로드할 수 있는 임시 URL을 발급합니다.")
    @ApiResponses({
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "200",
                description = "발급 성공"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "400",
                description = "유효하지 않은 이미지/영상 Content-Type (S-001, S-004)"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "401",
                description = "인증 필요 (G-003)"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "404",
                description = "환자 프로필 없음 (P-001)"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "500",
                description = "S3 presigned URL 발급 실패 (S-002)")
    })
    @PostMapping("/presigned")
    public ResponseEntity<ApiResponse<PresignedUploadResponse>> createPresignedUploadUrls(
            @AuthenticationPrincipal AuthenticatedUser currentUser,
            @Valid @RequestBody PresignedUploadRequest request) {
        return ResponseEntity.ok(
                ApiResponse.success(
                        presignedUploadService.createMusicResultUploadUrls(
                                currentUser.userId(), request)));
    }
}
