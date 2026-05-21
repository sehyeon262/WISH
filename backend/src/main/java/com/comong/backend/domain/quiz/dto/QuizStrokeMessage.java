package com.comong.backend.domain.quiz.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** A normalized drawing stroke packet. Coordinates are canvas-relative values in the 0..1 range. */
public record QuizStrokeMessage(
        @NotBlank @Pattern(regexp = "begin|move|end|clear") String kind,
        @Size(max = 64) String strokeId,
        Double x,
        Double y,
        @Pattern(regexp = "^#[0-9a-fA-F]{6}$") String color,
        Double size,
        Boolean eraser) {}
