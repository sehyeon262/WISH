package com.comong.backend.domain.notification.controller;

import jakarta.validation.Valid;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.comong.backend.domain.notification.dto.DeviceTokenDeactivateRequest;
import com.comong.backend.domain.notification.dto.DeviceTokenRegisterRequest;
import com.comong.backend.domain.notification.dto.DeviceTokenResponse;
import com.comong.backend.domain.notification.service.GuardianDeviceTokenService;
import com.comong.backend.global.common.response.ApiResponse;
import com.comong.backend.global.security.JwtTokenProvider.AuthenticatedUser;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;

@Tag(name = "Notification", description = "Guardian notification APIs")
@RestController
@RequestMapping("/notifications/device-tokens")
@RequiredArgsConstructor
public class GuardianDeviceTokenController {

    private final GuardianDeviceTokenService guardianDeviceTokenService;

    @Operation(
            summary = "Register guardian FCM device token",
            description =
                    "Registers or reactivates the authenticated guardian's FCM device token for background push notifications.")
    @ApiResponses({
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "200",
                description = "Token registered"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "401",
                description = "Authentication required (G-003)"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "404",
                description = "User or patient profile not found (U-001/P-001)")
    })
    @PostMapping
    public ResponseEntity<ApiResponse<DeviceTokenResponse>> register(
            @AuthenticationPrincipal AuthenticatedUser currentUser,
            @Valid @RequestBody DeviceTokenRegisterRequest request) {
        return ResponseEntity.ok(
                ApiResponse.success(
                        guardianDeviceTokenService.register(currentUser.userId(), request)));
    }

    @Operation(
            summary = "Deactivate guardian FCM device token",
            description =
                    "Deactivates the authenticated guardian's FCM device token. The operation is idempotent.")
    @ApiResponses({
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "204",
                description = "Token deactivated"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(
                responseCode = "401",
                description = "Authentication required (G-003)")
    })
    @DeleteMapping
    public ResponseEntity<Void> deactivate(
            @AuthenticationPrincipal AuthenticatedUser currentUser,
            @Valid @RequestBody DeviceTokenDeactivateRequest request) {
        guardianDeviceTokenService.deactivate(currentUser.userId(), request);
        return ResponseEntity.noContent().build();
    }
}
