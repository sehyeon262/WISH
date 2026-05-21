package com.comong.backend.domain.village.realtime.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 마을 광장 실시간 동기화 설정. application.yaml 의 {@code app.realtime.village.*} 값을 바인딩한다.
 *
 * <ul>
 *   <li>{@code enabled}: 마을 멀티플레이 활성 토글. false 면 STOMP CONNECT 자체를 거부 — 시연 안정성 폴백 (계획서 11절 백오프).
 *   <li>{@code tickRateHz}: 클라이언트 위치 발행 빈도 (Hz). 권장 5Hz = 200ms.
 *   <li>{@code roomCapacity}: 룸당 동시 접속 인원 캡. 초과 시 신규 핸드셰이크 거부.
 *   <li>{@code idleDisconnectSeconds}: 메시지 무음 임계. 좀비 세션 정리 기준.
 * </ul>
 *
 * <p>이 값들은 동적 변경 필요성이 낮아 환경변수로 외부화하지 않는다. 운영 활성화는 application-prod.yaml 에서 override.
 */
@ConfigurationProperties(prefix = "app.realtime.village")
public record VillageRealtimeProperties(
        boolean enabled, int tickRateHz, int roomCapacity, int idleDisconnectSeconds) {}
