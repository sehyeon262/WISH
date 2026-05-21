package com.comong.backend.domain.dialogue.entity;

/**
 * 대화 턴의 질문/선택지가 어디서 왔는지. 보고서 집계 시 LLM 생성분과 정적 스크립트분을 구분하는 데 사용한다.
 *
 * <ul>
 *   <li>{@link #CLAUDE} — 등대지기 NPC 의 Claude (GMS) 응답
 *   <li>{@link #FALLBACK} — Claude 실패/timeout/schema 위반 시 서버 fallback scene
 *   <li>{@link #NPC_SCRIPT} — 마을 주민 5인의 정적 스크립트
 * </ul>
 */
public enum DialogueTurnGeneratedBy {
    CLAUDE,
    FALLBACK,
    NPC_SCRIPT
}
