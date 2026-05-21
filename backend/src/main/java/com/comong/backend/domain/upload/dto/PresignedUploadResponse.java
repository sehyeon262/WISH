package com.comong.backend.domain.upload.dto;

public record PresignedUploadResponse(PresignedUploadItem video, PresignedUploadItem thumb) {

    public record PresignedUploadItem(
            String key, String putUrl, String method, String contentType, long expiresInSeconds) {}
}
