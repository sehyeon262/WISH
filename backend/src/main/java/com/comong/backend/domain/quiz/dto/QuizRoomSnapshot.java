package com.comong.backend.domain.quiz.dto;

import java.util.List;

import com.comong.backend.domain.quiz.service.QuizRoom;
import com.comong.backend.domain.quiz.service.QuizRoomStatus;

/** Full room state used by REST responses and the STOMP ready snapshot. */
public record QuizRoomSnapshot(
        String roomId,
        String code,
        QuizRoomStatus status,
        long hostUserId,
        int minPlayers,
        int maxPlayers,
        List<QuizMemberDto> members,
        String stompRoomKey,
        int roundNumber,
        long currentDrawerUserId,
        Long roundEndsAtEpochMillis,
        int totalRounds) {

    public static QuizRoomSnapshot of(QuizRoom room) {
        long host = room.hostUserId();
        List<QuizMemberDto> members =
                room.members().stream()
                        .map(member -> QuizMemberDto.of(member, member.userId() == host))
                        .toList();
        return new QuizRoomSnapshot(
                room.roomId(),
                room.code(),
                room.status(),
                host,
                room.minPlayers(),
                room.maxPlayers(),
                members,
                room.stompRoomKey(),
                room.roundNumber(),
                room.currentDrawerUserId(),
                room.roundEndsAt() == null ? null : room.roundEndsAt().toEpochMilli(),
                room.totalRounds());
    }
}
