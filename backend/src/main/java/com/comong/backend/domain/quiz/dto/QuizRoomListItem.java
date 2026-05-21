package com.comong.backend.domain.quiz.dto;

import com.comong.backend.domain.quiz.service.QuizMember;
import com.comong.backend.domain.quiz.service.QuizRoom;

/** 방 목록(로비) UI 카드 한 줄에 필요한 최소 정보. 코드 자체는 노출하지 않고 roomId 만 내려 입장 시 사용한다. */
public record QuizRoomListItem(
        String roomId, String hostNickname, int memberCount, int maxPlayers) {

    public static QuizRoomListItem of(QuizRoom room) {
        String hostNickname =
                room.findMember(room.hostUserId()).map(QuizMember::nickname).orElse("");
        return new QuizRoomListItem(
                room.roomId(), hostNickname, room.memberCount(), room.maxPlayers());
    }
}
