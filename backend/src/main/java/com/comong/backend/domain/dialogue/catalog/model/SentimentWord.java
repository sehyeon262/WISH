package com.comong.backend.domain.dialogue.catalog.model;

/** 채팅 말풍선 안에서 강조할 단어. FE 가 단어 단위로 색상을 입힐 때 사용한다. */
public record SentimentWord(String phrase, SentimentTone tone) {}
