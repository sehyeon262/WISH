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

import com.comong.backend.global.security.JwtTokenProvider;

import io.jsonwebtoken.JwtException;
import lombok.RequiredArgsConstructor;

/**
 * STOMP CONNECT 프레임의 {@code Authorization: Bearer <JWT>} 헤더를 검증해 {@link VillageStompPrincipal} 을
 * 주입한다.
 *
 * <p>HTTP 핸드셰이크는 익명 허용 (SecurityConfig). 실제 인증은 여기 — CONNECT 프레임 단계에서 ChannelInterceptor 로 일원화한다.
 * 표준 Spring 패턴이며, query param 방식이 토큰을 액세스 로그에 남기는 문제를 피한다 (계획서 14절 결정).
 *
 * <p>S14P31E103-820: 그림 퀴즈 멀티플레이가 같은 inbound 채널을 공유하므로 이 인터셉터는 endpoint-neutral 한 JWT 검증만 담당. 마을
 * 활성화 토글({@code app.realtime.village.enabled})은 village 전용 관심사이므로 {@link
 * VillagePresenceInterceptor} 로 이동시켰다.
 */
@Component
@RequiredArgsConstructor
public class VillageStompAuthInterceptor implements ChannelInterceptor {

    private static final String AUTH_HEADER = "Authorization";
    private static final String BEARER_PREFIX = "Bearer ";

    private final JwtTokenProvider jwtTokenProvider;

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor =
                MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
        if (accessor == null || !StompCommand.CONNECT.equals(accessor.getCommand())) {
            return message;
        }

        String token = resolveBearerToken(accessor);
        if (token == null) {
            throw new MessagingException(message, "missing bearer token");
        }
        try {
            JwtTokenProvider.AuthenticatedUser user = jwtTokenProvider.parse(token);
            accessor.setUser(new VillageStompPrincipal(user.userId(), user.email(), user.role()));
            return message;
        } catch (JwtException | IllegalArgumentException e) {
            throw new MessagingException(message, "invalid jwt", e);
        }
    }

    private String resolveBearerToken(StompHeaderAccessor accessor) {
        String header = accessor.getFirstNativeHeader(AUTH_HEADER);
        if (StringUtils.hasText(header) && header.startsWith(BEARER_PREFIX)) {
            return header.substring(BEARER_PREFIX.length());
        }
        return null;
    }
}
