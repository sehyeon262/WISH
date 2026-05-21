package com.comong.backend.domain.dialogue.entity;

/**
 * 대화 세션 종료 사유. {@link DialogueStatus#IN_PROGRESS} 상태에서는 {@code null}, 종료/포기 시 부여된다.
 *
 * <ul>
 *   <li>{@link #COMPLETED} — 정상 흐름으로 max_steps 또는 종료 조건 도달
 *   <li>{@link #REST_TODAY} — 첫 화면의 "오늘은 쉬고 싶어요" 옵션 선택
 *   <li>{@link #TIMEOUT} — Claude 응답 timeout / schema 위반 누적으로 fallback 종료
 * </ul>
 */
public enum DialogueFinishReason {
    COMPLETED,
    REST_TODAY,
    TIMEOUT
}
