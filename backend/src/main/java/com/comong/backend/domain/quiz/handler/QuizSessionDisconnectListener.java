package com.comong.backend.domain.quiz.handler;

import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

import com.comong.backend.domain.quiz.service.QuizRoomService;

import lombok.RequiredArgsConstructor;

/**
 * 그림 퀴즈 WS 세션이 끊길 때 ({@link SessionDisconnectEvent}) 사용자를 방에서 자동 제거하고 토픽에 leave 이벤트를 broadcast 한다.
 *
 * <p>탭 닫기 / 새로고침 / 네트워크 끊김 모두 동일 이벤트로 도달한다. 마을 광장의 {@code VillageSessionDisconnectListener} 와 같은
 * 패턴. 매핑은 {@link com.comong.backend.domain.quiz.service.QuizRoomRegistry#bindSession} 가 CONNECT 시점에
 * 만들어 두므로 disconnect 시 sessionId 만으로 사용자 추적이 가능.
 *
 * <p>마을 disconnect 리스너와 함께 등록되어도 안전 — 각자 자기 도메인만 처리(quiz registry 에 매핑 없으면 no-op).
 */
@Component
@RequiredArgsConstructor
public class QuizSessionDisconnectListener {

    private final QuizRoomService quizRoomService;

    @EventListener
    public void onSessionDisconnect(SessionDisconnectEvent event) {
        String sessionId = event.getSessionId();
        if (sessionId == null) {
            return;
        }
        quizRoomService.leaveBySession(sessionId);
    }
}
