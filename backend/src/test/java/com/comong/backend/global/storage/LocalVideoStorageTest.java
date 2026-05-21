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

class LocalVideoStorageTest {

    /** MP4 ftyp box at offset 4. 12 byte 채움. */
    private static final byte[] MP4_BYTES = {0, 0, 0, 0x20, 'f', 't', 'y', 'p', 'i', 's', 'o', 'm'};

    /** WebM EBML 헤더 + filler. 12 byte. */
    private static final byte[] WEBM_BYTES = {
        (byte) 0x1A, (byte) 0x45, (byte) 0xDF, (byte) 0xA3, 0, 0, 0, 0, 0, 0, 0, 0
    };

    @TempDir Path uploadDir;

    @Test
    void storesMp4UnderVideosSubpath() {
        LocalVideoStorage storage = storage();
        MultipartFile file = new MockMultipartFile("file", "demo.mp4", "video/mp4", MP4_BYTES);

        StoredVideo stored = storage.upload(file);

        assertThat(stored.url()).startsWith("/api/v1/uploads/videos/");
        assertThat(stored.url()).endsWith(".mp4");
        String filename = stored.url().substring(stored.url().lastIndexOf('/') + 1);
        assertThat(Files.exists(uploadDir.resolve("videos").resolve(filename))).isTrue();
    }

    @Test
    void storesWebm() {
        LocalVideoStorage storage = storage();
        MultipartFile file = new MockMultipartFile("file", "demo.webm", "video/webm", WEBM_BYTES);

        StoredVideo stored = storage.upload(file);

        assertThat(stored.url()).endsWith(".webm");
    }

    @Test
    void rejectsNonVideoContentType() {
        LocalVideoStorage storage = storage();
        MultipartFile file = new MockMultipartFile("file", "demo.mp4", "image/png", MP4_BYTES);

        assertThatThrownBy(() -> storage.upload(file))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(StorageErrorCode.INVALID_VIDEO);
    }

    @Test
    void rejectsWhenMagicBytesDoNotMatchExtension() {
        LocalVideoStorage storage = storage();
        MultipartFile file = new MockMultipartFile("file", "demo.webm", "video/webm", MP4_BYTES);

        assertThatThrownBy(() -> storage.upload(file))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(StorageErrorCode.INVALID_VIDEO);
    }

    @Test
    void rejectsHtmlMasqueradingAsMp4() {
        LocalVideoStorage storage = storage();
        MultipartFile file =
                new MockMultipartFile(
                        "file",
                        "demo.mp4",
                        "video/mp4",
                        "<html></html>".getBytes(StandardCharsets.UTF_8));

        assertThatThrownBy(() -> storage.upload(file))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(StorageErrorCode.INVALID_VIDEO);
    }

    @Test
    void rejectsTruncatedFile() {
        LocalVideoStorage storage = storage();
        byte[] truncated = {0, 0, 0, 0x20, 'f', 't', 'y'}; // 7 byte
        MultipartFile file = new MockMultipartFile("file", "tiny.mp4", "video/mp4", truncated);

        assertThatThrownBy(() -> storage.upload(file))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(StorageErrorCode.INVALID_VIDEO);
    }

    @Test
    void deleteRemovesUploadedFile() {
        LocalVideoStorage storage = storage();
        MultipartFile file = new MockMultipartFile("file", "demo.mp4", "video/mp4", MP4_BYTES);
        StoredVideo stored = storage.upload(file);
        String filename = stored.url().substring(stored.url().lastIndexOf('/') + 1);
        Path target = uploadDir.resolve("videos").resolve(filename);
        assertThat(Files.exists(target)).isTrue();

        storage.delete(stored.url());

        assertThat(Files.exists(target)).isFalse();
    }

    @Test
    void deleteIsIdempotentWhenFileMissing() {
        LocalVideoStorage storage = storage();

        // 존재하지 않는 파일에 대한 delete 는 조용히 통과.
        storage.delete("/api/v1/uploads/videos/non-existent.mp4");
    }

    @Test
    void deleteRejectsFilenameWithTraversalCharacters() {
        LocalVideoStorage storage = storage();

        assertThatThrownBy(() -> storage.delete("/uploads/videos/..hidden"))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(StorageErrorCode.STORAGE_FAILURE);

        assertThatThrownBy(() -> storage.delete("..foo"))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(StorageErrorCode.STORAGE_FAILURE);

        assertThatThrownBy(() -> storage.delete("foo\\bar"))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(StorageErrorCode.STORAGE_FAILURE);
    }

    private LocalVideoStorage storage() {
        StorageProperties properties =
                new StorageProperties(
                        StorageProperties.Type.LOCAL,
                        new StorageProperties.Local(uploadDir.toString(), "/uploads"),
                        null);
        return new LocalVideoStorage(properties, "/api/v1");
    }
}
