package com.comong.backend.domain.admin.controller;

import jakarta.validation.Valid;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.comong.backend.domain.admin.dto.GuardianNotificationRequest;
import com.comong.backend.domain.admin.dto.GuardianNotificationResponse;
import com.comong.backend.domain.admin.service.AdminNotificationService;
import com.comong.backend.global.common.response.ApiResponse;
import com.comong.backend.global.security.JwtTokenProvider.AuthenticatedUser;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;

@Tag(name = "Admin Notification", description = "운영자가 보호자에게 안내 메시지를 발송한다 (MVP: 로그 stub)")
@RestController
@RequestMapping("/admin/notifications")
@RequiredArgsConstructor
public class AdminNotificationController {

    private final AdminNotificationService adminNotificationService;

    @Operation(
            summary = "보호자 안내 메시지 발송",
            description =
                    "운영 콘솔에서 환자별 보호자에게 안내 메시지를 발송한다. MVP 단계에서는 실제 발송 채널은 연결하지 않고 서버 로그에 흘려 흐름만 검증한다.")
    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping("/guardian")
    public ResponseEntity<ApiResponse<GuardianNotificationResponse>> notifyGuardian(
            @AuthenticationPrincipal AuthenticatedUser currentUser,
            @Valid @RequestBody GuardianNotificationRequest request) {
        return ResponseEntity.ok(
                ApiResponse.success(
                        adminNotificationService.notifyGuardian(currentUser.userId(), request)));
    }
}
