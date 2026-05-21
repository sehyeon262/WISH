package com.comong.backend.domain.realtime.dto;

import jakarta.validation.constraints.NotNull;

import com.comong.backend.domain.usage.entity.ContentType;

import io.swagger.v3.oas.annotations.media.Schema;

public record RealtimeContentStartRequest(
        @NotNull
                @Schema(
                        description = "시작한 콘텐츠 타입",
                        allowableValues = {"MUSIC", "GYMNASTICS", "TAEKWONDO", "ART"})
                ContentType contentType) {}
