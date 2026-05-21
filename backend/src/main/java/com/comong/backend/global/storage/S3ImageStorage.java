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
 * S3 백엔드 {@link ImageStorage} 구현체. private 버킷을 가정 — 외부 노출 URL 은 매 응답마다 짧은 TTL 로 발급되는 presigned GET
 * URL.
 *
 * <p><b>저장 식별자 (DB)</b>: SDK 가 만들어주는 영구 객체 URL ({@code
 * https://<bucket>.s3.<region>.amazonaws.com/<prefix>/<uuid>.<ext>}). 이 값은 DB 에 저장되며 자체로 클라이언트가 GET
 * 해도 403 (private 버킷) — 응답 직렬화 시점에 {@link #toPublicUrl} 이 presigned URL 로 변환해 내려준다.
 *
 * <p><b>업로드 검증 — 4중 방어</b>: {@link LocalImageStorage} 와 동일 로직 (Content-Type, magic bytes, 확장자 일치,
 * whitelist). 두 구현체가 같은 검증 의도를 갖되 helper 추출은 별도 후속 이슈로 분리 — 변경 시 두 곳 모두 갱신 필수.
 *
 * <p><b>idempotent delete</b>: {@code NoSuchKey} 는 무시 (이미 삭제된 객체에 대한 재호출 안전).
 */
@Slf4j
@Component
@ConditionalOnProperty(name = "storage.type", havingValue = "s3")
public class S3ImageStorage implements ImageStorage {

    private static final Set<String> ALLOWED_EXTENSIONS =
            Set.of(".png", ".jpg", ".jpeg", ".webp", ".gif");

    private static final int MAGIC_HEAD_SIZE = 12;

    private static final long MAX_IMAGE_BYTES = 10L * 1024 * 1024;

    private final StorageProperties properties;
    private final S3Client s3Client;
    private final S3Presigner s3Presigner;

    public S3ImageStorage(
            StorageProperties properties, S3Client s3Client, S3Presigner s3Presigner) {
        this.properties = properties;
        this.s3Client = s3Client;
        this.s3Presigner = s3Presigner;
    }

    @Override
    public StoredImage upload(MultipartFile file) {
        ImageFormat detectedFormat = validateImage(file);
        String originalExtension = extractExtension(file.getOriginalFilename());
        if (!detectedFormat.matchesExtension(originalExtension)) {
            throw new BusinessException(StorageErrorCode.INVALID_IMAGE);
        }

        StorageProperties.S3 s3 = properties.s3();
        String key = s3.prefix() + "/" + UUID.randomUUID() + detectedFormat.canonicalExtension();

        try (InputStream in = file.getInputStream()) {
            s3Client.putObject(
                    PutObjectRequest.builder()
                            .bucket(s3.bucket())
                            .key(key)
                            .contentType(detectedFormat.mimeType())
                            .build(),
                    RequestBody.fromInputStream(in, file.getSize()));
        } catch (IOException | S3Exception e) {
            log.warn("S3 이미지 업로드 실패 (bucket={}, key={}): {}", s3.bucket(), key, e.getMessage(), e);
            throw new BusinessException(StorageErrorCode.STORAGE_FAILURE);
        }

        String permanentUrl =
                s3Client.utilities()
                        .getUrl(GetUrlRequest.builder().bucket(s3.bucket()).key(key).build())
                        .toString();
        return new StoredImage(permanentUrl);
    }

    /**
     * @return presigned GET URL, 또는 stored 가 자기 형식 (S3 객체 URL) 이 아닐 때 {@code null}. 후자는
     *     [S14P31E103-493 머지 후 dev/prod 가 s3 로 전환됐는데 DB 에 옛 LocalImageStorage 시절 URL 이 남아있는 케이스] 를
     *     graceful 하게 처리하기 위함 — 응답이 500 으로 깨지지 않고 클라엔 {@code imageUrl: null} 로 내려간다
     *     (S14P31E103-511).
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

    /**
     * stored 가 자기 형식이 아니면 idempotent 무시 (S3 에 객체 자체가 없을 가능성). 옛 LocalImageStorage 시절 URL 을 가진 작품을
     * UI 에서 삭제해도 500 으로 깨지지 않도록 (S14P31E103-511).
     */
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
            // idempotent — 이미 사라진 객체에 대한 재시도는 정상 흐름
        } catch (S3Exception e) {
            log.warn("S3 이미지 삭제 실패 (bucket={}, key={}): {}", s3.bucket(), key, e.getMessage(), e);
            throw new BusinessException(StorageErrorCode.STORAGE_FAILURE);
        }
    }

    /**
     * SDK 가 만들어주는 객체 URL 에서 S3 key 추출. 두 형식 지원:
     *
     * <ul>
     *   <li>virtual-hosted (운영 기본): {@code https://<bucket>.s3.<region>.amazonaws.com/<key>} — path
     *       자체가 key
     *   <li>path-style (LocalStack 등 endpoint override 환경): {@code https://<host>/<bucket>/<key>} —
     *       path 첫 segment 가 bucket
     * </ul>
     *
     * <p>host 에 bucket prefix 가 붙었는지로 두 형식을 구분. 둘 다 아닌 형식 (옛 LocalImageStorage URL, DB 변조, 적대 입력 등)
     * 은 WARN 로그를 남기고 {@link Optional#empty()} 반환 — 호출자는 graceful 처리. 운영자는 WARN 양으로 stale 데이터 / 변조
     * 가능성을 모니터링 (S14P31E103-511).
     */
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

    private ImageFormat validateImage(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new BusinessException(StorageErrorCode.INVALID_IMAGE);
        }
        if (file.getSize() > MAX_IMAGE_BYTES) {
            throw new BusinessException(StorageErrorCode.PAYLOAD_TOO_LARGE);
        }
        String contentType = file.getContentType();
        if (contentType == null || !contentType.toLowerCase(Locale.ROOT).startsWith("image/")) {
            throw new BusinessException(StorageErrorCode.INVALID_IMAGE);
        }
        return detectMagicBytes(file);
    }

    private ImageFormat detectMagicBytes(MultipartFile file) {
        byte[] head;
        try (InputStream in = file.getInputStream()) {
            head = in.readNBytes(MAGIC_HEAD_SIZE);
        } catch (IOException e) {
            log.warn("magic-bytes 읽기 IO 실패: {}", e.getMessage(), e);
            throw new BusinessException(StorageErrorCode.STORAGE_FAILURE);
        }
        if (head.length < MAGIC_HEAD_SIZE) {
            throw new BusinessException(StorageErrorCode.INVALID_IMAGE);
        }
        if (isPng(head)) {
            return ImageFormat.PNG;
        }
        if (isJpeg(head)) {
            return ImageFormat.JPEG;
        }
        if (isGif(head)) {
            return ImageFormat.GIF;
        }
        if (isWebp(head)) {
            return ImageFormat.WEBP;
        }
        throw new BusinessException(StorageErrorCode.INVALID_IMAGE);
    }

    private static boolean isPng(byte[] h) {
        return h.length >= 8
                && (h[0] & 0xFF) == 0x89
                && h[1] == 0x50
                && h[2] == 0x4E
                && h[3] == 0x47
                && h[4] == 0x0D
                && h[5] == 0x0A
                && h[6] == 0x1A
                && h[7] == 0x0A;
    }

    private static boolean isJpeg(byte[] h) {
        return h.length >= 3
                && (h[0] & 0xFF) == 0xFF
                && (h[1] & 0xFF) == 0xD8
                && (h[2] & 0xFF) == 0xFF;
    }

    private static boolean isGif(byte[] h) {
        if (h.length < 6) {
            return false;
        }
        return h[0] == 'G'
                && h[1] == 'I'
                && h[2] == 'F'
                && h[3] == '8'
                && (h[4] == '7' || h[4] == '9')
                && h[5] == 'a';
    }

    private static boolean isWebp(byte[] h) {
        return h.length >= 12
                && h[0] == 'R'
                && h[1] == 'I'
                && h[2] == 'F'
                && h[3] == 'F'
                && h[8] == 'W'
                && h[9] == 'E'
                && h[10] == 'B'
                && h[11] == 'P';
    }

    private String extractExtension(String originalFilename) {
        if (originalFilename == null) {
            throw new BusinessException(StorageErrorCode.INVALID_IMAGE);
        }
        int dot = originalFilename.lastIndexOf('.');
        if (dot < 0 || dot == originalFilename.length() - 1) {
            throw new BusinessException(StorageErrorCode.INVALID_IMAGE);
        }
        String ext = originalFilename.substring(dot).toLowerCase(Locale.ROOT);
        if (!ALLOWED_EXTENSIONS.contains(ext)) {
            throw new BusinessException(StorageErrorCode.INVALID_IMAGE);
        }
        return ext;
    }

    private enum ImageFormat {
        PNG(".png", "image/png", Set.of(".png")),
        JPEG(".jpg", "image/jpeg", Set.of(".jpg", ".jpeg")),
        GIF(".gif", "image/gif", Set.of(".gif")),
        WEBP(".webp", "image/webp", Set.of(".webp"));

        private final String canonicalExtension;
        private final String mimeType;
        private final Set<String> acceptedExtensions;

        ImageFormat(String canonicalExtension, String mimeType, Set<String> acceptedExtensions) {
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
