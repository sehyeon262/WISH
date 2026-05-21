package com.comong.backend.domain.village.realtime.handler;

import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.MessagingException;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import com.comong.backend.domain.village.realtime.config.VillageRealtimeProperties;
import com.comong.backend.domain.village.realtime.exception.VillagePatientProfileMissingException;
import com.comong.backend.domain.village.realtime.exception.VillageRoomFullException;
import com.comong.backend.domain.village.realtime.service.VillagePresenceService;

import lombok.RequiredArgsConstructor;

/**
 * STOMP CONNECT 단계에서 마을 룸에 presence 를 등록한다.
 *
 * <p>S14P31E103-793: 클라가 {@code Room} 네이티브 헤더로 룸 ID 를 전달한다 (예: {@code village.default}, {@code
 * gymnastics.select}). 헤더가 없으면 {@code village.default} 로 fallback — 기존 단일-룸 클라이언트 호환.
 *
 * <p>S14P31E103-820: 같은 inbound 채널을 그림 퀴즈 멀티플레이가 공유하므로, Room 헤더가 마을 prefix 가 아닌 경우 (예: {@code
 * quiz.<roomId>}) 는 skip 한다. {@link VillageRealtimeProperties#enabled()} 토글도 여기로 이동 — 마을 비활성 상태여도
 * 다른 도메인(STOMP) 은 동작해야 한다.
 *
 * <p>{@link VillageStompAuthInterceptor} 가 먼저 실행되어 {@link VillageStompPrincipal} 을 주입한 상태를 전제로 한다 —
 * {@link
 * com.comong.backend.domain.village.realtime.config.VillageWebSocketConfig#configureClientInboundChannel}
 * 에서 등록 순서가 보장된다.
 *
 * <p>실패 시 {@link MessagingException} 으로 래핑해 STOMP ERROR 프레임이 클라에 전달된다.
 */
@Component
@RequiredArgsConstructor
public class VillagePresenceInterceptor implements ChannelInterceptor {

    private static final String ROOM_HEADER = "Room";

    /** 기존 단일-룸 클라이언트 / 테스트 호환용. 신규 클라는 명시 권장. */
    private static final String DEFAULT_ROOM_ID = "village.default";

    /**
     * 마을 관심사가 아닌 namespace prefix — CONNECT 가 와도 presence 등록을 skip 한다. 같은 inbound 채널을 공유하는 다른 도메인이
     * 늘어나면 여기 추가.
     */
    private static final String[] NON_VILLAGE_ROOM_PREFIXES = {"quiz."};

    private final VillagePresenceService presenceService;
    private final VillageRealtimeProperties properties;

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor =
                MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
        if (accessor == null || !StompCommand.CONNECT.equals(accessor.getCommand())) {
            return message;
        }

        String roomId = resolveRoomId(accessor);
        if (isNonVillageRoom(roomId)) {
            // 다른 도메인 (quiz 등) 의 CONNECT — 마을 관심사 아님, 통과시킨다.
            return message;
        }

        if (!properties.enabled()) {
            throw new MessagingException(message, "village realtime disabled");
        }

        if (!(accessor.getUser() instanceof VillageStompPrincipal principal)) {
            throw new MessagingException(message, "presence: authenticated principal missing");
        }
        String sessionId = accessor.getSessionId();
        if (sessionId == null) {
            throw new MessagingException(message, "presence: STOMP sessionId missing");
        }

        try {
            presenceService.join(sessionId, principal.userId(), roomId);
        } catch (VillageRoomFullException | VillagePatientProfileMissingException e) {
            throw new MessagingException(message, e.getMessage(), e);
        }
        return message;
    }

    private static String resolveRoomId(StompHeaderAccessor accessor) {
        String header = accessor.getFirstNativeHeader(ROOM_HEADER);
        return StringUtils.hasText(header) ? header : DEFAULT_ROOM_ID;
    }

    private static boolean isNonVillageRoom(String roomId) {
        for (String prefix : NON_VILLAGE_ROOM_PREFIXES) {
            if (roomId.startsWith(prefix)) {
                return true;
            }
        }
        return false;
    }
}
