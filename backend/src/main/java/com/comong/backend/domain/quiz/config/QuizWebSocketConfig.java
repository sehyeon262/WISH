package com.comong.backend.domain.quiz.config;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

import com.comong.backend.domain.quiz.handler.QuizPresenceInterceptor;

import lombok.RequiredArgsConstructor;

/**
 * 그림 퀴즈 멀티플레이 WebSocket 설정 (S14P31E103-820).
 *
 * <p>같은 SimpleBroker / inbound 채널을 마을 광장({@link
 * com.comong.backend.domain.village.realtime.config.VillageWebSocketConfig}) 과 공유한다. 본 클래스는
 * {@code @EnableWebSocketMessageBroker} 를 다시 붙이지 않고 기존 브로커 설정에 endpoint 와 inbound interceptor 를 추가만
 * 한다 — Spring 은 다수 configurer 빈을 모두 호출한다.
 *
 * <p>endpoint: {@code /ws/quiz}. 마을 endpoint 와 분리해 URL 만으로도 도메인 식별 가능. STOMP 라우팅 자체는 destination /
 * Room 헤더 prefix ({@code quiz.}) 로 일원화.
 *
 * <p>{@link Order} 로 village 보다 늦게 호출되도록 명시한다 — village 의 JWT 인증 인터셉터가 먼저 {@code Principal} 을 주입해야
 * quiz presence 가 그걸 읽고 멤버십을 검증할 수 있다. 값이 클수록 늦게 호출되므로 quiz=100 (village=0).
 */
@Configuration
@EnableConfigurationProperties(QuizRealtimeProperties.class)
@Order(100)
@RequiredArgsConstructor
public class QuizWebSocketConfig implements WebSocketMessageBrokerConfigurer {

    private final QuizPresenceInterceptor presenceInterceptor;

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        // origin 허용: 실제 인증은 STOMP CONNECT 단계 JWT 검증이 책임진다 (village 와 동일 정책).
        registry.addEndpoint("/ws/quiz").setAllowedOriginPatterns("*");
    }

    @Override
    public void configureClientInboundChannel(ChannelRegistration registration) {
        // JWT 인증 인터셉터 (VillageStompAuthInterceptor) 는 이미 village config 에서 등록되어 모든 CONNECT 를 검증한다.
        // 여기서는 quiz 도메인 전용 presence 검증만 추가.
        registration.interceptors(presenceInterceptor);
    }
}
