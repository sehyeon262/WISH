package com.comong.backend.domain.dialogue.catalog.model;

/**
 * 엔딩 노드의 행동 권유 유형. 보호자 화면의 "추천 후속 활동" 매핑 키로 쓰인다.
 *
 * <p>{@code ENDING_TO_ADVICE} 매핑 (보호자에게 표시될 한국어 문구) 은 별도 상수에서 정의한다.
 */
public enum ChoiceEndingType {
    /** 잠시 옆에 함께 머물러주세요. */
    REST_ONLY,
    /** 푹 쉬고 나서 가벼운 활동을 함께 해보세요. */
    REST_THEN_ACTIVITY,
    /** 오늘 가벼운 활동을 함께 시도해보세요. */
    GO_LIGHT_ACTIVITY,
    /** 걱정을 한 가지 골라 함께 이야기해보세요. */
    ASK_HELP_FIRST,
    /** 옆에 있어달라는 마음을 들어주세요. */
    ASK_ADULT_FIRST,
    /** 다음 진료 때 함께 짧게 이야기해보세요. */
    ASK_MEDICAL_FIRST,
    /** 함께 그림 그리는 시간을 가져보세요. */
    EXPRESS_WITH_DRAWING,
    /** 친구나 가족에게 짧은 인사를 보내는 시간을 만들어보세요. */
    SOCIAL_CONNECT,
    /** 지금 말하지 않아도 괜찮다는 마음을 함께 지켜주세요. */
    PRIVATE_OKAY,
    /** 함께 잠깐 멈추고 천천히 숨 쉬어보세요. */
    CALM_DOWN,
    /** 오늘은 아이의 속도에 맞춰주세요. */
    NO_PRESSURE
}
