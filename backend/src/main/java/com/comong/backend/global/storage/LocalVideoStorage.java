package com.comong.backend.global.storage;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

import com.comong.backend.global.exception.BusinessException;

import lombok.extern.slf4j.Slf4j;

/**
 * 로컬 디스크에 영상을 저장하는 {@link VideoStorage} 구현체. {@link LocalImageStorage} 와 패턴 동일.
 *
 * <p><b>업로드 검증 — 4중 방어</b>:
 *
 * <ol>
 *   <li>{@code Content-Type} 이 {@code video/*} 인지 (1차)
 *   <li>실제 binary 의 magic bytes 가 MP4 / WebM 시그니처와 일치하는지 (2차)
 *   <li>매직바이트로 검출한 포맷과 파일명 확장자가 일치하는지 (3차)
 *   <li>확장자가 {@link #ALLOWED_EXTENSIONS} 에 포함되는지 (4차)
 * </ol>
 *
 * <p><b>파일 크기</b>: 100MB 한도. multipart 단계에서 더 큰 파일은 {@code MaxUploadSizeExceededException} → {@code
 * S-003 PAYLOAD_TOO_LARGE} 로 매핑된다. multipart 한도가 그보다 더 크게 설정돼 들어오는 경우 (다른 스토리지의 한도에 맞춰 글로벌 값을 잡았을
 * 때) 본 클래스가 자체 한도를 다시 한 번 강제한다.
 *
 * <p><b>저장 경로</b>: {@code <upload-dir>/videos/<UUID>.<ext>}. 이미지(flat) 와 분리해 ops/감사 측면 가독성 확보. S3
 * 구현체에서도 같은 prefix 를 키 이름에 그대로 적용 가능.
 *
 * <p><b>접근 통제</b>: 이미지와 동일한 정책 — UUID 기반 추측 곤란 + public read. 비공개 영상 권한 체크는 별도 이슈.
 */
@Slf4j
@Component
@ConditionalOnProperty(name = "storage.type", havingValue = "local", matchIfMissing = true)
public class LocalVideoStorage implements VideoStorage {

    /** 저장 허용 확장자. */
    private static final Set<String> ALLOWED_EXTENSIONS = Set.of(".mp4", ".webm");

    /** magic-bytes 검사 시 읽을 헤더 크기 — MP4 의 ftyp box 가 0~7 byte 까지 필요. */
    private static final int MAGIC_HEAD_SIZE = 12;

    /** 자체 한도. multipart 글로벌 한도가 더 큰 경우의 보조 차단. */
    private static final long MAX_VIDEO_BYTES = 100L * 1024 * 1024;

    /** 업로드 dir 하위에 영상이 들어가는 sub-path. */
    private static final String VIDEOS_SUBPATH = "videos";

    private final StorageProperties properties;

    private final String contextPath;

    public LocalVideoStorage(
            StorageProperties properties,
            @Value("${server.servlet.context-path:}") String contextPath) {
        this.properties = properties;
        this.contextPath = contextPath == null ? "" : contextPath;
    }

    @Override
    public StoredVideo upload(MultipartFile file) {
        VideoFormat detectedFormat = validateVideo(file);
        String originalExtension = extractExtension(file.getOriginalFilename());
        if (!detectedFormat.matchesExtension(originalExtension)) {
            throw new BusinessException(StorageErrorCode.INVALID_VIDEO);
        }

        StorageProperties.Local local = properties.local();
        String filename = UUID.randomUUID() + detectedFormat.canonicalExtension();
        Path videosDir = Path.of(local.uploadDir()).toAbsolutePath().resolve(VIDEOS_SUBPATH);
        Path target = videosDir.resolve(filename);

        try {
            Files.createDirectories(videosDir);
            file.transferTo(target);
        } catch (IOException e) {
            log.warn("영상 업로드 IO 실패 (target={}): {}", target, e.getMessage(), e);
            throw new BusinessException(StorageErrorCode.STORAGE_FAILURE);
        }

        return new StoredVideo(
                contextPath + local.publicUrlPrefix() + "/" + VIDEOS_SUBPATH + "/" + filename);
    }

    @Override
    public void delete(String url) {
        if (url == null || url.isBlank()) {
            return;
        }
        String filename = url.substring(url.lastIndexOf('/') + 1);
        if (filename.isBlank()) {
            return;
        }
        if (filename.contains("/")
                || filename.contains("\\")
                || filename.contains("..")
                || filename.equals(".")) {
            log.warn("영상 저장소 URL 무결성 위반 — 의심 파일명: {}", filename);
            throw new BusinessException(StorageErrorCode.STORAGE_FAILURE);
        }
        Path videosDir =
                Path.of(properties.local().uploadDir())
                        .toAbsolutePath()
                        .resolve(VIDEOS_SUBPATH)
                        .normalize();
        Path target = videosDir.resolve(filename).normalize();
        if (!target.startsWith(videosDir)) {
            log.warn("영상 저장소 URL 무결성 위반 — 정규화 후 videosDir 외부: {}", target);
            throw new BusinessException(StorageErrorCode.STORAGE_FAILURE);
        }
        try {
            Files.deleteIfExists(target);
        } catch (IOException e) {
            log.warn("영상 삭제 IO 실패 (target={}): {}", target, e.getMessage(), e);
            throw new BusinessException(StorageErrorCode.STORAGE_FAILURE);
        }
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

    /**
     * 첫 {@value #MAGIC_HEAD_SIZE} 바이트로 MP4 / WebM 시그니처를 대조. {@link MultipartFile#getInputStream()}
     * 은 새 스트림을 반환하므로, 검증 후 {@link MultipartFile#transferTo} 가 별도 동작.
     */
    private VideoFormat detectMagicBytes(MultipartFile file) {
        byte[] head;
        try (InputStream in = file.getInputStream()) {
            head = in.readNBytes(MAGIC_HEAD_SIZE);
        } catch (IOException e) {
            log.warn("영상 magic-bytes 읽기 IO 실패: {}", e.getMessage(), e);
            throw new BusinessException(StorageErrorCode.STORAGE_FAILURE);
        }
        if (head.length < MAGIC_HEAD_SIZE) {
            // truncated — 시그니처만 들어있고 실제 데이터 없음
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

    /** MP4: 4번째 바이트부터 "ftyp" (66 74 79 70). 앞 4바이트는 box size 라 검사하지 않음. */
    private static boolean isMp4(byte[] h) {
        return h.length >= 8 && h[4] == 'f' && h[5] == 't' && h[6] == 'y' && h[7] == 'p';
    }

    /** WebM (EBML 헤더): 1A 45 DF A3. 정밀하게는 DocType 검사가 필요하지만 MVP 에선 EBML 매직만 확인. */
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
        MP4(".mp4", Set.of(".mp4")),
        WEBM(".webm", Set.of(".webm"));

        private final String canonicalExtension;
        private final Set<String> acceptedExtensions;

        VideoFormat(String canonicalExtension, Set<String> acceptedExtensions) {
            this.canonicalExtension = canonicalExtension;
            this.acceptedExtensions = acceptedExtensions;
        }

        boolean matchesExtension(String extension) {
            return acceptedExtensions.contains(extension);
        }

        String canonicalExtension() {
            return canonicalExtension;
        }
    }
}
