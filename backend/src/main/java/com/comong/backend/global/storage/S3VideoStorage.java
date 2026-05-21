package com.comong.backend.global.storage;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.time.Duration;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

import com.comong.backend.global.exception.BusinessException;

import lombok.extern.slf4j.Slf4j;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.GetUrlRequest;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.S3Exception;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.GetObjectPresignRequest;

/**
 * S3 백엔드 {@link VideoStorage} 구현체. {@link S3ImageStorage} 와 동일한 패턴 — 영상 매직바이트 검증 (MP4 ftyp / WebM
 * EBML), private 버킷 + presigned GET URL.
 *
 * <p><b>저장 식별자 (DB)</b>: SDK 가 만들어주는 영구 객체 URL ({@code
 * https://<bucket>.s3.<region>.amazonaws.com/<prefix>/videos/<uuid>.<ext>}). 영상은 이미지와 prefix 를 분리
 * ({@code videos/}) 해 ops/감사 가독성 확보 — {@link LocalVideoStorage} 와 동일 컨벤션.
 *
 * <p><b>업로드 방식</b>: 100MB 한도 내라 단일 {@code putObject} 로 충분 (S3 putObject 는 5GB 까지). {@code
 * S3TransferManager} 의 분할 업로드는 파일이 더 커질 때 도입 — 현재는 의존성만 클래스패스에 있고 사용은 후속 이슈에서.
 *
 * <p><b>idempotent delete</b>: {@code NoSuchKey} 무시.
 */
@Slf4j
@Component
@ConditionalOnProperty(name = "storage.type", havingValue = "s3")
public class S3VideoStorage implements VideoStorage {

    private static final Set<String> ALLOWED_EXTENSIONS = Set.of(".mp4", ".webm");

    private static final int MAGIC_HEAD_SIZE = 12;

    private static final long MAX_VIDEO_BYTES = 100L * 1024 * 1024;

    private static final String VIDEOS_SUBPATH = "videos";

    private final StorageProperties properties;
    private final S3Client s3Client;
    private final S3Presigner s3Presigner;

    public S3VideoStorage(
            StorageProperties properties, S3Client s3Client, S3Presigner s3Presigner) {
        this.properties = properties;
        this.s3Client = s3Client;
        this.s3Presigner = s3Presigner;
    }

    @Override
    public StoredVideo upload(MultipartFile file) {
        VideoFormat detectedFormat = validateVideo(file);
        String originalExtension = extractExtension(file.getOriginalFilename());
        if (!detectedFormat.matchesExtension(originalExtension)) {
            throw new BusinessException(StorageErrorCode.INVALID_VIDEO);
        }

        StorageProperties.S3 s3 = properties.s3();
        String key =
                s3.prefix()
                        + "/"
                        + VIDEOS_SUBPATH
                        + "/"
                        + UUID.randomUUID()
                        + detectedFormat.canonicalExtension();

        try (InputStream in = file.getInputStream()) {
            s3Client.putObject(
                    PutObjectRequest.builder()
                            .bucket(s3.bucket())
                            .key(key)
                            .contentType(detectedFormat.mimeType())
                            .build(),
                    RequestBody.fromInputStream(in, file.getSize()));
        } catch (IOException | S3Exception e) {
            log.warn("S3 영상 업로드 실패 (bucket={}, key={}): {}", s3.bucket(), key, e.getMessage(), e);
            throw new BusinessException(StorageErrorCode.STORAGE_FAILURE);
        }

        String permanentUrl =
                s3Client.utilities()
                        .getUrl(GetUrlRequest.builder().bucket(s3.bucket()).key(key).build())
                        .toString();
        return new StoredVideo(permanentUrl);
    }

    /**
     * @return presigned GET URL, 또는 stored 가 자기 형식 (S3 객체 URL) 이 아닐 때 {@code null}. graceful 처리 의도는
     *     {@link S3ImageStorage#toPublicUrl} javadoc 참조 (S14P31E103-511).
     */
    @Override
    public String toPublicUrl(String stored) {
        if (stored == null || stored.isBlank()) {
            return stored;
        }
        StorageProperties.S3 s3 = properties.s3();
        Optional<String> keyOpt = tryExtractKey(stored);
        if (keyOpt.isEmpty()) {
            return null;
        }
        String key = keyOpt.get();
        GetObjectPresignRequest req =
                GetObjectPresignRequest.builder()
                        .signatureDuration(Duration.ofSeconds(s3.presignedTtlSeconds()))
                        .getObjectRequest(
                                GetObjectRequest.builder().bucket(s3.bucket()).key(key).build())
                        .build();
        return s3Presigner.presignGetObject(req).url().toString();
    }

    /** stored 가 자기 형식이 아니면 idempotent 무시 (S14P31E103-511). */
    @Override
    public void delete(String stored) {
        if (stored == null || stored.isBlank()) {
            return;
        }
        StorageProperties.S3 s3 = properties.s3();
        Optional<String> keyOpt = tryExtractKey(stored);
        if (keyOpt.isEmpty()) {
            log.info("S3 형식 아닌 stored URL — delete idempotent 무시: {}", stored);
            return;
        }
        String key = keyOpt.get();
        try {
            s3Client.deleteObject(
                    DeleteObjectRequest.builder().bucket(s3.bucket()).key(key).build());
        } catch (NoSuchKeyException ignored) {
            // idempotent — 이미 사라진 객체에 대한 재시도는 정상
        } catch (S3Exception e) {
            log.warn("S3 영상 삭제 실패 (bucket={}, key={}): {}", s3.bucket(), key, e.getMessage(), e);
            throw new BusinessException(StorageErrorCode.STORAGE_FAILURE);
        }
    }

    /** {@link S3ImageStorage#tryExtractKey(String)} 와 동일 — virtual-hosted / path-style 양쪽 지원. */
    private Optional<String> tryExtractKey(String url) {
        URI uri;
        try {
            uri = URI.create(url);
        } catch (IllegalArgumentException e) {
            log.warn("S3 URL 형식 아님 — URI 파싱 실패: {}", url);
            return Optional.empty();
        }
        String path = uri.getPath();
        if (path == null || path.length() <= 1 || !path.startsWith("/")) {
            log.warn("S3 URL 형식 아님 — path 비어있음: {}", url);
            return Optional.empty();
        }
        String pathWithoutLeadingSlash = path.substring(1);
        String host = uri.getHost();
        String bucket = properties.s3().bucket();
        if (host != null && host.startsWith(bucket + ".")) {
            return Optional.of(pathWithoutLeadingSlash);
        }
        if (pathWithoutLeadingSlash.startsWith(bucket + "/")) {
            return Optional.of(pathWithoutLeadingSlash.substring(bucket.length() + 1));
        }
        log.warn("S3 URL 형식 아님 — 알려진 형식 아님: {}", url);
        return Optional.empty();
    }

    private VideoFormat validateVideo(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new BusinessException(StorageErrorCode.INVALID_VIDEO);
        }
        if (file.getSize() > MAX_VIDEO_BYTES) {
            throw new BusinessException(StorageErrorCode.PAYLOAD_TOO_LARGE);
        }
        String contentType = file.getContentType();
        if (contentType == null || !contentType.toLowerCase(Locale.ROOT).startsWith("video/")) {
            throw new BusinessException(StorageErrorCode.INVALID_VIDEO);
        }
        return detectMagicBytes(file);
    }

    private VideoFormat detectMagicBytes(MultipartFile file) {
        byte[] head;
        try (InputStream in = file.getInputStream()) {
            head = in.readNBytes(MAGIC_HEAD_SIZE);
        } catch (IOException e) {
            log.warn("영상 magic-bytes 읽기 IO 실패: {}", e.getMessage(), e);
            throw new BusinessException(StorageErrorCode.STORAGE_FAILURE);
        }
        if (head.length < MAGIC_HEAD_SIZE) {
            throw new BusinessException(StorageErrorCode.INVALID_VIDEO);
        }
        if (isMp4(head)) {
            return VideoFormat.MP4;
        }
        if (isWebm(head)) {
            return VideoFormat.WEBM;
        }
        throw new BusinessException(StorageErrorCode.INVALID_VIDEO);
    }

    private static boolean isMp4(byte[] h) {
        return h.length >= 8 && h[4] == 'f' && h[5] == 't' && h[6] == 'y' && h[7] == 'p';
    }

    private static boolean isWebm(byte[] h) {
        return h.length >= 4
                && (h[0] & 0xFF) == 0x1A
                && (h[1] & 0xFF) == 0x45
                && (h[2] & 0xFF) == 0xDF
                && (h[3] & 0xFF) == 0xA3;
    }

    private String extractExtension(String originalFilename) {
        if (originalFilename == null) {
            throw new BusinessException(StorageErrorCode.INVALID_VIDEO);
        }
        int dot = originalFilename.lastIndexOf('.');
        if (dot < 0 || dot == originalFilename.length() - 1) {
            throw new BusinessException(StorageErrorCode.INVALID_VIDEO);
        }
        String ext = originalFilename.substring(dot).toLowerCase(Locale.ROOT);
        if (!ALLOWED_EXTENSIONS.contains(ext)) {
            throw new BusinessException(StorageErrorCode.INVALID_VIDEO);
        }
        return ext;
    }

    private enum VideoFormat {
        MP4(".mp4", "video/mp4", Set.of(".mp4")),
        WEBM(".webm", "video/webm", Set.of(".webm"));

        private final String canonicalExtension;
        private final String mimeType;
        private final Set<String> acceptedExtensions;

        VideoFormat(String canonicalExtension, String mimeType, Set<String> acceptedExtensions) {
            this.canonicalExtension = canonicalExtension;
            this.mimeType = mimeType;
            this.acceptedExtensions = acceptedExtensions;
        }

        boolean matchesExtension(String extension) {
            return acceptedExtensions.contains(extension);
        }

        String canonicalExtension() {
            return canonicalExtension;
        }

        String mimeType() {
            return mimeType;
        }
    }
}
