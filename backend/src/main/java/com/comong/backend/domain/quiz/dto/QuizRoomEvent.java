package com.comong.backend.domain.quiz.dto;

import java.util.List;

import com.comong.backend.domain.quiz.service.QuizMember;
import com.comong.backend.domain.quiz.service.QuizRoomStatus;
import com.fasterxml.jackson.annotation.JsonInclude;

/** Events broadcast to {@code /topic/quiz/<roomId>}. */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record QuizRoomEvent(
        String type,
        Long userId,
        QuizMemberDto member,
        Long hostUserId,
        QuizRoomStatus status,
        Integer roundNumber,
        Long currentDrawerUserId,
        Integer wordLength,
        Long roundEndsAtEpochMillis,
        Integer totalRounds,
        QuizStrokeMessage stroke,
        String message,
        String nickname,
        Boolean correct,
        Long correctUserId,
        String word,
        List<QuizMemberDto> members) {

    public static QuizRoomEvent memberJoined(QuizMember member, boolean isHost) {
        return new QuizRoomEvent(
                "member_joined",
                null,
                QuizMemberDto.of(member, isHost),
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null);
    }

    public static QuizRoomEvent memberLeft(long userId) {
        return new QuizRoomEvent(
                "member_left",
                userId,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null);
    }

    public static QuizRoomEvent hostChanged(long hostUserId) {
        return new QuizRoomEvent(
                "host_changed",
                null,
                null,
                hostUserId,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null);
    }

    public static QuizRoomEvent statusChanged(QuizRoomStatus status) {
        return new QuizRoomEvent(
                "status_changed",
                null,
                null,
                null,
                status,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null);
    }

    public static QuizRoomEvent roomReset(
            long hostUserId, String message, List<QuizMemberDto> members) {
        return new QuizRoomEvent(
                "room_reset",
                null,
                null,
                hostUserId,
                QuizRoomStatus.WAITING,
                0,
                0L,
                null,
                null,
                null,
                null,
                message,
                null,
                null,
                null,
                null,
                members);
    }

    public static QuizRoomEvent roundStarted(
            int roundNumber,
            long currentDrawerUserId,
            int wordLength,
            long roundEndsAtEpochMillis,
            int totalRounds) {
        return new QuizRoomEvent(
                "round_started",
                null,
                null,
                null,
                QuizRoomStatus.PLAYING,
                roundNumber,
                currentDrawerUserId,
                wordLength,
                roundEndsAtEpochMillis,
                totalRounds,
                null,
                null,
                null,
                null,
                null,
                null,
                null);
    }

    public static QuizRoomEvent stroke(long userId, QuizStrokeMessage stroke) {
        return new QuizRoomEvent(
                "stroke", userId, null, null, null, null, null, null, null, null, stroke, null,
                null, null, null, null, null);
    }

    public static QuizRoomEvent guessSubmitted(
            long userId, String nickname, String message, boolean correct) {
        return new QuizRoomEvent(
                "guess_submitted",
                userId,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                message,
                nickname,
                correct,
                correct ? userId : null,
                null,
                null);
    }

    public static QuizRoomEvent roundEnded(
            int roundNumber, Long correctUserId, String word, List<QuizMemberDto> members) {
        return new QuizRoomEvent(
                "round_ended",
                null,
                null,
                null,
                QuizRoomStatus.PLAYING,
                roundNumber,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                correctUserId,
                word,
                members);
    }

    public static QuizRoomEvent gameFinished(List<QuizMemberDto> members) {
        return new QuizRoomEvent(
                "game_finished",
                null,
                null,
                null,
                QuizRoomStatus.FINISHED,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                members);
    }
}
