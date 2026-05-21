package com.comong.backend.domain.dialogue.dto;

import java.time.LocalDateTime;
import java.util.List;

import com.comong.backend.domain.dialogue.catalog.model.ChoiceTone;
import com.comong.backend.domain.dialogue.catalog.model.ChoiceValence;
import com.comong.backend.domain.dialogue.entity.DialogueFinishReason;
import com.comong.backend.domain.dialogue.entity.DialogueSession;
import com.comong.backend.domain.dialogue.entity.DialogueStatus;
import com.comong.backend.domain.dialogue.entity.DialogueTurn;
import com.comong.backend.domain.dialogue.entity.NpcName;

/** 디버그/QA 용 세션 상세. */
public record SessionDetailResponse(
        Long sessionId,
        Long patientProfileId,
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
        List<String> emotionConcernFlags,
        List<String> emotionProtectiveFactors,
        String guardianMessage,
        LocalDateTime emotionAnalyzedAt,
        List<TurnDetailResponse> turns) {

    public static SessionDetailResponse from(DialogueSession session, List<DialogueTurn> turns) {
        return new SessionDetailResponse(
                session.getId(),
                session.getPatientProfile().getId(),
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
                session.getEmotionConcernFlags(),
                session.getEmotionProtectiveFactors(),
                session.getGuardianMessage(),
                session.getEmotionAnalyzedAt(),
                turns.stream().map(TurnDetailResponse::from).toList());
    }
}
