package com.comong.backend.domain.village.realtime.scheduler;

import java.time.Instant;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import com.comong.backend.domain.village.realtime.service.VillageBroadcastService;
import com.comong.backend.domain.village.realtime.service.VillagePresenceService;

import lombok.RequiredArgsConstructor;

/**
 * 마을 광장 좀비 세션 정리. {@link
 * com.comong.backend.domain.village.realtime.handler.VillageSessionDisconnectListener} 가 정상 케이스를
 * 담당하고, 이 스케줄러는 disconnect 이벤트가 유실되거나 도달하지 않은 세션을 백업으로 청소한 뒤 다른 클라이언트들에게 leave 를 broadcast 한다.
 *
 * <p>고정 5초 주기 — {@code idle-disconnect-seconds} (기본 60s) 의 충분히 작은 분할.
 */
@Component
@RequiredArgsConstructor
public class VillageIdleCleanupScheduler {

    private final VillagePresenceService presenceService;
    private final VillageBroadcastService broadcastService;

    @Scheduled(fixedDelayString = "PT5S")
    public void evictIdle() {
        presenceService
                .evictIdle(Instant.now())
                .forEach(
                        outcome ->
                                broadcastService.broadcastLeave(
                                        outcome.roomId(), outcome.member().userId()));
    }
}
