package com.comong.backend.domain.quiz.controller;

import java.security.Principal;

import jakarta.validation.Valid;

import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.stereotype.Controller;

import com.comong.backend.domain.quiz.dto.PromptAssignment;
import com.comong.backend.domain.quiz.dto.QuizGuessMessage;
import com.comong.backend.domain.quiz.dto.QuizRoomSnapshot;
import com.comong.backend.domain.quiz.dto.QuizStrokeMessage;
import com.comong.backend.domain.quiz.service.QuizBroadcastService;
import com.comong.backend.domain.quiz.service.QuizRoomRegistry;
import com.comong.backend.domain.quiz.service.QuizRoomService;
import com.comong.backend.domain.village.realtime.handler.VillageStompPrincipal;

import lombok.RequiredArgsConstructor;

/**
 * 그림 퀴즈 STOMP 메시지 라우팅 (S14P31E103-820).
 *
 * <p>현재 라우팅:
 *
 * <ul>
 *   <li>{@code /app/quiz/{roomId}/ready} — 클라가 토픽 구독 완료 후 호출. 서버는 호출자에게 룸 스냅샷을 user queue 로 push.
 * </ul>
 *
 * <p>입장/퇴장은 REST 가 책임지고 (인증된 사용자 매핑이 쉬움), 게임 진행 (스트로크/정답) 은 M2+ 에서 추가.
 *
 * <p>presence 검증은 {@link com.comong.backend.domain.quiz.handler.QuizPresenceInterceptor} 가 CONNECT
 * 단계에서 처리하므로 여기서는 신뢰.
 */
@Controller
@RequiredArgsConstructor
public class QuizMessageController {

    private final QuizRoomRegistry roomRegistry;
    private final QuizBroadcastService broadcastService;
    private final QuizRoomService quizRoomService;

    @MessageMapping("/quiz/{roomId}/ready")
    public void onReady(@DestinationVariable String roomId, Principal principal) {
        if (!(principal instanceof VillageStompPrincipal vsp)) {
            return;
        }
        roomRegistry
                .findById(roomId)
                .filter(room -> room.hasMember(vsp.userId()))
                .ifPresent(
                        room -> {
                            broadcastService.sendSnapshotToUser(
                                    principal.getName(), roomId, QuizRoomSnapshot.of(room));
                            if (room.currentDrawerUserId() == vsp.userId()
                                    && room.currentPrompt() != null) {
                                broadcastService.sendPromptToUser(
                                        principal.getName(),
                                        roomId,
                                        new PromptAssignment(
                                                room.roundNumber(), room.currentPrompt().word()));
                            }
                        });
    }

    @MessageMapping("/quiz/{roomId}/stroke")
    public void onStroke(
            @DestinationVariable String roomId,
            @Valid @Payload QuizStrokeMessage stroke,
            Principal principal) {
        if (!(principal instanceof VillageStompPrincipal vsp)) {
            return;
        }
        quizRoomService.relayStroke(vsp.userId(), roomId, stroke);
    }

    @MessageMapping("/quiz/{roomId}/guess")
    public void onGuess(
            @DestinationVariable String roomId,
            @Valid @Payload QuizGuessMessage guess,
            Principal principal) {
        if (!(principal instanceof VillageStompPrincipal vsp)) {
            return;
        }
        quizRoomService.submitGuess(vsp.userId(), roomId, guess.text());
    }
}
