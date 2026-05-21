package com.comong.backend.domain.dialogue.service;

import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Component;

import com.comong.backend.domain.dialogue.dto.ChoiceResponse;
import com.comong.backend.domain.dialogue.dto.SceneResponse;
import com.comong.backend.domain.dialogue.entity.DialogueFinishReason;
import com.comong.backend.domain.dialogue.entity.DialogueTurnGeneratedBy;
import com.comong.backend.domain.dialogue.entity.NpcName;

@Component
public class FallbackSceneProvider {

    private record SceneTemplate(String questionText, List<ChoiceResponse> choices) {}

    private static final SceneResponse YEONGCHEOL_FIRST_SCENE =
            new SceneResponse(
                    "오늘은 어떻게 지내고 싶니?",
                    List.of(
                            ChoiceResponse.of("entry_rest", "쉬고 싶어요"),
                            ChoiceResponse.of("entry_activity", "뭔가 해보고 싶어요"),
                            ChoiceResponse.of("entry_talk", "잠깐 얘기하고 싶어요")),
                    null,
                    false,
                    DialogueTurnGeneratedBy.FALLBACK,
                    List.of());

    private static final SceneTemplate REST_SCENE =
            new SceneTemplate(
                    "어떻게 쉬고 싶니?",
                    List.of(
                            ChoiceResponse.of("rest_quiet", "조용히 있을래요"),
                            ChoiceResponse.of("rest_close_eyes", "눈을 감고 있을래요"),
                            ChoiceResponse.of("rest_near_family", "가족 옆에 있을래요")));

    private static final SceneTemplate ACTIVITY_SCENE =
            new SceneTemplate(
                    "가볍게 뭘 해볼까?",
                    List.of(
                            ChoiceResponse.of("activity_music", "음악을 들어볼래요"),
                            ChoiceResponse.of("activity_art", "그림을 그려볼래요"),
                            ChoiceResponse.of("activity_move", "조금 움직여볼래요")));

    private static final SceneTemplate TALK_SCENE =
            new SceneTemplate(
                    "무슨 얘기가 좋을까?",
                    List.of(
                            ChoiceResponse.of("talk_body", "몸 얘기"),
                            ChoiceResponse.of("talk_peer", "친구나 학교 얘기"),
                            ChoiceResponse.of("talk_worry", "걱정되는 얘기")));

    private static final SceneTemplate BODY_SCENE =
            new SceneTemplate(
                    "지금 몸은 어때?",
                    List.of(
                            ChoiceResponse.of("body_okay", "괜찮아요"),
                            ChoiceResponse.of("body_tired", "금방 힘이 빠져요"),
                            ChoiceResponse.of("body_pain_worry", "아픈 게 걱정돼요")));

    private static final SceneTemplate BODY_SUPPORT_SCENE =
            new SceneTemplate(
                    "그럴 땐 어떻게 하면 좋을까?",
                    List.of(
                            ChoiceResponse.of("body_tell_adult", "가까운 사람에게 말할래요"),
                            ChoiceResponse.of("body_point_place", "손으로 알려줄래요"),
                            ChoiceResponse.of("body_hold_hand", "손을 잡아줬으면 해요")));

    private static final SceneTemplate PEER_SCENE =
            new SceneTemplate(
                    "친구나 학교 생각이 나?",
                    List.of(
                            ChoiceResponse.of("peer_miss", "친구가 보고 싶어요"),
                            ChoiceResponse.of("peer_school", "학교 소식이 궁금해요"),
                            ChoiceResponse.of("peer_okay", "지금은 괜찮아요")));

    private static final SceneTemplate WORRY_SCENE =
            new SceneTemplate(
                    "어떤 게 제일 신경 쓰여?",
                    List.of(
                            ChoiceResponse.of("worry_hospital", "병원 일이 걱정돼요"),
                            ChoiceResponse.of("worry_family", "가족이 걱정돼요"),
                            ChoiceResponse.of("worry_upset", "속상한 일이 있어요")));

    private static final SceneTemplate HOSPITAL_SCENE =
            new SceneTemplate(
                    "어떤 게 조금 걸려?",
                    List.of(
                            ChoiceResponse.of("hospital_injection", "주사가 걱정돼요"),
                            ChoiceResponse.of("hospital_unknown", "어떻게 하는지 모르겠어요"),
                            ChoiceResponse.of("hospital_okay", "지금은 괜찮아요")));

    private static final SceneTemplate HOSPITAL_SUPPORT_SCENE =
            new SceneTemplate(
                    "그럴 땐 뭐가 조금 나을까?",
                    List.of(
                            ChoiceResponse.of("support_family", "가족이 옆에 있으면 좋아요"),
                            ChoiceResponse.of("support_teacher", "선생님 설명이 좋아요"),
                            ChoiceResponse.of("support_hold_hand", "손을 잡아줬으면 해요")));

    private static final SceneTemplate FAMILY_SCENE =
            new SceneTemplate(
                    "그럴 땐 어떻게 전하고 싶니?",
                    List.of(
                            ChoiceResponse.of("express_words", "말로 해볼래요"),
                            ChoiceResponse.of("express_drawing", "그림으로 보여줄래요"),
                            ChoiceResponse.of("express_private", "나중에 말할래요")));

    private static final SceneTemplate UPSET_SCENE =
            new SceneTemplate(
                    "그럴 땐 어떻게 하고 싶어?",
                    List.of(
                            ChoiceResponse.of("anger_pause", "잠깐 멈출래요"),
                            ChoiceResponse.of("anger_say_upset", "속상하다고 말할래요"),
                            ChoiceResponse.of("anger_call_help", "도와달라고 말할래요")));

    private static final Map<String, List<String>> ACK_BY_PREV_CHOICE =
            Map.ofEntries(
                    Map.entry("entry_rest", List.of("그래, 쉬고 싶은 날도 있지.", "잠깐 등대 옆에서 쉬어가자.")),
                    Map.entry("entry_activity", List.of("좋구나. 가볍게 시작해도 괜찮단다.", "힘들면 언제든 멈춰도 돼.")),
                    Map.entry("entry_talk", List.of("그래, 길게 말하지 않아도 괜찮단다.", "편한 얘기부터 골라보자.")),
                    Map.entry("talk_body", List.of("좋아. 몸 이야기를 해도 괜찮단다.")),
                    Map.entry("talk_peer", List.of("친구나 학교 생각이 날 수 있지.")),
                    Map.entry("talk_worry", List.of("걱정되는 게 있으면 조금만 말해도 돼.")),
                    Map.entry("body_tired", List.of("몸에 힘이 빠질 때가 있지.", "그럴 땐 쉬어도 괜찮아.")),
                    Map.entry("body_pain_worry", List.of("아픈 게 걱정되면 혼자 참지 않아도 돼.")),
                    Map.entry("worry_hospital", List.of("병원 일이 신경 쓰일 수 있어.")),
                    Map.entry("worry_family", List.of("가족이 걱정될 때도 있지.")),
                    Map.entry("worry_upset", List.of("속상한 일이 있었구나.", "지금 바로 다 말하지 않아도 돼.")),
                    Map.entry("hospital_injection", List.of("주사 생각만 해도 걱정될 때가 있지.")),
                    Map.entry("hospital_unknown", List.of("모르면 더 걱정될 수 있어.")),
                    Map.entry("peer_miss", List.of("친구가 보고 싶은 마음이 들 수 있어.")),
                    Map.entry("peer_school", List.of("학교 소식이 궁금할 수 있어.")));

    private static final List<String> CLOSING_LINES_COMPLETED =
            List.of("오늘은 여기까지 해도 괜찮단다.", "등대 불빛은 천천히 켜둘게.");

    private static final List<String> CLOSING_LINES_REST =
            List.of("지금은 쉬어도 괜찮단다.", "등대 옆에서 천천히 쉬어가자.");

    private static final List<String> CLOSING_LINES_TIMEOUT =
            List.of("괜찮아, 천천히 골라도 된단다.", "등대 불빛은 여기서 기다릴게.");

    public SceneResponse firstScene(NpcName npcName) {
        requireBackendDriven(npcName);
        return YEONGCHEOL_FIRST_SCENE;
    }

    public SceneResponse nextScene(
            NpcName npcName, String prevChoiceIntentId, int newStepCount, int maxSteps) {
        requireBackendDriven(npcName);
        List<String> ack = ackFor(prevChoiceIntentId);
        if (newStepCount >= maxSteps) {
            return endScene(ack);
        }
        SceneTemplate template = chooseTemplate(prevChoiceIntentId);
        if (template == null) {
            return endScene(ack);
        }
        return toScene(template, ack);
    }

    public List<String> closingLines(NpcName npcName, DialogueFinishReason reason) {
        requireBackendDriven(npcName);
        return switch (reason) {
            case COMPLETED -> CLOSING_LINES_COMPLETED;
            case REST_TODAY -> CLOSING_LINES_REST;
            case TIMEOUT -> CLOSING_LINES_TIMEOUT;
        };
    }

    public List<String> ackFor(String prevChoiceIntentId) {
        return ACK_BY_PREV_CHOICE.getOrDefault(prevChoiceIntentId, List.of());
    }

    private static SceneTemplate chooseTemplate(String prevChoiceIntentId) {
        return switch (prevChoiceIntentId) {
            case "entry_rest" -> REST_SCENE;
            case "entry_activity" -> ACTIVITY_SCENE;
            case "entry_talk" -> TALK_SCENE;
            case "talk_body" -> BODY_SCENE;
            case "body_tired", "body_pain_worry" -> BODY_SUPPORT_SCENE;
            case "talk_peer" -> PEER_SCENE;
            case "talk_worry" -> WORRY_SCENE;
            case "worry_hospital" -> HOSPITAL_SCENE;
            case "hospital_injection", "hospital_unknown" -> HOSPITAL_SUPPORT_SCENE;
            case "worry_family" -> FAMILY_SCENE;
            case "worry_upset" -> UPSET_SCENE;
            default -> null;
        };
    }

    private static SceneResponse toScene(SceneTemplate template, List<String> npcResponse) {
        return new SceneResponse(
                template.questionText(),
                template.choices(),
                null,
                false,
                DialogueTurnGeneratedBy.FALLBACK,
                npcResponse);
    }

    private static SceneResponse endScene(List<String> npcResponse) {
        return new SceneResponse(
                "", List.of(), null, true, DialogueTurnGeneratedBy.FALLBACK, npcResponse);
    }

    private static void requireBackendDriven(NpcName npcName) {
        if (!npcName.isLlmDriven()) {
            throw new IllegalStateException(
                    "FallbackSceneProvider only handles LLM-driven NPC (lighthouse), got "
                            + npcName);
        }
    }
}
