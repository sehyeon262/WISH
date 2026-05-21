package com.comong.backend.domain.realtime.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import io.swagger.v3.oas.annotations.media.Schema;

@JsonInclude(JsonInclude.Include.ALWAYS)
public record LiveKitTokenResponse(
        @Schema(description = "접속 세션 ID") long loginSessionId,
        @Schema(description = "환자 프로필 ID") long patientProfileId,
        @Schema(description = "LiveKit 룸 이름") String roomName,
        @Schema(description = "LiveKit 서버 URL") String livekitUrl,
        @Schema(description = "LiveKit 참가자 identity") String participantIdentity,
        @Schema(description = "LiveKit 참가자 표시 이름") String participantName,
        @Schema(description = "LiveKit 입장 토큰") String token,
        @Schema(description = "토큰 유효 시간 (초)") long expiresInSeconds,
        @Schema(description = "현재 콘텐츠 진행 여부") boolean contentActive,
        @Schema(description = "진행 중인 콘텐츠 타입. 진행 중인 콘텐츠가 없으면 null") String contentType) {}
