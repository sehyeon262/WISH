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
 * 로컬 디스크에 이미지를 저장하는 {@link ImageStorage} 구현체.
 *
 * <p>파일명 충돌 방지를 위해 UUID 기반 이름을 생성한다.
 *
 * <p><b>업로드 검증 — 4중 방어</b>:
 *
 * <ol>
 *   <li>{@code Content-Type} 이 {@code image/*} 인지 (1차, 클라이언트 헤더라 신뢰도 낮음)
 *   <li>실제 binary 의 magic bytes 가 PNG/JPEG/GIF/WEBP 시그니처와 일치하는지 (2차)
 *   <li>매직바이트로 검출한 포맷과 파일명 확장자가 일치하는지 (3차, mislabeled 차단)
 *   <li>확장자가 {@link #ALLOWED_EXTENSIONS} 에 포함되는지 (4차, 정적 서빙 시 실행 가능 콘텐츠 차단)
 * </ol>
 *
 * <p>모든 검증 실패는 {@link StorageErrorCode#INVALID_IMAGE} 로, IO 실패는 {@link
 * StorageErrorCode#STORAGE_FAILURE} 로 매핑된다.
 *
 * <p><b>접근 통제</b>: 현재는 모든 업로드 파일이 정적 리소스 핸들러를 통해 누구나 URL 만 알면 접근 가능하다. UUID 기반 파일명이 추측을 어렵게는 하지만,
 * 비공개 작품 이미지에 대한 권한 체크는 제공하지 않는다. 인증된 다운로드 컨트롤러로의 전환은 추후 별도 이슈에서 결정.
 */
@Slf4j
@Component
@ConditionalOnProperty(name = "storage.type", havingValue = "local", matchIfMissing = true)
public class LocalImageStorage implements ImageStorage {

    /** 저장 허용 확장자 (white-list). */
    private static final Set<String> ALLOWED_EXTENSIONS =
            Set.of(".png", ".jpg", ".jpeg", ".webp", ".gif");

    /** magic-bytes 검사 시 읽을 헤더 크기 — RIFF/WEBP 가 12 byte 라 가장 큼. */
    private static final int MAGIC_HEAD_SIZE = 12;

    /**
     * 이미지 자체 한도. multipart 글로벌 한도가 영상(100MB)을 위해 더 크게 잡혀 있어도, 이미지는 자체적으로 10MB 를 강제한다
     * (S14P31E103-308).
     */
    private static final long MAX_IMAGE_BYTES = 10L * 1024 * 1024;

    private final StorageProperties properties;

    /** servlet context-path. {@code application.yaml} 의 {@code server.servlet.context-path} 값. */
    private final String contextPath;

    public LocalImageStorage(
            StorageProperties properties,
            @Value("${server.servlet.context-path:}") String contextPath) {
        this.properties = properties;
        this.contextPath = contextPath == null ? "" : contextPath;
    }

    @Override
    public StoredImage upload(MultipartFile file) {
        ImageFormat detectedFormat = validateImage(file);
        String originalExtension = extractExtension(file.getOriginalFilename());
        if (!detectedFormat.matchesExtension(originalExtension)) {
            throw new BusinessException(StorageErrorCode.INVALID_IMAGE);
        }

        StorageProperties.Local local = properties.local();
        String filename = UUID.randomUUID() + detectedFormat.canonicalExtension();
        Path target = Path.of(local.uploadDir()).toAbsolutePath().resolve(filename);

        try {
            Files.createDirectories(target.getParent());
            file.transferTo(target);
        } catch (IOException e) {
            log.warn("이미지 업로드 IO 실패 (target={}): {}", target, e.getMessage(), e);
            throw new BusinessException(StorageErrorCode.STORAGE_FAILURE);
        }

        return new StoredImage(contextPath + local.publicUrlPrefix() + "/" + filename);
    }

    /**
     * 저장된 이미지를 제거한다. {@code idempotent} 시맨틱 — 파일이 존재하지 않으면 조용히 무시한다.
     *
     * <p>다만 {@code url} 자체가 정상 흐름에서 발생할 수 없는 형태일 때 (filename 부분에 경로 구분자/dotdot/단일 dot 포함) 는 {@link
     * StorageErrorCode#STORAGE_FAILURE} 로 거부한다. {@code upload} 가 반환한 URL 만 들어오는 정상 흐름에선 발생 안 함 — DB
     * 변조 등 데이터 무결성 위반의 가드. IO 실패도 같은 코드로 매핑.
     *
     * <p>{@code url} 이 null 이거나 빈 문자열일 때는 NOT_FOUND 와 동등하게 무시한다 (호출자가 미리 검증할 책임은 없음).
     *
     * @param url upload 가 반환했던 URL
     * @throws BusinessException STORAGE_FAILURE — filename 무결성 위반 / IO 실패 시
     */
    @Override
    public void delete(String url) {
        if (url == null || url.isBlank()) {
            return;
        }
        String filename = url.substring(url.lastIndexOf('/') + 1);
        if (filename.isBlank()) {
            return;
        }
        // Path traversal 방어: filename 자체에서 경로 구분자/dotdot/단일 dot 차단.
        if (filename.contains("/")
                || filename.contains("\\")
                || filename.contains("..")
                || filename.equals(".")) {
            log.warn("저장소 URL 무결성 위반 — 의심 파일명: {}", filename);
            throw new BusinessException(StorageErrorCode.STORAGE_FAILURE);
        }
        // 한 단계 더 — 정규화 후에도 uploadRoot 하위인지 확인 (defense in depth).
        Path uploadRoot = Path.of(properties.local().uploadDir()).toAbsolutePath().normalize();
        Path target = uploadRoot.resolve(filename).normalize();
        if (!target.startsWith(uploadRoot)) {
            log.warn("저장소 URL 무결성 위반 — 정규화 후 uploadRoot 외부: {}", target);
            throw new BusinessException(StorageErrorCode.STORAGE_FAILURE);
        }
        try {
            Files.deleteIfExists(target);
        } catch (IOException e) {
            log.warn("이미지 삭제 IO 실패 (target={}): {}", target, e.getMessage(), e);
            throw new BusinessException(StorageErrorCode.STORAGE_FAILURE);
        }
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

    /**
     * 파일의 첫 {@value #MAGIC_HEAD_SIZE} 바이트를 읽어 알려진 이미지 시그니처와 대조한다. PNG / JPEG / GIF87a / GIF89a /
     * WEBP(RIFF) 만 통과시킨다. {@link MultipartFile#getInputStream()} 은 새 스트림을 반환하므로, 검증 후 {@link
     * MultipartFile#transferTo} 가 별도로 동작한다.
     */
    private ImageFormat detectMagicBytes(MultipartFile file) {
        byte[] head;
        try (InputStream in = file.getInputStream()) {
            head = in.readNBytes(MAGIC_HEAD_SIZE);
        } catch (IOException e) {
            log.warn("magic-bytes 읽기 IO 실패: {}", e.getMessage(), e);
            throw new BusinessException(StorageErrorCode.STORAGE_FAILURE);
        }
        // truncated 파일 차단 — 시그니처만 들어있고 실제 이미지 데이터는 없는 케이스 (8 byte PNG 헤더만 있는 파일 등)
        // 보안 위협은 아니지만 입력 검증 정확성 위해 거부.
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

    /** PNG: 89 50 4E 47 0D 0A 1A 0A */
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

    /** JPEG: FF D8 FF (네번째 바이트는 SOI 마커별로 다양하므로 검사하지 않음) */
    private static boolean isJpeg(byte[] h) {
        return h.length >= 3
                && (h[0] & 0xFF) == 0xFF
                && (h[1] & 0xFF) == 0xD8
                && (h[2] & 0xFF) == 0xFF;
    }

    /** GIF87a / GIF89a: "GIF87a" 또는 "GIF89a" */
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

    /** WEBP: "RIFF" + (4 byte 크기) + "WEBP" */
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

    /**
     * 원본 파일명에서 확장자를 추출하고 {@link #ALLOWED_EXTENSIONS} 와 대조한다. 누락/허용 외 확장자는 모두 거부 — 거짓 Content-Type
     * 헤더로 검증을 우회하더라도 저장 파일이 실행 가능한 형식이 되지 않도록 강제한다.
     */
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
        PNG(".png", Set.of(".png")),
        JPEG(".jpg", Set.of(".jpg", ".jpeg")),
        GIF(".gif", Set.of(".gif")),
        WEBP(".webp", Set.of(".webp"));

        private final String canonicalExtension;
        private final Set<String> acceptedExtensions;

        ImageFormat(String canonicalExtension, Set<String> acceptedExtensions) {
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
