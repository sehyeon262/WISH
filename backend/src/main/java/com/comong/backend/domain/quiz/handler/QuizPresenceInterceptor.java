package com.comong.backend.domain.quiz.handler;

import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.MessagingException;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import com.comong.backend.domain.quiz.config.QuizRealtimeProperties;
import com.comong.backend.domain.quiz.service.QuizRoomRegistry;
import com.comong.backend.domain.village.realtime.handler.VillageStompPrincipal;

import lombok.RequiredArgsConstructor;

/**
 * 그림 퀴즈 STOMP CONNECT 인터셉터 (S14P31E103-820).
 *
 * <p>역할:
 *
 * <ol>
 *   <li>Room 헤더가 {@code quiz.<roomId>} 형식인 CONNECT 만 처리, 그 외는 통과.
 *   <li>{@link QuizRealtimeProperties#enabled()} 가 false 면 CONNECT 거부 — 시연 폴백.
 *   <li>인증된 사용자가 해당 방의 멤버인지 검증. 멤버가 아니면 ERROR.
 * </ol>
 *
 * <p>실제 방 입장 자체는 REST {@code POST /quiz/rooms/...} 가 책임진다. WS CONNECT 는 이미 방에 들어온 멤버가 실시간 채널을 열기 위한
 * 단계일 뿐이며, 멤버십을 새로 생성하지 않는다.
 *
 * <p>Principal 은 {@link VillageStompPrincipal} 를 재사용한다 — 의미적으로 JWT 인증 결과를 담는 공용 컨테이너이고, 별도 타입을 만들면
 * auth 인터셉터까지 중복이 된다.
 */
@Component
@RequiredArgsConstructor
public class QuizPresenceInterceptor implements ChannelInterceptor {

    private static final String ROOM_HEADER = "Room";

    private static final String QUIZ_ROOM_PREFIX = "quiz.";

    private final QuizRealtimeProperties properties;
    private final QuizRoomRegistry roomRegistry;

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor =
                MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
        if (accessor == null || !StompCommand.CONNECT.equals(accessor.getCommand())) {
            return message;
        }

        String roomHeader = accessor.getFirstNativeHeader(ROOM_HEADER);
        if (!StringUtils.hasText(roomHeader) || !roomHeader.startsWith(QUIZ_ROOM_PREFIX)) {
            return message;
        }

        if (!properties.enabled()) {
            throw new MessagingException(message, "quiz realtime disabled");
        }

        String roomId = roomHeader.substring(QUIZ_ROOM_PREFIX.length());
        if (!(accessor.getUser() instanceof VillageStompPrincipal principal)) {
            throw new MessagingException(message, "quiz presence: authenticated principal missing");
        }

        boolean isMember =
                roomRegistry
                        .findById(roomId)
                        .map(room -> room.hasMember(principal.userId()))
                        .orElse(false);
        if (!isMember) {
            throw new MessagingException(message, "quiz presence: not a member of room " + roomId);
        }

        // 세션 ↔ userId 매핑 등록 — disconnect 시 자동 leave 를 위함.
        String sessionId = accessor.getSessionId();
        if (sessionId != null) {
            roomRegistry.bindSession(sessionId, principal.userId());
        }
        return message;
    }
}
