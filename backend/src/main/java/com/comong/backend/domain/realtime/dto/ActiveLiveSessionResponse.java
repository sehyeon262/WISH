package com.comong.backend.domain.realtime.dto;

import com.comong.backend.domain.realtime.service.RealtimeContentStateService.ContentState;
import com.comong.backend.domain.usage.entity.LoginSession;

import io.swagger.v3.oas.annotations.media.Schema;

public record ActiveLiveSessionResponse(
        @Schema(description = "접속 세션 ID") Long loginSessionId,
        @Schema(description = "환자 프로필 ID") Long patientProfileId,
        @Schema(description = "환자 이름") String patientName,
        @Schema(description = "현재 콘텐츠 진행 여부") boolean contentActive,
        @Schema(description = "현재 콘텐츠 타입") String contentType) {

    public static ActiveLiveSessionResponse from(LoginSession session, ContentState contentState) {
        return new ActiveLiveSessionResponse(
                session.getId(),
                session.getPatientProfile().getId(),
                session.getPatientProfile().getName(),
                contentState.active(),
                contentState.contentTypeName());
    }
}
