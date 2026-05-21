package com.comong.backend.domain.village.realtime.handler;

import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

import com.comong.backend.domain.village.realtime.service.VillageBroadcastService;
import com.comong.backend.domain.village.realtime.service.VillagePresenceService;

import lombok.RequiredArgsConstructor;

/**
 * WebSocket 세션이 끊길 때 ({@link SessionDisconnectEvent}) 마을 광장 presence 에서 해당 세션을 제거하고, 룸 토픽으로 leave
 * 이벤트를 broadcast 한다.
 *
 * <p>정상 disconnect (탭 닫기, 명시적 logout) 와 비정상 disconnect (네트워크 끊김) 모두 동일 이벤트로 도달한다. latest-wins 로
 * evict 된 옛 세션의 disconnect 는 presence 상에 더 이상 매핑이 없어 broadcast 도 일어나지 않는다 (race 안전). 이벤트가 유실되는 극단
 * 경우엔 {@link com.comong.backend.domain.village.realtime.scheduler.VillageIdleCleanupScheduler} 의
 * idle TTL 정리가 백업.
 */
@Component
@RequiredArgsConstructor
public class VillageSessionDisconnectListener {

    private final VillagePresenceService presenceService;
    private final VillageBroadcastService broadcastService;

    @EventListener
    public void onSessionDisconnect(SessionDisconnectEvent event) {
        String sessionId = event.getSessionId();
        if (sessionId == null) {
            return;
        }
        presenceService
                .leaveBySession(sessionId)
                .ifPresent(
                        outcome ->
                                broadcastService.broadcastLeave(
                                        outcome.roomId(), outcome.member().userId()));
    }
}
