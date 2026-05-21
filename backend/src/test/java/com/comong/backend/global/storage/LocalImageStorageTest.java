package com.comong.backend.global.storage;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import com.comong.backend.global.exception.BusinessException;

class LocalImageStorageTest {

    /** PNG signature 8 byte + 4 byte filler — total 12 byte (MAGIC_HEAD_SIZE 충족) */
    private static final byte[] PNG_BYTES = {
        (byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0
    };

    /** JPEG SOI 3 byte + 9 byte filler — total 12 byte */
    private static final byte[] JPEG_BYTES = {
        (byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0, 0, 0, 0, 0, 0, 0, 0, 0
    };

    @TempDir Path uploadDir;

    @Test
    void storesJpegWithCanonicalJpgExtension() {
        LocalImageStorage storage = storage();
        MultipartFile file =
                new MockMultipartFile("file", "painting.jpeg", "image/jpeg", JPEG_BYTES);

        StoredImage storedImage = storage.upload(file);

        assertThat(storedImage.url()).startsWith("/api/v1/uploads/");
        assertThat(storedImage.url()).endsWith(".jpg");
        String filename = storedImage.url().substring(storedImage.url().lastIndexOf('/') + 1);
        assertThat(Files.exists(uploadDir.resolve(filename))).isTrue();
    }

    @Test
    void rejectsWhenMagicBytesDoNotMatchExtension() {
        LocalImageStorage storage = storage();
        MultipartFile file = new MockMultipartFile("file", "painting.jpg", "image/png", PNG_BYTES);

        assertThatThrownBy(() -> storage.upload(file))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(StorageErrorCode.INVALID_IMAGE);
    }

    @Test
    void rejectsHtmlMasqueradingAsPng() {
        LocalImageStorage storage = storage();
        MultipartFile file =
                new MockMultipartFile(
                        "file",
                        "painting.png",
                        "image/png",
                        "<html></html>".getBytes(StandardCharsets.UTF_8));

        assertThatThrownBy(() -> storage.upload(file))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(StorageErrorCode.INVALID_IMAGE);
    }

    @Test
    void rejectsTruncatedImage() {
        // 8 byte PNG 시그니처만 — 시그니처 매칭은 가능하지만 실제 이미지 데이터가 없음.
        // 보안 위협은 아니지만 입력 검증 정확성 위해 거부.
        LocalImageStorage storage = storage();
        byte[] truncated = {(byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A};
        MultipartFile file = new MockMultipartFile("file", "tiny.png", "image/png", truncated);

        assertThatThrownBy(() -> storage.upload(file))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(StorageErrorCode.INVALID_IMAGE);
    }

    @Test
    void deleteRemovesUploadedFile() {
        LocalImageStorage storage = storage();
        MultipartFile file = new MockMultipartFile("file", "painting.png", "image/png", PNG_BYTES);
        StoredImage stored = storage.upload(file);
        String filename = stored.url().substring(stored.url().lastIndexOf('/') + 1);
        assertThat(Files.exists(uploadDir.resolve(filename))).isTrue();

        storage.delete(stored.url());

        assertThat(Files.exists(uploadDir.resolve(filename))).isFalse();
    }

    @Test
    void deleteRejectsFilenameWithTraversalCharacters() {
        LocalImageStorage storage = storage();

        // delete() 는 url 의 lastIndexOf('/') 뒤 부분을 filename 으로 취하므로,
        // 방어가 의미 있는 케이스는 그 filename 자체에 dotdot/백슬래시가 포함되는 경우다.
        // 비정상 URL 은 사용자 입력이 아닌 데이터 무결성 이슈라 STORAGE_FAILURE (500) 로 분류.

        // 슬래시 이후에 dotdot 가 붙은 케이스
        assertThatThrownBy(() -> storage.delete("/uploads/..hidden"))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(StorageErrorCode.STORAGE_FAILURE);

        // 슬래시 자체가 없어 url 전체가 filename 이 되는 케이스
        assertThatThrownBy(() -> storage.delete("..foo"))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(StorageErrorCode.STORAGE_FAILURE);

        // 백슬래시 (윈도우 경로 구분자) 포함
        assertThatThrownBy(() -> storage.delete("foo\\bar"))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(StorageErrorCode.STORAGE_FAILURE);
    }

    private LocalImageStorage storage() {
        StorageProperties properties =
                new StorageProperties(
                        StorageProperties.Type.LOCAL,
                        new StorageProperties.Local(uploadDir.toString(), "/uploads"),
                        null);
        return new LocalImageStorage(properties, "/api/v1");
    }
}
