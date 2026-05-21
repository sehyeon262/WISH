package com.comong.backend.domain.dialogue.summary;

import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import org.springframework.stereotype.Component;

import com.comong.backend.domain.dialogue.catalog.DialogueCatalogService;
import com.comong.backend.domain.dialogue.catalog.model.CatalogNpcDefinition;
import com.comong.backend.domain.dialogue.catalog.model.ChoiceDefinition;
import com.comong.backend.domain.dialogue.catalog.model.ChoiceEndingType;
import com.comong.backend.domain.dialogue.entity.DialogueSession;
import com.comong.backend.domain.dialogue.entity.DialogueTurn;

import lombok.RequiredArgsConstructor;

/**
 * 보호자에게 제공할 *정성 관찰* 요약 생성기 (template + slot-filling).
 *
 * <p>AI 없음 — 같은 입력 → 같은 출력 (보호자 신뢰). 임상 진단 위험 + LLM 환각 위험 회피.
 *
 * <p>단일 세션 템플릿:
 *
 * <pre>
 * 오늘 {NPC}와 {topic} 이야기를 나눴어요.
 * 아이는 "{key_choice}"라고 말했고,
 * {protective_label} 모습을 보였어요.
 * 함께 해볼 수 있는 활동: {ending_advice}.
 * </pre>
 *
 * <p>비어있는 슬롯은 라인 자체를 생략한다 (어색함 회피).
 *
 * <p>추천 후속 활동은 본문에 박는 동시에 {@link #resolveRecommendedActivity} 로도 별도 노출한다 — 보호자 화면의 좌측 (대화 요약 카드) 와
 * 우측 (정성 관찰 카드) 양쪽에서 일관된 문구를 활용할 수 있도록.
 */
@Component
@RequiredArgsConstructor
public class DialogueSummaryComposer {

    private final DialogueCatalogService catalogService;

    /** 단일 세션 요약. {@code turns} 가 비어있으면 "대화를 시작했어요" 톤. */
    public String composeSessionSummary(DialogueSession session, List<DialogueTurn> turns) {
        String npc = npcDisplayName(session);
        if (turns == null || turns.isEmpty()) {
            return "오늘 " + npc + "와 대화를 시작했어요.";
        }

        String topic = scriptTitle(session).orElse(null);
        String keyChoice = pickKeyChoiceText(turns).orElse(null);
        String protectiveLabel = pickStrongestProtectiveLabel(turns).orElse(null);
        ChoiceEndingType endingType = resolveEndingType(turns).orElse(null);

        StringBuilder sb = new StringBuilder();
        sb.append("오늘 ").append(npc);
        if (topic != null && !topic.isBlank()) {
            sb.append("와 ").append(topic).append(" 이야기를 나눴어요.");
        } else {
            sb.append("와 이야기를 나눴어요.");
        }
        if (keyChoice != null && !keyChoice.isBlank()) {
            sb.append('\n').append("아이는 \"").append(keyChoice).append("\"라고 말했고,");
        }
        if (protectiveLabel != null && !protectiveLabel.isBlank()) {
            sb.append('\n').append(protectiveLabel).append(" 모습을 보였어요.");
        }
        sb.append('\n').append("함께 해볼 수 있는 활동: ").append(EndingAdvice.adviceOf(endingType));
        return sb.toString();
    }

    /**
     * 일별 종합 요약 (여러 세션). 만난 NPC + 다룬 주제 + 보호 신호 요약 + 가장 무거운 endingType 의 advice.
     *
     * <p>비어 있으면 "오늘 마을에 들르지 않았어요."
     */
    public String composeDailySummary(
            List<DialogueSession> sessions, Map<Long, List<DialogueTurn>> turnsBySession) {
        if (sessions == null || sessions.isEmpty()) {
            return "오늘 마을에 들르지 않았어요.";
        }

        Set<String> npcNames = new LinkedHashSet<>();
        Set<String> topics = new LinkedHashSet<>();
        Map<String, Integer> protectiveCount = new HashMap<>();
        ChoiceEndingType heaviestEnding = null;

        for (DialogueSession s : sessions) {
            npcNames.add(npcDisplayName(s));
            scriptTitle(s).ifPresent(topics::add);
            List<DialogueTurn> turns = turnsBySession.getOrDefault(s.getId(), List.of());
            for (DialogueTurn t : turns) {
                if (t.getProtectiveFactors() == null) continue;
                for (String f : t.getProtectiveFactors()) {
                    protectiveCount.merge(f, 1, Integer::sum);
                }
            }
            ChoiceEndingType e = resolveEndingType(turns).orElse(null);
            heaviestEnding = pickHeavier(heaviestEnding, e);
        }

        StringBuilder sb = new StringBuilder();
        sb.append("오늘 ").append(String.join(", ", npcNames)).append("을 만났어요.");
        if (!topics.isEmpty()) {
            sb.append('\n').append(String.join(", ", topics)).append(" 이야기를 했고,");
        }
        Optional<String> topProtective = topProtectiveLabel(protectiveCount);
        topProtective.ifPresent(p -> sb.append('\n').append(p).append(" 모습을 보였어요."));
        sb.append('\n').append("함께 해볼 수 있는 활동: ").append(EndingAdvice.adviceOf(heaviestEnding));
        return sb.toString();
    }

    // ===== helpers =====

    private String npcDisplayName(DialogueSession session) {
        return session.getNpcName()
                .catalogId()
                .flatMap(catalogService::findNpc)
                .map(CatalogNpcDefinition::displayName)
                .orElseGet(() -> session.getNpcName().displayName());
    }

    private Optional<String> scriptTitle(DialogueSession session) {
        String scriptId = session.getScriptId();
        if (scriptId == null) return Optional.empty();
        return catalogService.findScript(scriptId).map(s -> s.title());
    }

    /**
     * "의미 있는" 선택지 텍스트를 고른다.
     *
     * <ul>
     *   <li>가장 보호요인이 많이 붙은 turn 우선 (도움 청하기·표현 같은 *능동* 행동 부각)
     *   <li>tie 면 intensity 가 더 높은 (감정 강도 큰) turn
     *   <li>tie 면 가장 마지막 turn
     * </ul>
     */
    private Optional<String> pickKeyChoiceText(List<DialogueTurn> turns) {
        return turns.stream()
                .max(
                        Comparator.<DialogueTurn>comparingInt(
                                        t ->
                                                t.getProtectiveFactors() == null
                                                        ? 0
                                                        : t.getProtectiveFactors().size())
                                .thenComparingInt(DialogueTurn::getIntensity)
                                .thenComparingInt(DialogueTurn::getStepIndex))
                .map(DialogueTurn::getChoiceText);
    }

    /** 모든 turn 의 protective factor 합산해 가장 빈도 높은 한 개의 라벨. */
    private Optional<String> pickStrongestProtectiveLabel(List<DialogueTurn> turns) {
        Map<String, Integer> count = new HashMap<>();
        for (DialogueTurn t : turns) {
            if (t.getProtectiveFactors() == null) continue;
            for (String f : t.getProtectiveFactors()) {
                count.merge(f, 1, Integer::sum);
            }
        }
        return topProtectiveLabel(count);
    }

    private Optional<String> topProtectiveLabel(Map<String, Integer> count) {
        return count.entrySet().stream()
                .max(Map.Entry.comparingByValue())
                .map(Map.Entry::getKey)
                .map(FlagLabels::labelOf);
    }

    /** 마지막 turn 의 choiceIntentId 를 catalog 에서 룩업해 endingType 을 도출. */
    private Optional<ChoiceEndingType> resolveEndingType(List<DialogueTurn> turns) {
        if (turns.isEmpty()) return Optional.empty();
        DialogueTurn last = turns.get(turns.size() - 1);
        return catalogService
                .findChoice(last.getChoiceIntentId())
                .map(ChoiceDefinition::endingType);
    }

    /**
     * 보호자 화면 "추천 후속 활동" 카드용 문구. 여러 세션 중 가장 무거운 endingType 의 advice 를 반환. 세션 없으면 {@link
     * Optional#empty}.
     */
    public Optional<String> resolveRecommendedActivity(
            List<DialogueSession> sessions, Map<Long, List<DialogueTurn>> turnsBySession) {
        if (sessions == null || sessions.isEmpty()) return Optional.empty();
        ChoiceEndingType heaviest = null;
        for (DialogueSession s : sessions) {
            List<DialogueTurn> turns = turnsBySession.getOrDefault(s.getId(), List.of());
            ChoiceEndingType e = resolveEndingType(turns).orElse(null);
            heaviest = pickHeavier(heaviest, e);
        }
        if (heaviest == null) return Optional.empty();
        return Optional.of(EndingAdvice.adviceOf(heaviest));
    }

    /**
     * 두 endingType 중 "더 무거운" 쪽을 고른다. 임상적으로 가장 능동적 후속 권유가 필요한 유형이 우선.
     *
     * <p>의료 자원 호출 > 어른 호출 > 도움 요청 > 표현 활동 > 휴식 > 사회 연결 > NO_PRESSURE
     */
    private ChoiceEndingType pickHeavier(ChoiceEndingType a, ChoiceEndingType b) {
        if (a == null) return b;
        if (b == null) return a;
        return weight(a) >= weight(b) ? a : b;
    }

    private int weight(ChoiceEndingType type) {
        return switch (type) {
            case ASK_MEDICAL_FIRST -> 100;
            case ASK_ADULT_FIRST -> 90;
            case ASK_HELP_FIRST -> 80;
            case CALM_DOWN -> 70;
            case EXPRESS_WITH_DRAWING -> 60;
            case REST_THEN_ACTIVITY -> 50;
            case REST_ONLY -> 40;
            case GO_LIGHT_ACTIVITY -> 30;
            case SOCIAL_CONNECT -> 20;
            case PRIVATE_OKAY -> 10;
            case NO_PRESSURE -> 0;
        };
    }
}
