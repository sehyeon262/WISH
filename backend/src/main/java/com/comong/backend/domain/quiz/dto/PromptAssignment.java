package com.comong.backend.domain.quiz.dto;

/** 출제자에게만 노출되는 라운드 제시어. 힌트는 사용하지 않으므로 단어만 전달. */
public record PromptAssignment(int roundNumber, String word) {}
