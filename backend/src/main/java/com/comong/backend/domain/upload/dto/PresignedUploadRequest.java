package com.comong.backend.domain.upload.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import io.swagger.v3.oas.annotations.media.Schema;

public record PresignedUploadRequest(
        @Schema(description = "업로드할 영상 Content-Type", example = "video/webm")
                @NotBlank
                @Size(max = 100)
                String videoContentType,
        @Schema(description = "업로드할 썸네일 Content-Type", example = "image/jpeg")
                @NotBlank
                @Size(max = 100)
                String thumbContentType,
        @Schema(description = "업로드 용도", example = "GYMNASTICS_PERFORMANCE")
                UploadPurpose purpose) {}
