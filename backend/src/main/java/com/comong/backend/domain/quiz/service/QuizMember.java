package com.comong.backend.domain.quiz.service;

/**
 * 그림 퀴즈 방에 입장한 한 명의 환자.
 *
 * <p>{@code score} 는 게임 진행 단계에서 갱신되며, M1 (로비) 단계에서는 항상 0. {@code joinOrder} 는 입장 순서 — 출제자 turn 회전
 * 결정에 사용한다 (M2+).
 */
public record QuizMember(
        long userId, long patientProfileId, String nickname, int joinOrder, int score) {

    public QuizMember withScore(int newScore) {
        return new QuizMember(userId, patientProfileId, nickname, joinOrder, newScore);
    }
}
