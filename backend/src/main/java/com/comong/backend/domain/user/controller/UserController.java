package com.comong.backend.domain.user.controller;

import java.util.List;

import jakarta.validation.Valid;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.comong.backend.domain.user.dto.AdminUserResponse;
import com.comong.backend.domain.user.dto.ChangeUserRoleRequest;
import com.comong.backend.domain.user.dto.UserResponse;
import com.comong.backend.domain.user.service.UserService;
import com.comong.backend.global.common.response.ApiResponse;
import com.comong.backend.global.security.JwtTokenProvider.AuthenticatedUser;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;

@Tag(name = "User", description = "사용자 API")
@RestController
@RequestMapping("/users")
@RequiredArgsConstructor
public class UserController {

    private final UserService userService;

    @Operation(summary = "사용자 목록 조회", description = "ADMIN 권한으로 전체 사용자 목록을 최신 가입순으로 조회한다.")
    @ApiResponses({
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "200",
                description = "조회 성공"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "401",
                description = "인증 필요 (G-003)"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "403",
                description = "ADMIN 권한 부족 (G-004)")
    })
    @PreAuthorize("hasRole('ADMIN')")
    @GetMapping
    public ResponseEntity<ApiResponse<List<AdminUserResponse>>> listUsers() {
        return ResponseEntity.ok(ApiResponse.success(userService.findAllUsers()));
    }

    /**
     * 본인 정보 조회. 인증된 사용자가 자기 자신의 프로필을 읽는 유일한 엔드포인트.
     *
     * <p>ID 기반 조회(`/users/{id}`)는 제거됐다. 순차 PK 를 enumerate 하면 타인의 이메일까지 조회 가능해 PII 노출 위험이 있었기 때문. 공개
     * 프로필이 필요해지면 별도 DTO(email 제외) + 별도 엔드포인트로 분리한다.
     */
    @Operation(summary = "내 정보 조회", description = "현재 인증된 사용자의 정보를 조회한다.")
    @ApiResponses({
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "200",
                description = "조회 성공"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "401",
                description = "인증 필요 (G-003)"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "404",
                description = "토큰의 userId 가 DB 에 없음 (U-001) — 계정 삭제 후 토큰 재사용 시")
    })
    @GetMapping("/me")
    public ResponseEntity<ApiResponse<UserResponse>> getMe(
            @AuthenticationPrincipal AuthenticatedUser currentUser) {
        return ResponseEntity.ok(ApiResponse.success(userService.getUser(currentUser.userId())));
    }

    @Operation(
            summary = "사용자 권한 변경",
            description =
                    "ADMIN 권한으로 다른 사용자의 권한을 USER ↔ ADMIN 으로 변경한다. 본인 강등(U-004) / 마지막 ADMIN"
                            + " 강등(U-005) 은 거부된다.")
    @ApiResponses({
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "200",
                description = "변경 성공"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "400",
                description = "본인 권한 변경 (U-004) / 마지막 ADMIN 강등 (U-005)"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "401",
                description = "인증 필요 (G-003)"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "403",
                description = "ADMIN 권한 부족 (G-004)"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "404",
                description = "사용자 없음 (U-001)")
    })
    @PreAuthorize("hasRole('ADMIN')")
    @PatchMapping("/{userId}/role")
    public ResponseEntity<ApiResponse<UserResponse>> changeRole(
            @AuthenticationPrincipal AuthenticatedUser currentUser,
            @PathVariable Long userId,
            @Valid @RequestBody ChangeUserRoleRequest request) {
        return ResponseEntity.ok(
                ApiResponse.success(
                        userService.changeRole(currentUser.userId(), userId, request.role())));
    }
}
