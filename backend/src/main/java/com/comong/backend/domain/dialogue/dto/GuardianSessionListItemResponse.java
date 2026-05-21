package com.comong.backend.domain.dialogue.dto;

import java.time.Duration;
import java.time.LocalDateTime;

import com.comong.backend.domain.dialogue.catalog.model.ChoiceTone;
import com.comong.backend.domain.dialogue.catalog.model.ChoiceValence;
import com.comong.backend.domain.dialogue.entity.DialogueFinishReason;
import com.comong.backend.domain.dialogue.entity.DialogueSession;
import com.comong.backend.domain.dialogue.entity.DialogueStatus;
import com.comong.backend.domain.dialogue.entity.NpcName;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * 보호자 페이지의 대화 이력 카드 1개 분량의 메타. turns 는 detail API 에서 별도 조회한다.
 *
 * <p>{@code durationSeconds} 는 종료된 세션(엔디드 타임 존재)에 한해 계산되며 진행 중/포기 세션에선 {@code null}. FE 가 "10분",
 * "방금 전" 같은 라벨을 직접 포맷할 수 있게 raw seconds 로 내려준다.
 */
@Schema(description = "보호자 페이지 대화 이력 카드 메타 (turns 제외)")
public record GuardianSessionListItemResponse(
        Long sessionId,
        NpcName npcName,
        DialogueStatus status,
        int stepCount,
        int maxSteps,
        DialogueFinishReason finishReason,
        LocalDateTime startedAt,
        LocalDateTime endedAt,
        ChoiceValence emotionValence,
        ChoiceTone emotionTone,
        Short emotionIntensity,
        String guardianMessage,
        LocalDateTime emotionAnalyzedAt,
        Long durationSeconds) {

    public static GuardianSessionListItemResponse from(DialogueSession session) {
        Long duration =
                session.getEndedAt() != null
                        ? Duration.between(session.getStartedAt(), session.getEndedAt())
                                .getSeconds()
                        : null;
        return new GuardianSessionListItemResponse(
                session.getId(),
                session.getNpcName(),
                session.getStatus(),
                session.getStepCount(),
                session.getMaxSteps(),
                session.getFinishReason(),
                session.getStartedAt(),
                session.getEndedAt(),
                session.getEmotionValence(),
                session.getEmotionTone(),
                session.getEmotionIntensity(),
                session.getGuardianMessage(),
                session.getEmotionAnalyzedAt(),
                duration);
    }
}
