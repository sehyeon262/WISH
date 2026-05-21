package com.comong.backend.domain.quiz.service;

import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

import com.comong.backend.domain.quiz.dto.PromptAssignment;
import com.comong.backend.domain.quiz.dto.QuizRoomEvent;
import com.comong.backend.domain.quiz.dto.QuizRoomSnapshot;

import lombok.RequiredArgsConstructor;

/**
 * 그림 퀴즈 방 토픽 broadcast helper.
 *
 * <ul>
 *   <li>{@code /topic/quiz/<roomId>} — 방 전체 이벤트 (입장/퇴장/호스트 변경/라운드 시작)
 *   <li>{@code /user/<userId>/queue/quiz/<roomId>/snapshot} — 특정 멤버에게 초기 스냅샷
 *   <li>{@code /user/<userId>/queue/quiz/<roomId>/prompt} — 출제자에게만 제시어 단건 push
 * </ul>
 */
@Service
@RequiredArgsConstructor
public class QuizBroadcastService {

    private static final String TOPIC_PREFIX = "/topic/quiz/";
    private static final String USER_QUEUE_PREFIX = "/queue/quiz/";
    private static final String SNAPSHOT_SUFFIX = "/snapshot";
    private static final String PROMPT_SUFFIX = "/prompt";

    private final SimpMessagingTemplate messagingTemplate;

    /** 방 전체에 이벤트 broadcast. */
    public void broadcastEvent(String roomId, QuizRoomEvent event) {
        messagingTemplate.convertAndSend(TOPIC_PREFIX + roomId, event);
    }

    /** 특정 사용자에게만 스냅샷 전송 (Spring 의 user destination 라우팅). userId 는 STOMP Principal#getName 의 값. */
    public void sendSnapshotToUser(
            String userPrincipalName, String roomId, QuizRoomSnapshot snapshot) {
        messagingTemplate.convertAndSendToUser(
                userPrincipalName, USER_QUEUE_PREFIX + roomId + SNAPSHOT_SUFFIX, snapshot);
    }

    /** 출제자에게만 제시어 단건 push. 정답자는 토픽의 round_started 이벤트만 받음. */
    public void sendPromptToUser(String userPrincipalName, String roomId, PromptAssignment prompt) {
        messagingTemplate.convertAndSendToUser(
                userPrincipalName, USER_QUEUE_PREFIX + roomId + PROMPT_SUFFIX, prompt);
    }
}
