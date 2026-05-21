package com.comong.backend.domain.village.realtime.controller;

import java.security.Principal;
import java.time.Instant;

import jakarta.validation.Valid;

import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.Header;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.stereotype.Controller;

import com.comong.backend.domain.village.realtime.dto.EmotePacket;
import com.comong.backend.domain.village.realtime.dto.PositionPacket;
import com.comong.backend.domain.village.realtime.dto.VillageSnapshot;
import com.comong.backend.domain.village.realtime.handler.VillageStompPrincipal;
import com.comong.backend.domain.village.realtime.service.VillageBroadcastService;
import com.comong.backend.domain.village.realtime.service.VillageEmojis;
import com.comong.backend.domain.village.realtime.service.VillagePresenceService;

import lombok.RequiredArgsConstructor;

/**
 * 마을 광장 + 테마 select 씬 메시지 라우팅 (S14P31E103-793). 룸별로 분리된 destination:
 *
 * <ul>
 *   <li>{@code /app/{roomId}/ready} — 클라가 구독 완료 신호. 서버는 1) 호출자에게 룸 스냅샷 전송, 2) 호출자 입장을 룸 토픽에
 *       broadcast.
 *   <li>{@code /app/{roomId}/position} — 클라가 자기 위치를 5Hz 로 발행. 서버는 presence 갱신 후 룸 토픽에 move
 *       broadcast.
 *   <li>{@code /app/{roomId}/emote} — 이모티콘 발신.
 * </ul>
 *
 * <p>presence 등록 자체는 STOMP CONNECT 시점에 {@code VillagePresenceInterceptor} 가 처리 (Room 헤더 사용).
 */
@Controller
@RequiredArgsConstructor
public class VillageRelayController {

    private final VillagePresenceService presenceService;
    private final VillageBroadcastService broadcastService;

    @MessageMapping("/{roomId}/ready")
    public void onReady(@DestinationVariable String roomId, Principal principal) {
        if (!(principal instanceof VillageStompPrincipal vsp)) {
            return;
        }
        presenceService
                .findByUserId(roomId, vsp.userId())
                .ifPresent(
                        member -> {
                            broadcastService.sendSnapshot(
                                    principal.getName(),
                                    VillageSnapshot.of(presenceService.members(roomId)));
                            broadcastService.broadcastJoin(roomId, member);
                        });
    }

    @MessageMapping("/{roomId}/position")
    public void onPosition(
            @DestinationVariable String roomId,
            @Valid @Payload PositionPacket packet,
            @Header(SimpMessageHeaderAccessor.SESSION_ID_HEADER) String simpSessionId,
            Principal principal) {
        if (!(principal instanceof VillageStompPrincipal vsp)) {
            return;
        }
        // latest-wins 로 evict 된 옛 세션이 보낸 패킷은 service 가 sessionId 불일치로 drop.
        presenceService
                .updatePosition(
                        roomId,
                        vsp.userId(),
                        simpSessionId,
                        packet.x(),
                        packet.y(),
                        packet.dir(),
                        packet.textureKey())
                .ifPresent(
                        member -> broadcastService.broadcastMove(roomId, member, packet.moving()));
    }

    /**
     * 이모티콘 발신. 화이트리스트 + 서버측 throttle (2s) + sessionId 일치 시 토픽에 emote 이벤트 broadcast. 거부 시 조용히 drop —
     * 클라에 ERROR 프레임 안 보냄 (도배 / 위조 / ghost 세션 시도가 사용자 응답으로 가지 않도록).
     */
    @MessageMapping("/{roomId}/emote")
    public void onEmote(
            @DestinationVariable String roomId,
            @Valid @Payload EmotePacket packet,
            @Header(SimpMessageHeaderAccessor.SESSION_ID_HEADER) String simpSessionId,
            Principal principal) {
        if (!(principal instanceof VillageStompPrincipal vsp)) {
            return;
        }
        if (!VillageEmojis.isAllowed(packet.emoji())) {
            return;
        }
        presenceService
                .registerEmote(roomId, vsp.userId(), simpSessionId, Instant.now())
                .ifPresent(
                        member -> broadcastService.broadcastEmote(roomId, member, packet.emoji()));
    }
}
