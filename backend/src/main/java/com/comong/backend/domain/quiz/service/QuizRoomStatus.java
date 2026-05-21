package com.comong.backend.domain.quiz.service;

/**
 * 그림 퀴즈 방 상태 머신.
 *
 * <ul>
 *   <li>{@code WAITING}: 로비 단계, 신규 입장 가능. 방장이 시작하면 PLAYING 으로 전이.
 *   <li>{@code PLAYING}: 라운드 진행 중. 신규 입장 차단.
 *   <li>{@code FINISHED}: 모든 라운드 종료 후 결과 발표. 곧 폐기.
 * </ul>
 */
public enum QuizRoomStatus {
    WAITING,
    PLAYING,
    FINISHED
}
