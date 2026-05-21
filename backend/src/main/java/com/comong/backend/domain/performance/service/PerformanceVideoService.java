package com.comong.backend.domain.performance.service;

import java.time.Duration;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.comong.backend.domain.patient.entity.PatientProfile;
import com.comong.backend.domain.performance.entity.PerformanceVideo;
import com.comong.backend.domain.performance.repository.PerformanceVideoRepository;
import com.comong.backend.domain.upload.dto.UploadPurpose;
import com.comong.backend.global.exception.BusinessException;
import com.comong.backend.global.storage.StorageErrorCode;
import com.comong.backend.global.storage.StorageProperties;

import lombok.RequiredArgsConstructor;
import software.amazon.awssdk.core.exception.SdkException;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.GetObjectPresignRequest;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class PerformanceVideoService {

    private final PerformanceVideoRepository performanceVideoRepository;
    private final StorageProperties storageProperties;
    private final ObjectProvider<S3Presigner> s3PresignerProvider;

    @Transactional
    public PerformanceVideo createIfPresent(
            PatientProfile patientProfile,
            String videoKey,
            String thumbKey,
            UploadPurpose expectedPurpose) {
        if (videoKey == null || videoKey.isBlank()) {
            return null;
        }
        validateKeyForPatient(videoKey, patientProfile.getId(), expectedPurpose, true);
        validateKeyForPatient(thumbKey, patientProfile.getId(), expectedPurpose, false);
        return performanceVideoRepository.save(
                PerformanceVideo.builder()
                        .patientProfile(patientProfile)
                        .videoKey(videoKey)
                        .thumbKey(thumbKey)
                        .build());
    }

    public String toPublicUrl(String key) {
        if (key == null || key.isBlank()) {
            return null;
        }
        StorageProperties.S3 s3 = storageProperties.s3();
        S3Presigner s3Presigner = s3PresignerProvider.getIfAvailable();
        if (s3 == null || s3Presigner == null) {
            throw new BusinessException(StorageErrorCode.STORAGE_FAILURE);
        }

        GetObjectPresignRequest request =
                GetObjectPresignRequest.builder()
                        .signatureDuration(Duration.ofSeconds(s3.presignedTtlSeconds()))
                        .getObjectRequest(
                                GetObjectRequest.builder().bucket(s3.bucket()).key(key).build())
                        .build();
        try {
            return s3Presigner.presignGetObject(request).url().toString();
        } catch (SdkException e) {
            throw new BusinessException(StorageErrorCode.STORAGE_FAILURE);
        }
    }

    private void validateKeyForPatient(
            String key, Long patientProfileId, UploadPurpose expectedPurpose, boolean video) {
        if (key == null || key.isBlank()) {
            if (video) {
                throw new BusinessException(StorageErrorCode.INVALID_VIDEO);
            }
            return;
        }

        String expectedPrefix =
                buildObjectPrefixRoot(storageProperties.s3(), expectedPurpose, patientProfileId);
        if (!key.startsWith(expectedPrefix + "/")) {
            throw new BusinessException(
                    video ? StorageErrorCode.INVALID_VIDEO : StorageErrorCode.INVALID_IMAGE);
        }
    }

    private String buildObjectPrefixRoot(
            StorageProperties.S3 s3, UploadPurpose purpose, Long patientProfileId) {
        if (s3 == null) {
            throw new BusinessException(StorageErrorCode.STORAGE_FAILURE);
        }
        String storagePrefix = normalizePrefix(s3.prefix());
        String purposePrefix = purpose.storagePath();
        if (storagePrefix.isBlank()) {
            return purposePrefix + "/" + patientProfileId;
        }
        return storagePrefix + "/" + purposePrefix + "/" + patientProfileId;
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
}
