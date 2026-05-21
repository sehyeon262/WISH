package com.comong.backend.domain.upload.service;

import java.time.Duration;
import java.util.Locale;
import java.util.UUID;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.comong.backend.domain.patient.entity.PatientProfile;
import com.comong.backend.domain.patient.exception.PatientErrorCode;
import com.comong.backend.domain.patient.service.PatientProfileService;
import com.comong.backend.domain.upload.dto.PresignedUploadRequest;
import com.comong.backend.domain.upload.dto.PresignedUploadResponse;
import com.comong.backend.domain.upload.dto.PresignedUploadResponse.PresignedUploadItem;
import com.comong.backend.domain.upload.dto.UploadPurpose;
import com.comong.backend.global.exception.BusinessException;
import com.comong.backend.global.storage.StorageErrorCode;
import com.comong.backend.global.storage.StorageProperties;

import lombok.RequiredArgsConstructor;
import software.amazon.awssdk.core.exception.SdkException;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.PutObjectPresignRequest;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class PresignedUploadService {

    private static final String VIDEO_WEBM = "video/webm";
    private static final String VIDEO_MP4 = "video/mp4";
    private static final String IMAGE_JPEG = "image/jpeg";

    private final StorageProperties storageProperties;
    private final ObjectProvider<S3Presigner> s3PresignerProvider;
    private final PatientProfileService patientProfileService;

    public PresignedUploadResponse createMusicResultUploadUrls(
            Long userId, PresignedUploadRequest request) {
        PatientProfile patientProfile =
                patientProfileService
                        .findEntityByUserId(userId)
                        .orElseThrow(
                                () ->
                                        new BusinessException(
                                                PatientErrorCode.PATIENT_PROFILE_NOT_FOUND));

        String videoContentType = normalizeContentType(request.videoContentType());
        String thumbContentType = normalizeContentType(request.thumbContentType());
        String videoExtension = videoExtension(videoContentType);
        validateThumbContentType(thumbContentType);

        StorageProperties.S3 s3 = storageProperties.s3();
        S3Presigner s3Presigner = s3PresignerProvider.getIfAvailable();
        if (s3 == null || s3Presigner == null) {
            throw new BusinessException(StorageErrorCode.STORAGE_FAILURE);
        }

        UploadPurpose purpose =
                request.purpose() == null ? UploadPurpose.MUSIC_RESULT : request.purpose();
        String resultUploadId = UUID.randomUUID().toString();
        String objectPrefix =
                buildObjectPrefix(s3.prefix(), purpose, patientProfile.getId(), resultUploadId);
        long expiresInSeconds = s3.presignedTtlSeconds();

        PresignedUploadItem video =
                presignPut(
                        s3,
                        s3Presigner,
                        objectPrefix + "/video" + videoExtension,
                        videoContentType,
                        expiresInSeconds);
        PresignedUploadItem thumb =
                presignPut(
                        s3,
                        s3Presigner,
                        objectPrefix + "/thumb.jpg",
                        thumbContentType,
                        expiresInSeconds);

        return new PresignedUploadResponse(video, thumb);
    }

    private PresignedUploadItem presignPut(
            StorageProperties.S3 s3,
            S3Presigner s3Presigner,
            String key,
            String contentType,
            long expiresInSeconds) {
        PutObjectPresignRequest request =
                PutObjectPresignRequest.builder()
                        .signatureDuration(Duration.ofSeconds(expiresInSeconds))
                        .putObjectRequest(
                                PutObjectRequest.builder()
                                        .bucket(s3.bucket())
                                        .key(key)
                                        .contentType(contentType)
                                        .build())
                        .build();

        try {
            String putUrl = s3Presigner.presignPutObject(request).url().toString();
            return new PresignedUploadItem(key, putUrl, "PUT", contentType, expiresInSeconds);
        } catch (SdkException e) {
            throw new BusinessException(StorageErrorCode.STORAGE_FAILURE);
        }
    }

    private String buildObjectPrefix(
            String storagePrefix, UploadPurpose purpose, Long patientProfileId, String uploadId) {
        String normalizedPrefix = normalizePrefix(storagePrefix);
        String objectPrefix = purpose.storagePath() + "/" + patientProfileId + "/" + uploadId;
        if (normalizedPrefix.isBlank()) {
            return objectPrefix;
        }
        return normalizedPrefix + "/" + objectPrefix;
    }

    private String normalizePrefix(String prefix) {
        String normalized = prefix == null ? "" : prefix.trim();
        while (normalized.startsWith("/")) {
            normalized = normalized.substring(1);
        }
        while (normalized.endsWith("/")) {
            normalized = normalized.substring(0, normalized.length() - 1);
        }
        return normalized;
    }

    private String normalizeContentType(String contentType) {
        return contentType.trim().toLowerCase(Locale.ROOT);
    }

    private String videoExtension(String contentType) {
        if (VIDEO_WEBM.equals(contentType)) {
            return ".webm";
        }
        if (VIDEO_MP4.equals(contentType)) {
            return ".mp4";
        }
        throw new BusinessException(StorageErrorCode.INVALID_VIDEO);
    }

    private void validateThumbContentType(String contentType) {
        if (!IMAGE_JPEG.equals(contentType)) {
            throw new BusinessException(StorageErrorCode.INVALID_IMAGE);
        }
    }
}
