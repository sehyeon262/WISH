package com.comong.backend.domain.quiz.dto;

import com.comong.backend.domain.quiz.service.QuizMember;

/** 방 멤버 표현 — REST 응답 및 토픽 이벤트의 공용 단위. */
public record QuizMemberDto(
        long userId, String nickname, int joinOrder, int score, boolean isHost) {

    public static QuizMemberDto of(QuizMember member, boolean isHost) {
        return new QuizMemberDto(
                member.userId(), member.nickname(), member.joinOrder(), member.score(), isHost);
    }
}
