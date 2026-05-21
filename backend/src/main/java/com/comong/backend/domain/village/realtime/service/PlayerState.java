package com.comong.backend.domain.village.realtime.service;

import java.time.Instant;

/**
 * 마을 광장에 입장한 한 명의 환자 아바타 상태.
 *
 * <p>{@code sessionId} 는 현재 이 멤버를 점유한 STOMP 세션. latest-wins 정책에 따라 같은 {@code userId} 로 새 세션이 들어오면 이
 * 필드만 새 세션 ID 로 교체되고, 위치/외형 등은 유지된다.
 *
 * <p>{@code lastSeen} 은 좀비 정리 기준. CONNECT 시점에 한 번 세팅하고, 이후 SEND 가 들어올 때마다 {@link #touched(Instant)}
 * 로 갱신한다 (실제 갱신은 S14P31E103-718 의 PositionPacket 처리에서).
 */
public record PlayerState(
        long userId,
        long patientProfileId,
        String nickname,
        String textureKey,
        double x,
        double y,
        String dir,
        String sessionId,
        Instant lastSeen) {

    /** latest-wins: 기존 위치/외형은 그대로 두고 세션 ID 와 lastSeen 만 새 세션 값으로 교체. */
    public PlayerState withSession(String newSessionId, Instant now) {
        return new PlayerState(
                userId, patientProfileId, nickname, textureKey, x, y, dir, newSessionId, now);
    }

    /** 위치/방향 갱신 + lastSeen 동시 갱신. 718 에서 사용 예정. */
    public PlayerState withPosition(
            double newX, double newY, String newDir, String newTextureKey, Instant now) {
        String nextTextureKey =
                newTextureKey == null || newTextureKey.isBlank() ? textureKey : newTextureKey;
        return new PlayerState(
                userId,
                patientProfileId,
                nickname,
                nextTextureKey,
                newX,
                newY,
                newDir,
                sessionId,
                now);
    }

    /** 위치 변화 없이 lastSeen 만 갱신 (heartbeat 등). */
    public PlayerState touched(Instant now) {
        return new PlayerState(
                userId, patientProfileId, nickname, textureKey, x, y, dir, sessionId, now);
    }
}
