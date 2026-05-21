package com.comong.backend.domain.dialogue.catalog.model;

/**
 * 선택지의 정서 분류 (보호자 화면의 안정/피로/걱정 분포에 사용).
 *
 * <p>{@link ChoiceValence} 와는 다른 축 — valence 가 *건설성* 이라면 tone 은 *정서 카테고리*.
 *
 * <ul>
 *   <li>{@link #CALM} — 안정·평온·자기조절
 *   <li>{@link #TIRED} — 피로·휴식 필요·에너지 부족
 *   <li>{@link #WORRIED} — 걱정·두려움·디스트레스
 * </ul>
 */
public enum ChoiceTone {
    CALM,
    TIRED,
    WORRIED
}
