package com.comong.backend.domain.realtime.dto;

import java.time.LocalDateTime;

import io.swagger.v3.oas.annotations.media.Schema;

public record RealtimeEventResponse(
        @Schema(description = "실시간 이벤트 타입") RealtimeEventType type,
        @Schema(description = "접속 세션 ID") Long loginSessionId,
        @Schema(description = "환자 프로필 ID") Long patientProfileId,
        @Schema(description = "환자 이름. GAME_STARTED 이벤트에만 포함") String patientName,
        @Schema(description = "콘텐츠 타입(music/gymnastics/taekwondo/art 등)") String contentType,
        @Schema(description = "대화 세션 ID. DIALOGUE_EMOTION_UPDATED 이벤트에 포함") Long dialogueSessionId,
        @Schema(description = "NPC 이름. DIALOGUE_EMOTION_UPDATED 이벤트에 포함") String npcName,
        @Schema(description = "대화 정서 분류(POSITIVE/NEUTRAL/NEGATIVE)") String overallValence,
        @Schema(description = "대화 정서 톤(CALM/TIRED/WORRIED)") String tone,
        @Schema(description = "대화 정서 강도(0~3)") Integer intensity,
        @Schema(description = "보호자에게 보여줄 짧은 안내 문구") String guardianMessage,
        @Schema(description = "이벤트 발생 시각") LocalDateTime occurredAt) {

    public static RealtimeEventResponse connected() {
        return basic(RealtimeEventType.CONNECTED, null, null, null, null);
    }

    public static RealtimeEventResponse gameStarted(
            Long loginSessionId, Long patientProfileId, String patientName) {
        return basic(
                RealtimeEventType.GAME_STARTED,
                loginSessionId,
                patientProfileId,
                patientName,
                null);
    }

    public static RealtimeEventResponse gameEnded(Long loginSessionId, Long patientProfileId) {
        return basic(RealtimeEventType.GAME_ENDED, loginSessionId, patientProfileId, null, null);
    }

    public static RealtimeEventResponse contentStarted(
            Long loginSessionId, Long patientProfileId, String contentType) {
        return of(RealtimeEventType.CONTENT_STARTED, loginSessionId, patientProfileId, contentType);
    }

    public static RealtimeEventResponse contentEnded(
            Long loginSessionId, Long patientProfileId, String contentType) {
        return of(RealtimeEventType.CONTENT_ENDED, loginSessionId, patientProfileId, contentType);
    }

    public static RealtimeEventResponse of(
            RealtimeEventType type,
            Long loginSessionId,
            Long patientProfileId,
            String contentType) {
        return basic(type, loginSessionId, patientProfileId, null, contentType);
    }

    public static RealtimeEventResponse dialogueEmotionUpdated(
            Long patientProfileId,
            Long dialogueSessionId,
            String npcName,
            String overallValence,
            String tone,
            Integer intensity,
            String guardianMessage) {
        return new RealtimeEventResponse(
                RealtimeEventType.DIALOGUE_EMOTION_UPDATED,
                null,
                patientProfileId,
                null,
                null,
                dialogueSessionId,
                npcName,
                overallValence,
                tone,
                intensity,
                guardianMessage,
                LocalDateTime.now());
    }

    private static RealtimeEventResponse basic(
            RealtimeEventType type,
            Long loginSessionId,
            Long patientProfileId,
            String patientName,
            String contentType) {
        return new RealtimeEventResponse(
                type,
                loginSessionId,
                patientProfileId,
                patientName,
                contentType,
                null,
                null,
                null,
                null,
                null,
                null,
                LocalDateTime.now());
    }
}
