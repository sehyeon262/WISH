package com.comong.backend.domain.dialogue.service;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import com.comong.backend.domain.dialogue.dto.ChoiceResponse;
import com.comong.backend.domain.dialogue.dto.SceneResponse;
import com.comong.backend.domain.dialogue.entity.DialogueSession;
import com.comong.backend.domain.dialogue.entity.DialogueTurn;
import com.comong.backend.domain.dialogue.entity.DialogueTurnGeneratedBy;

import lombok.RequiredArgsConstructor;

@Component
@RequiredArgsConstructor
public class ClaudeSceneProvider {

    private static final Logger log = LoggerFactory.getLogger(ClaudeSceneProvider.class);

    private static final Set<String> FORBIDDEN_TERMS =
            Set.of(
                    "진단",
                    "위험",
                    "심각",
                    "우울증",
                    "불안장애",
                    "치료 필요",
                    "참아야 해",
                    "이겨내야 해",
                    "괜찮아질 거야",
                    "아프지 않을 거야",
                    "치료가 잘될 거야",
                    "죽음",
                    "예후",
                    "생존",
                    "병이 낫는다",
                    "약 복용");

    private static final Set<String> MEDICAL_TERMS = Set.of("주사", "검사", "아픔", "아픈", "병원");
    private static final Set<String> FAMILY_WORRY_TERMS = Set.of("가족 걱정", "가족이 걱정");

    private static final Set<String> ALLOWED_INTENTS =
            Set.of(
                    "rest_quiet",
                    "rest_close_eyes",
                    "rest_near_family",
                    "activity_music",
                    "activity_art",
                    "activity_move",
                    "talk_body",
                    "talk_peer",
                    "talk_worry",
                    "body_okay",
                    "body_tired",
                    "body_pain_worry",
                    "body_tell_adult",
                    "body_point_place",
                    "body_hold_hand",
                    "peer_miss",
                    "peer_school",
                    "peer_okay",
                    "worry_hospital",
                    "worry_family",
                    "worry_upset",
                    "hospital_injection",
                    "hospital_unknown",
                    "hospital_okay",
                    "support_family",
                    "support_teacher",
                    "support_hold_hand",
                    "express_words",
                    "express_drawing",
                    "express_private",
                    "anger_pause",
                    "anger_say_upset",
                    "anger_call_help");

    private static final Map<String, Set<String>> TRANSITION_RULES =
            Map.ofEntries(
                    Map.entry(
                            "entry_rest",
                            Set.of("rest_quiet", "rest_close_eyes", "rest_near_family")),
                    Map.entry(
                            "entry_activity",
                            Set.of("activity_music", "activity_art", "activity_move")),
                    Map.entry("entry_talk", Set.of("talk_body", "talk_peer", "talk_worry")),
                    Map.entry("talk_body", Set.of("body_okay", "body_tired", "body_pain_worry")),
                    Map.entry(
                            "body_tired",
                            Set.of("body_tell_adult", "body_point_place", "body_hold_hand")),
                    Map.entry(
                            "body_pain_worry",
                            Set.of("body_tell_adult", "body_point_place", "body_hold_hand")),
                    Map.entry("talk_peer", Set.of("peer_miss", "peer_school", "peer_okay")),
                    Map.entry(
                            "talk_worry", Set.of("worry_hospital", "worry_family", "worry_upset")),
                    Map.entry(
                            "worry_hospital",
                            Set.of("hospital_injection", "hospital_unknown", "hospital_okay")),
                    Map.entry(
                            "hospital_injection",
                            Set.of("support_family", "support_teacher", "support_hold_hand")),
                    Map.entry(
                            "hospital_unknown",
                            Set.of("support_family", "support_teacher", "support_hold_hand")),
                    Map.entry(
                            "worry_family",
                            Set.of("express_words", "express_drawing", "express_private")),
                    Map.entry(
                            "worry_upset",
                            Set.of("anger_pause", "anger_say_upset", "anger_call_help")),
                    Map.entry("rest_quiet", Set.of()),
                    Map.entry("rest_close_eyes", Set.of()),
                    Map.entry("rest_near_family", Set.of()),
                    Map.entry("activity_music", Set.of()),
                    Map.entry("activity_art", Set.of()),
                    Map.entry("activity_move", Set.of()),
                    Map.entry("body_okay", Set.of()),
                    Map.entry("body_tell_adult", Set.of()),
                    Map.entry("body_point_place", Set.of()),
                    Map.entry("body_hold_hand", Set.of()),
                    Map.entry("peer_miss", Set.of()),
                    Map.entry("peer_school", Set.of()),
                    Map.entry("peer_okay", Set.of()),
                    Map.entry("hospital_okay", Set.of()),
                    Map.entry("support_family", Set.of()),
                    Map.entry("support_teacher", Set.of()),
                    Map.entry("support_hold_hand", Set.of()),
                    Map.entry("express_words", Set.of()),
                    Map.entry("express_drawing", Set.of()),
                    Map.entry("express_private", Set.of()),
                    Map.entry("anger_pause", Set.of()),
                    Map.entry("anger_say_upset", Set.of()),
                    Map.entry("anger_call_help", Set.of()));

    private static final int MAX_QUESTION_LENGTH = 34;
    private static final int MAX_CHOICE_TEXT_LENGTH = 18;
    private static final int MAX_NPC_RESPONSE_LINE_LENGTH = 40;
    private static final int MAX_NPC_RESPONSE_LINES = 2;
    private static final int MIN_CHOICES = 2;
    private static final int MAX_CHOICES = 3;

    private static final String SYSTEM_PROMPT =
            """
            너는 WISH 마을의 등대지기 영철이다.
            너는 소아암 환아가 게임 안에서 몸과 마음을 편하게 표현하도록 돕는 캐릭터다.

            너는 심리상담사, 의사, 진단 도구가 아니다.
            아이를 평가하거나 진단하지 않는다.
            아이가 고른 선택을 부드럽게 받아주고, 다음에 고를 수 있는 짧은 선택지를 제안한다.

            말투:
            - 차분하고 따뜻한 등대지기 말투를 사용한다.
            - 아이에게 말하듯 쉬운 한국어를 쓴다.
            - 한 문장은 짧게 쓴다.
            - npcResponse는 1~2문장만 사용한다.
            - questionText도 한 문장만 사용한다.
            - 바다, 등대, 불빛 표현은 가끔만 사용한다.
            - 너무 시적이거나 추상적인 표현은 피한다.

            대화 원칙:
            1. 아이가 선택한 내용을 먼저 받아준다.
            2. 아이가 선택하지 않은 민감한 주제를 꺼내지 않는다.
            3. 주사, 검사, 아픔, 가족 걱정은 아이가 관련 흐름을 선택한 뒤에만 다룬다.
            4. 대화는 선택지 기반으로만 진행한다.
            5. 자유 입력을 요구하지 않는다.
            6. 의학 조언, 진단, 위험도, 치료 판단을 하지 않는다.
            7. 참으라고 하거나 긍정적으로 생각하라고 강요하지 않는다.
            8. 활동은 강요하지 않는다.
            9. 피곤함, 아픔, 걱정이 표현되면 먼저 쉬기나 도움 요청을 안내한다.

            금지 표현:
            진단, 위험, 심각, 우울증, 불안장애, 치료 필요, 참아야 해, 이겨내야 해,
            괜찮아질 거야, 아프지 않을 거야, 치료가 잘될 거야, 죽음, 예후, 생존,
            병이 낫는다, 의학적 판단, 약 복용 지시.

            반드시 tool_use input으로만 응답한다.
            choiceIntentId는 user message에 있는 허용 목록에서만 고른다.
            shouldEndSession=true이면 questionText는 빈 문자열, choices는 빈 배열로 둔다.
            """;

    private final ClaudeClient claudeClient;

    public Optional<SceneResponse> nextScene(
            DialogueSession session, List<DialogueTurn> turnsAscByStepIndex) {
        String userMessage = buildUserMessage(turnsAscByStepIndex);
        Optional<ClaudeClient.ClaudeSceneResult> result =
                claudeClient.generateNextScene(SYSTEM_PROMPT, userMessage);
        if (result.isEmpty()) {
            return Optional.empty();
        }
        String prevChoiceIntentId =
                turnsAscByStepIndex.isEmpty()
                        ? null
                        : turnsAscByStepIndex
                                .get(turnsAscByStepIndex.size() - 1)
                                .getChoiceIntentId();
        Optional<ClaudeClient.ClaudeSceneResult> validated =
                validate(result.get(), prevChoiceIntentId, turnsAscByStepIndex);
        if (validated.isEmpty()) {
            log.warn(
                    "Claude response failed validation for session {} - falling back",
                    session.getId());
            return Optional.empty();
        }
        return Optional.of(toSceneResponse(validated.get()));
    }

    private String buildUserMessage(List<DialogueTurn> turns) {
        StringBuilder sb = new StringBuilder("대화 기록:\n");
        int order = 1;
        for (DialogueTurn t : turns) {
            sb.append(order++)
                    .append(". Q: ")
                    .append(t.getQuestionText())
                    .append(" / A: ")
                    .append(t.getChoiceText())
                    .append(" (intent: ")
                    .append(t.getChoiceIntentId())
                    .append(")\n");
        }
        DialogueTurn last = turns.isEmpty() ? null : turns.get(turns.size() - 1);
        if (last != null) {
            String prev = last.getChoiceIntentId();
            Set<String> allowedNext = TRANSITION_RULES.getOrDefault(prev, Set.of());
            sb.append("\n아이가 방금 고른 선택: ").append(last.getChoiceText()).append("\n");
            if (allowedNext.isEmpty()) {
                sb.append("이 선택은 마무리 선택이다. shouldEndSession=true로 짧게 마무리한다.\n");
            } else {
                sb.append("다음 선택지 choiceIntentId는 이 목록에서만 고른다: ")
                        .append(String.join(", ", allowedNext))
                        .append("\n");
            }
        }
        return sb.toString();
    }

    private Optional<ClaudeClient.ClaudeSceneResult> validate(
            ClaudeClient.ClaudeSceneResult result,
            String prevChoiceIntentId,
            List<DialogueTurn> turnsAscByStepIndex) {
        String q = result.questionText();
        if (!result.shouldEndSession()) {
            if (q == null
                    || q.isBlank()
                    || q.length() > MAX_QUESTION_LENGTH
                    || containsForbidden(q)) {
                return Optional.empty();
            }
            if (isBeforeHospitalRoute(prevChoiceIntentId) && containsAny(q, MEDICAL_TERMS)) {
                return Optional.empty();
            }
            if (isBeforeFamilyRoute(prevChoiceIntentId) && containsAny(q, FAMILY_WORRY_TERMS)) {
                return Optional.empty();
            }
            if (isRepeatedQuestion(q, turnsAscByStepIndex)) {
                return Optional.empty();
            }
        } else if (q != null && containsForbidden(q)) {
            return Optional.empty();
        }

        List<ClaudeClient.ClaudeChoice> choices = result.choices();
        if (choices == null) {
            return Optional.empty();
        }
        Set<String> allowedNext =
                prevChoiceIntentId == null
                        ? ALLOWED_INTENTS
                        : TRANSITION_RULES.getOrDefault(prevChoiceIntentId, Set.of());
        if (result.shouldEndSession()) {
            if (!choices.isEmpty()) {
                return Optional.empty();
            }
        } else if (choices.size() < MIN_CHOICES || choices.size() > MAX_CHOICES) {
            return Optional.empty();
        }
        for (ClaudeClient.ClaudeChoice c : choices) {
            if (c.choiceIntentId() == null
                    || c.choiceIntentId().isBlank()
                    || !ALLOWED_INTENTS.contains(c.choiceIntentId())
                    || !allowedNext.contains(c.choiceIntentId())) {
                return Optional.empty();
            }
            if (c.text() == null
                    || c.text().isBlank()
                    || c.text().length() > MAX_CHOICE_TEXT_LENGTH
                    || containsForbidden(c.text())) {
                return Optional.empty();
            }
        }

        List<String> npcResponse = result.npcResponse();
        if (npcResponse == null
                || npcResponse.isEmpty()
                || npcResponse.size() > MAX_NPC_RESPONSE_LINES) {
            return Optional.empty();
        }
        for (String line : npcResponse) {
            if (line == null
                    || line.isBlank()
                    || line.length() > MAX_NPC_RESPONSE_LINE_LENGTH
                    || containsForbidden(line)) {
                return Optional.empty();
            }
        }
        return Optional.of(result);
    }

    private static boolean containsForbidden(String text) {
        return containsAny(text, FORBIDDEN_TERMS);
    }

    private static boolean containsAny(String text, Set<String> terms) {
        for (String term : terms) {
            if (text.contains(term)) {
                return true;
            }
        }
        return false;
    }

    private static boolean isBeforeHospitalRoute(String prevChoiceIntentId) {
        return prevChoiceIntentId == null
                || !Set.of(
                                "worry_hospital",
                                "hospital_injection",
                                "hospital_unknown",
                                "support_family",
                                "support_teacher",
                                "support_hold_hand")
                        .contains(prevChoiceIntentId);
    }

    private static boolean isBeforeFamilyRoute(String prevChoiceIntentId) {
        return prevChoiceIntentId == null
                || !Set.of("worry_family", "express_words", "express_drawing", "express_private")
                        .contains(prevChoiceIntentId);
    }

    private static boolean isRepeatedQuestion(
            String question, List<DialogueTurn> turnsAscByStepIndex) {
        String normalized = question.replaceAll("\\s+", "");
        return turnsAscByStepIndex.stream()
                .map(DialogueTurn::getQuestionText)
                .filter(text -> text != null)
                .map(text -> text.replaceAll("\\s+", ""))
                .anyMatch(normalized::equals);
    }

    private static SceneResponse toSceneResponse(ClaudeClient.ClaudeSceneResult result) {
        List<ChoiceResponse> choices =
                result.choices().stream()
                        .map(c -> ChoiceResponse.of(c.choiceIntentId(), c.text()))
                        .toList();
        return new SceneResponse(
                result.questionText(),
                choices,
                null,
                result.shouldEndSession(),
                DialogueTurnGeneratedBy.CLAUDE,
                result.npcResponse());
    }
}
