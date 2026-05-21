package com.comong.backend.domain.dialogue.summary;

import java.util.Map;

/**
 * concernFlags / protectiveFactors 의 한국어 라벨 매핑.
 *
 * <p>FE 의 {@code flagLabels.ts} 와 동일한 키-라벨 쌍. 보호자 화면의 시그널 카드 + 정성 요약 템플릿에서 자연어로 변환할 때 사용한다.
 *
 * <p>등록되지 않은 flag 는 {@link #labelOf(String)} 가 humanized 한 fallback ("foo_bar" → "Foo Bar") 을 반환.
 */
public final class FlagLabels {

    private static final Map<String, String> LABELS =
            Map.<String, String>ofEntries(
                    Map.entry("agency_coping", "주도적 대처"),
                    Map.entry("alternative_expression", "다른 방식 표현"),
                    Map.entry("anger_or_frustration", "분노·답답함"),
                    Map.entry("body_discomfort", "몸 불편함"),
                    Map.entry("body_state_named", "몸 상태 표현"),
                    Map.entry("breathing_coping", "호흡으로 진정"),
                    Map.entry("calm_state_named", "안정 표현"),
                    Map.entry("can_name_fear", "두려움 표현"),
                    Map.entry("comfort_received", "위로 받음"),
                    Map.entry("creative_expression", "창의적 표현"),
                    Map.entry("distress_present", "디스트레스 있음"),
                    Map.entry("emotion_named", "감정 이름 붙임"),
                    Map.entry("empathy", "공감"),
                    Map.entry("family_support_preference", "가족과 상의"),
                    Map.entry("family_worry", "가족 걱정"),
                    Map.entry("fatigue_high", "심한 피로"),
                    Map.entry("fatigue_present", "피로감"),
                    Map.entry("hesitation_to_share", "말하기 망설임"),
                    Map.entry("hospital_worry", "병원 걱정"),
                    Map.entry("information_need", "정보 필요"),
                    Map.entry("information_seeking", "정보 찾기"),
                    Map.entry("loneliness", "외로움"),
                    Map.entry("medical_support_preference", "의료진과 상의"),
                    Map.entry("needs_comfort", "위로 필요"),
                    Map.entry("needs_connection", "연결 필요"),
                    Map.entry("needs_rest", "쉼이 필요"),
                    Map.entry("pain_concern", "통증 걱정"),
                    Map.entry("parent_concern", "부모 걱정"),
                    Map.entry("pause_coping", "잠시 멈춤"),
                    Map.entry("peer_separation", "또래와 분리"),
                    Map.entry("playful_coping", "놀이로 풀기"),
                    Map.entry("positive_activity", "즐거운 활동"),
                    Map.entry("positive_body_state", "좋은 컨디션"),
                    Map.entry("positive_memory", "좋은 기억"),
                    Map.entry("positive_mood", "긍정적 기분"),
                    Map.entry("positive_social_state", "좋은 관계"),
                    Map.entry("prefers_nonverbal_expression", "비언어 표현 선호"),
                    Map.entry("procedure_fear", "시술 두려움"),
                    Map.entry("relationship_named", "관계 표현"),
                    Map.entry("rest_need_named", "쉼 요청"),
                    Map.entry("self_care_action", "자기 돌봄"),
                    Map.entry("self_regulation", "자기 조절"),
                    Map.entry("sets_boundary", "경계 표현"),
                    Map.entry("sleep_worry", "수면 걱정"),
                    Map.entry("social_connection", "사회적 연결"),
                    Map.entry("support_need_named", "도움 요청 표현"),
                    Map.entry("support_seeking", "도움 찾기"),
                    Map.entry("uncertainty", "불확실함"),
                    Map.entry("uncertainty_named", "모호함 표현"),
                    Map.entry("verbal_expression", "말로 표현"),
                    Map.entry("worry_present", "걱정 있음"));

    private FlagLabels() {}

    /** flag 키의 한국어 라벨. 미등록이면 humanized fallback. */
    public static String labelOf(String flag) {
        String label = LABELS.get(flag);
        return label != null ? label : humanize(flag);
    }

    private static String humanize(String flag) {
        if (flag == null || flag.isEmpty()) return "";
        String[] parts = flag.split("_");
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < parts.length; i++) {
            if (i > 0) sb.append(' ');
            String p = parts[i];
            if (p.isEmpty()) continue;
            sb.append(Character.toUpperCase(p.charAt(0)));
            if (p.length() > 1) sb.append(p.substring(1));
        }
        return sb.toString();
    }
}
