package com.comong.backend.domain.quiz.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 그림 퀴즈 멀티플레이 설정 (S14P31E103-820). {@code app.realtime.quiz.*} 값을 바인딩한다.
 *
 * <ul>
 *   <li>{@code enabled}: 도메인 활성 토글. false 면 REST/STOMP CONNECT 모두 거부 — 시연 안정성 폴백.
 *   <li>{@code minPlayers}: 게임 시작 최소 인원 (기본 2).
 *   <li>{@code maxPlayers}: 방 정원 (기본 6). 입장 캡 + 시작 후 추가 입장 차단.
 *   <li>{@code roundDurationSeconds}: 라운드 제한 시간.
 *   <li>{@code emptyRoomGraceSeconds}: 마지막 1명까지 빠진 뒤 방 폐기까지 유예 — 일시 단절 복구용.
 * </ul>
 */
@ConfigurationProperties(prefix = "app.realtime.quiz")
public record QuizRealtimeProperties(
        boolean enabled,
        int minPlayers,
        int maxPlayers,
        int roundDurationSeconds,
        int emptyRoomGraceSeconds) {

    public QuizRealtimeProperties {
        if (minPlayers < 2) {
            throw new IllegalArgumentException("minPlayers must be >= 2");
        }
        if (maxPlayers < minPlayers) {
            throw new IllegalArgumentException("maxPlayers must be >= minPlayers");
        }
        if (roundDurationSeconds <= 0) {
            throw new IllegalArgumentException("roundDurationSeconds must be > 0");
        }
        if (emptyRoomGraceSeconds < 0) {
            throw new IllegalArgumentException("emptyRoomGraceSeconds must be >= 0");
        }
    }
}
