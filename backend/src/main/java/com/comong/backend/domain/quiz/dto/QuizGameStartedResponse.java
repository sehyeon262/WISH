package com.comong.backend.domain.quiz.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * {@code POST /quiz/rooms/{roomId}/start} 응답 래퍼. 방장만 호출 가능하므로 호출자 = 출제자, prompt 는 항상 채워진다.
 *
 * <p>토픽({@code /topic/quiz/{roomId}}) 의 {@code round_started} 이벤트와 동일 타이밍에 broadcast 되지만, REST 응답에
 * prompt 를 함께 실어 race condition(WS 구독 타이밍 vs 즉시 화면 전이) 을 회피한다.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record QuizGameStartedResponse(QuizRoomSnapshot snapshot, PromptAssignment prompt) {}
