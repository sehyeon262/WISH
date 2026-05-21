package com.comong.backend.domain.dialogue.catalog.model;

import java.util.List;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonInclude.Include;

/**
 * 카탈로그의 단일 선택지 정의.
 *
 * <p>중간 선택지는 {@code nextNodeId} 를 가지며 {@code endingType / endingNpcLines / closingLine} 은 null. 엔딩
 * 선택지({@code isEnding == true})는 {@code nextNodeId == null} 이며 엔딩 전용 필드를 채운다.
 *
 * <p>FE 와의 통신에는 노출되지 않는 내부 메타도 포함 ({@link #intensity} 등은 보호자 노출 X, 내부 정렬용).
 */
@JsonInclude(Include.NON_NULL)
public record ChoiceDefinition(
        String choiceIntentId,
        String text,
        String nextNodeId,
        boolean isEnding,
        ChoiceValence valence,
        ChoiceTone tone,
        int intensity,
        List<String> concernFlags,
        List<String> protectiveFactors,
        List<String> topicKeywords,
        List<SentimentWord> sentimentWords,
        ChoiceEndingType endingType,
        List<String> endingNpcLines,
        String closingLine) {}
