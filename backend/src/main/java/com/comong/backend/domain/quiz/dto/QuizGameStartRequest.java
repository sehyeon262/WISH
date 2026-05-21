package com.comong.backend.domain.quiz.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

/** Round options for starting a drawing quiz game. */
public record QuizGameStartRequest(@Min(3) @Max(15) Integer totalRounds) {}
