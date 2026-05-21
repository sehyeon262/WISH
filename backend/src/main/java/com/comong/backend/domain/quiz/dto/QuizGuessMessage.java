package com.comong.backend.domain.quiz.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Guess text submitted by a non-drawer player. */
public record QuizGuessMessage(@NotBlank @Size(max = 40) String text) {}
