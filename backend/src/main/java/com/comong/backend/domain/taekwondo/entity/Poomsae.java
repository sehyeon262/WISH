package com.comong.backend.domain.taekwondo.entity;

/**
 * 태권도 품새 카테고리. 체조 도메인의 {@code ExerciseType} 자리에 대응한다.
 *
 * <p>태극 1~8장을 enum 으로 미리 잡아둔다. 실제로는 1장 동작만 시드로 들어가지만 (V16, AI 학습 완료 범위), 관리자 페이지에서 추후 다른 장 동작을 추가할
 * 때 코드 변경 없이 등록 가능하도록 한다.
 */
public enum Poomsae {
    TAEGEUK_1,
    TAEGEUK_2,
    TAEGEUK_3,
    TAEGEUK_4,
    TAEGEUK_5,
    TAEGEUK_6,
    TAEGEUK_7,
    TAEGEUK_8
}
