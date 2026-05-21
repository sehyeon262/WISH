package com.comong.backend.domain.exercise.dto;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import io.swagger.v3.oas.annotations.media.Schema;

public record ExerciseMotionReplayData(
        @Schema(description = "Replay payload version", example = "1") @NotNull @Min(1)
                Integer version,
        @Schema(
                        description =
                                "Replay sampling rate. Raw replay stores 30fps; compact replay stores 5~10fps.",
                        example = "30")
                @NotNull
                @Min(5)
                @Max(30)
                Integer fps,
        @Schema(description = "Replay duration in milliseconds", example = "3000")
                @NotNull
                @PositiveOrZero
                Integer durationMs,
        @Schema(description = "Landmark names ordered to match every frame tuple list")
                @NotNull
                @Size(min = 12, max = 25)
                List<@NotBlank String> landmarks,
        @Schema(description = "Replay frames. lm is compact [x,y,z,confidence] tuples.")
                @NotNull
                @Size(min = 1, max = 5400)
                List<@Valid Frame> frames,
        @Schema(description = "Representative segment selected from the full replay") @Valid
                Segment representativeSegment,
        @Schema(description = "Optional coaching or comparison segments for compact replay")
                @Size(max = 32)
                List<@Valid Segment> markers) {

    public record Frame(
            @Schema(
                            description =
                                    "Frame timestamp from clip start in milliseconds. Timestamps must be strictly increasing; duplicate timestamps are rejected.",
                            example = "33")
                    @NotNull
                    @PositiveOrZero
                    Integer t,
            @Schema(
                            description =
                                    "Compact [x,y,z,confidence] tuples. x/y/z may be null when a landmark is not tracked; confidence is required.")
                    @NotNull
                    @Size(min = 12, max = 25)
                    List<List<Double>> lm) {}

    public record Segment(
            @Schema(description = "Segment start in milliseconds", example = "1000")
                    @NotNull
                    @PositiveOrZero
                    Integer startMs,
            @Schema(description = "Segment end in milliseconds", example = "4000")
                    @NotNull
                    @PositiveOrZero
                    Integer endMs,
            @Schema(description = "Selection reason", example = "highest tracking/progress score")
                    @Size(max = 120)
                    String reason) {}
}
