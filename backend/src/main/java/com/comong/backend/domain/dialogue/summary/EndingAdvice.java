package com.comong.backend.domain.dialogue.summary;

import java.util.EnumMap;
import java.util.Map;

import com.comong.backend.domain.dialogue.catalog.model.ChoiceEndingType;

/**
 * 엔딩 유형 → 보호자에게 보여줄 추천 후속 활동 멘트 매핑.
 *
 * <p>설계 문서 v3 섹션 8 의 {@code ENDING_TO_ADVICE} 매핑을 BE 측에 동기화.
 */
public final class EndingAdvice {

    private static final Map<ChoiceEndingType, String> ADVICE =
            new EnumMap<>(ChoiceEndingType.class);

    static {
        ADVICE.put(ChoiceEndingType.REST_ONLY, "잠시 옆에 함께 머물러주세요.");
        ADVICE.put(ChoiceEndingType.REST_THEN_ACTIVITY, "푹 쉬고 나서 가벼운 활동을 함께 해보세요.");
        ADVICE.put(ChoiceEndingType.GO_LIGHT_ACTIVITY, "오늘 가벼운 활동을 함께 시도해보세요.");
        ADVICE.put(ChoiceEndingType.ASK_HELP_FIRST, "걱정을 한 가지 골라 함께 이야기해보세요.");
        ADVICE.put(ChoiceEndingType.ASK_ADULT_FIRST, "옆에 있어달라는 마음을 들어주세요.");
        ADVICE.put(ChoiceEndingType.ASK_MEDICAL_FIRST, "다음 진료 때 함께 짧게 이야기해보세요.");
        ADVICE.put(ChoiceEndingType.EXPRESS_WITH_DRAWING, "함께 그림 그리는 시간을 가져보세요.");
        ADVICE.put(ChoiceEndingType.SOCIAL_CONNECT, "친구나 가족에게 짧은 인사를 보내는 시간을 만들어보세요.");
        ADVICE.put(ChoiceEndingType.PRIVATE_OKAY, "지금 말하지 않아도 괜찮다는 마음을 함께 지켜주세요.");
        ADVICE.put(ChoiceEndingType.CALM_DOWN, "함께 잠깐 멈추고 천천히 숨 쉬어보세요.");
        ADVICE.put(ChoiceEndingType.NO_PRESSURE, "오늘은 아이의 속도에 맞춰주세요.");
    }

    private EndingAdvice() {}

    /** 엔딩 유형에 매핑된 추천 활동 한국어 문구. null/미등록은 default 문구. */
    public static String adviceOf(ChoiceEndingType endingType) {
        if (endingType == null) return "오늘은 아이의 속도에 맞춰주세요.";
        return ADVICE.getOrDefault(endingType, "오늘은 아이의 속도에 맞춰주세요.");
    }
}
