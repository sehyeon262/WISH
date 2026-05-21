package com.comong.backend.domain.dialogue.catalog.model;

/**
 * 채팅 단어 하이라이트의 sentiment 톤. FE 채팅 UI 에서 색상 강조에 사용된다.
 *
 * <p>{@link ChoiceValence} 와 분리된 *문장 내 단어 단위* 분류.
 */
public enum SentimentTone {
    POSITIVE,
    NEGATIVE
}
