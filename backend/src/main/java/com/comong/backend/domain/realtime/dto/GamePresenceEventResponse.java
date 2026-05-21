package com.comong.backend.domain.realtime.dto;

import java.time.Instant;

import io.swagger.v3.oas.annotations.media.Schema;

public record GamePresenceEventResponse(
        @Schema(description = "게임 presence 이벤트 타입") GamePresenceEventType type,
        @Schema(description = "접속 세션 ID") Long loginSessionId,
        @Schema(description = "현재 실시간 보기 보호자 수") int watcherCount,
        @Schema(description = "이벤트 발생 시각") Instant occurredAt) {

    public static GamePresenceEventResponse watcherCountChanged(
            Long loginSessionId, int watcherCount) {
        return new GamePresenceEventResponse(
                GamePresenceEventType.WATCHER_COUNT_CHANGED,
                loginSessionId,
                watcherCount,
                Instant.now());
    }
}
