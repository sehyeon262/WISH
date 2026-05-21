package com.comong.backend.domain.dialogue.catalog.model;

/**
 * 응답 톤 분류 (보호자 화면의 "응답 톤 비율" 위젯용).
 *
 * <p>임상 진단이 아닌 *응답 분류* 결과. 다음 룰을 따른다:
 *
 * <ul>
 *   <li>{@link #POSITIVE} — 건설적 대처: 도움 요청, 그림, 음악, 인사, 자기조절, 자원 호출
 *   <li>{@link #NEUTRAL} — 경계·휴식·불확실: "괜찮아요", "쉬고 싶어요", "모르겠어요", "나중에"
 *   <li>{@link #NEGATIVE} — 분명한 디스트레스 표현: "무서워요", "아파요", "답답해요", "화나요"
 * </ul>
 *
 * <p>핵심: 휴식·경계 설정은 {@link #NEUTRAL}, 절대 {@link #NEGATIVE} 아님.
 */
public enum ChoiceValence {
    POSITIVE,
    NEUTRAL,
    NEGATIVE
}
