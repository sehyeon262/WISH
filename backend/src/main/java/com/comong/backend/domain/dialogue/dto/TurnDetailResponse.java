package com.comong.backend.domain.dialogue.dto;

import java.time.LocalDateTime;
import java.util.List;

import com.comong.backend.domain.dialogue.catalog.model.ChoiceTone;
import com.comong.backend.domain.dialogue.catalog.model.ChoiceValence;
import com.comong.backend.domain.dialogue.catalog.model.SentimentWord;
import com.comong.backend.domain.dialogue.entity.DialogueTurn;
import com.comong.backend.domain.dialogue.entity.DialogueTurnGeneratedBy;

/**
 * 디버그/QA + 보호자 페이지 turn 상세. catalog 스냅샷 메타 (valence/tone/topicKeywords/sentimentWords) 까지 함께 노출.
 */
public record TurnDetailResponse(
        Long id,
        int stepIndex,
        String questionText,
        String choiceIntentId,
        String choiceText,
        String npcResponseText,
        short intensity,
        List<String> concernFlags,
        List<String> protectiveFactors,
        ChoiceValence valence,
        ChoiceTone tone,
        List<String> topicKeywords,
        List<SentimentWord> sentimentWords,
        DialogueTurnGeneratedBy generatedBy,
        LocalDateTime createdAt) {

    public static TurnDetailResponse from(DialogueTurn turn) {
        return new TurnDetailResponse(
                turn.getId(),
                turn.getStepIndex(),
                turn.getQuestionText(),
                turn.getChoiceIntentId(),
                turn.getChoiceText(),
                turn.getNpcResponseText(),
                turn.getIntensity(),
                turn.getConcernFlags(),
                turn.getProtectiveFactors(),
                turn.getValence(),
                turn.getTone(),
                turn.getTopicKeywords(),
                turn.getSentimentWords(),
                turn.getGeneratedBy(),
                turn.getCreatedAt());
    }
}
