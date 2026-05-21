package com.comong.backend.domain.dialogue.service;

import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.List;
import java.util.random.RandomGenerator;

import org.springframework.stereotype.Component;

import com.comong.backend.domain.dialogue.catalog.DialogueCatalogService;
import com.comong.backend.domain.dialogue.catalog.model.ChoiceDefinition;
import com.comong.backend.domain.dialogue.catalog.model.DialogueScript;
import com.comong.backend.domain.dialogue.catalog.model.ScriptNode;
import com.comong.backend.domain.dialogue.dto.ChoiceResponse;
import com.comong.backend.domain.dialogue.dto.SceneResponse;
import com.comong.backend.domain.dialogue.entity.DialogueTurnGeneratedBy;
import com.comong.backend.domain.dialogue.entity.NpcName;
import com.comong.backend.domain.dialogue.exception.DialogueErrorCode;
import com.comong.backend.global.exception.BusinessException;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * 마을 NPC 의 scene 생성을 담당. 카탈로그 데이터를 읽어 첫 화면 / 다음 화면 / 엔딩 화면을 만들고, 환자의 이력에 따라 script 를 골라준다.
 *
 * <p>{@link FallbackSceneProvider} 가 등대(Yeongcheol)용 정적 트리를 다루는 것에 대응되는, 마을용 카탈로그 트리 처리기.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class CatalogSceneProvider {

    private final DialogueCatalogService catalogService;
    private final RandomGenerator random = new SecureRandom();

    /**
     * 환자의 NPC 재방문 기록을 기반으로 다음 script 를 선택한다.
     *
     * <ul>
     *   <li>안 본 script 가 있으면 그 중 랜덤
     *   <li>모두 본 적 있으면 가장 최근 본 거 제외하고 랜덤 (직전 반복 회피)
     *   <li>NPC 의 script 가 단 하나면 무조건 그것
     * </ul>
     */
    public String pickScriptId(NpcName npcName, List<String> recentScriptIdsDescOrder) {
        String catalogNpcId =
                npcName.catalogId()
                        .orElseThrow(
                                () -> new BusinessException(DialogueErrorCode.SESSION_NOT_FOUND));
        List<String> available = catalogService.scriptIdsOf(catalogNpcId);
        if (available.isEmpty()) {
            throw new IllegalStateException(
                    "No scripts available in catalog for npcId='" + catalogNpcId + "'");
        }
        if (available.size() == 1) {
            return available.get(0);
        }

        List<String> unseen = new ArrayList<>(available);
        unseen.removeAll(recentScriptIdsDescOrder);
        if (!unseen.isEmpty()) {
            // 카탈로그 선언 순서의 첫 번째 — 결정적 (테스트 가능 + 콘텐츠 작성 순서 존중).
            return unseen.get(0);
        }

        // 다 본 적 있음 — 가장 최근 본 거는 제외하고 랜덤 (반복 회피).
        String mostRecent =
                recentScriptIdsDescOrder.isEmpty() ? null : recentScriptIdsDescOrder.get(0);
        List<String> candidates = new ArrayList<>(available);
        if (mostRecent != null) {
            candidates.remove(mostRecent);
        }
        if (candidates.isEmpty()) {
            return available.get(0);
        }
        return candidates.get(random.nextInt(candidates.size()));
    }

    /** 세션 시작 시 보여줄 첫 화면. {@code scriptId} 의 entry 노드 정보를 SceneResponse 로 변환. */
    public SceneResponse firstScene(String scriptId) {
        DialogueScript script =
                catalogService
                        .findScript(scriptId)
                        .orElseThrow(
                                () ->
                                        new IllegalStateException(
                                                "scriptId '"
                                                        + scriptId
                                                        + "' missing from catalog"));
        ScriptNode entry = script.nodes().get(script.entryNodeId());
        return toScene(entry, List.of(), false);
    }

    /**
     * 선택지 제출 후 보여줄 다음 화면. 선택지가 엔딩이면 ending 응답 (질문 없음, shouldEnd=true) 으로 변환된다.
     *
     * <p>{@code choiceDef} 은 catalog 의 choice 메타. nextNodeId 가 null 이면 ending 처리.
     */
    public SceneResponse nextScene(String scriptId, ChoiceDefinition choiceDef) {
        if (choiceDef.isEnding()) {
            return endingScene(choiceDef);
        }
        DialogueScript script =
                catalogService
                        .findScript(scriptId)
                        .orElseThrow(
                                () ->
                                        new IllegalStateException(
                                                "scriptId '"
                                                        + scriptId
                                                        + "' missing from catalog"));
        ScriptNode next = script.nodes().get(choiceDef.nextNodeId());
        if (next == null) {
            throw new IllegalStateException(
                    "nextNodeId '"
                            + choiceDef.nextNodeId()
                            + "' missing from script '"
                            + scriptId
                            + "'");
        }
        // 중간 노드: npcLines 의 첫 N-1 줄은 직전 선택에 대한 ack, 마지막 줄은 새 질문 setup —
        // SceneResponse 의 npcResponse 슬롯엔 모두 합쳐서 전달 (FE 는 그대로 쌓아서 출력).
        return toScene(next, next.npcLines(), false);
    }

    private SceneResponse endingScene(ChoiceDefinition choice) {
        List<String> all = new ArrayList<>();
        if (choice.endingNpcLines() != null) {
            all.addAll(choice.endingNpcLines());
        }
        if (choice.closingLine() != null && !choice.closingLine().isBlank()) {
            all.add(choice.closingLine());
        }
        return new SceneResponse(
                "", List.of(), null, true, DialogueTurnGeneratedBy.NPC_SCRIPT, all);
    }

    private SceneResponse toScene(ScriptNode node, List<String> npcResponse, boolean isEnding) {
        List<ChoiceResponse> choices = new ArrayList<>(node.choices().size());
        for (String choiceId : node.choices()) {
            ChoiceDefinition c =
                    catalogService
                            .findChoice(choiceId)
                            .orElseThrow(
                                    () ->
                                            new IllegalStateException(
                                                    "choiceIntentId '"
                                                            + choiceId
                                                            + "' missing from catalog"));
            choices.add(ChoiceResponse.of(c.choiceIntentId(), c.text()));
        }
        return new SceneResponse(
                node.questionText(),
                choices,
                null,
                isEnding,
                DialogueTurnGeneratedBy.NPC_SCRIPT,
                npcResponse);
    }
}
