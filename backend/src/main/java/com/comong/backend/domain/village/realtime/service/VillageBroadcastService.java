package com.comong.backend.domain.village.realtime.service;

import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

import com.comong.backend.domain.village.realtime.dto.VillageEvent;
import com.comong.backend.domain.village.realtime.dto.VillageSnapshot;

import lombok.RequiredArgsConstructor;

/**
 * 마을 광장 / 테마 select 씬 토픽·큐 발행 어댑터 (S14P31E103-793). {@link SimpMessagingTemplate} 사용을 한 곳에 집중해서 토픽
 * 이름 규칙이 흩어지지 않게 한다.
 *
 * <p>토픽: {@code /topic/{roomId}} (예: {@code /topic/village.default}, {@code
 * /topic/gymnastics.select}).
 */
@Service
@RequiredArgsConstructor
public class VillageBroadcastService {

    /** 토픽 prefix. {@code roomId} 접미 결합으로 룸별 토픽을 구성한다. */
    private static final String ROOM_TOPIC_PREFIX = "/topic/";

    /** 사용자 destination prefix 는 {@code /user} 가 자동 부여되므로 큐 이름만. */
    public static final String SNAPSHOT_QUEUE = "/queue/village.snapshot";

    private final SimpMessagingTemplate messagingTemplate;

    public void broadcastJoin(String roomId, PlayerState member) {
        messagingTemplate.convertAndSend(topicFor(roomId), VillageEvent.join(member));
    }

    public void broadcastMove(String roomId, PlayerState member, boolean moving) {
        messagingTemplate.convertAndSend(topicFor(roomId), VillageEvent.move(member, moving));
    }

    public void broadcastLeave(String roomId, long userId) {
        messagingTemplate.convertAndSend(topicFor(roomId), VillageEvent.leave(userId));
    }

    public void broadcastEmote(String roomId, PlayerState member, String emoji) {
        messagingTemplate.convertAndSend(
                topicFor(roomId), VillageEvent.emote(member.userId(), emoji));
    }

    /**
     * 신규 입장자에게 현재 룸 스냅샷을 1회 전송.
     *
     * <p>{@code user} 는 {@link java.security.Principal#getName()} 값 — {@link
     * com.comong.backend.domain.village.realtime.handler.VillageStompPrincipal} 이 userId 문자열을 돌려준다.
     */
    public void sendSnapshot(String user, VillageSnapshot snapshot) {
        messagingTemplate.convertAndSendToUser(user, SNAPSHOT_QUEUE, snapshot);
    }

    private static String topicFor(String roomId) {
        return ROOM_TOPIC_PREFIX + roomId;
    }
}
