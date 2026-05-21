package com.comong.backend.domain.usage.dto;

import java.time.LocalDateTime;

import com.comong.backend.domain.usage.entity.LoginSession;

import io.swagger.v3.oas.annotations.media.Schema;

public record LoginSessionResponse(
        @Schema(description = "세션 ID") Long id,
        @Schema(description = "환자 프로필 ID") Long patientProfileId,
        @Schema(description = "세션 시작 시각") LocalDateTime startedAt,
        @Schema(description = "마지막 heartbeat 시각") LocalDateTime lastHeartbeatAt,
        @Schema(description = "세션 종료 시각 (진행 중이면 null)") LocalDateTime endedAt,
        @Schema(description = "현재까지 누적된 세션 시간 (초)") int durationSeconds) {

    public static LoginSessionResponse from(LoginSession session) {
        return new LoginSessionResponse(
                session.getId(),
                session.getPatientProfile().getId(),
                session.getStartedAt(),
                session.getLastHeartbeatAt(),
                session.getEndedAt(),
                session.getDurationSeconds());
    }
}
