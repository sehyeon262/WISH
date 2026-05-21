package com.comong.backend.global.storage;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;
import org.testcontainers.containers.localstack.LocalStackContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import com.comong.backend.global.exception.BusinessException;

import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.model.CreateBucketRequest;
import software.amazon.awssdk.services.s3.model.HeadObjectRequest;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;

/**
 * S3VideoStorage 단위 테스트. {@link S3ImageStorageTest} 와 같은 LocalStack 패턴, 영상 매직바이트 (MP4/WebM) 검증 추가.
 */
@Testcontainers
class S3VideoStorageTest {

    /** MP4 ftyp box at offset 4. 12 byte 채움 (MAGIC_HEAD_SIZE 충족). */
    private static final byte[] MP4_BYTES = {0, 0, 0, 0x20, 'f', 't', 'y', 'p', 'i', 's', 'o', 'm'};

    /** WebM EBML 헤더 + filler. 12 byte. */
    private static final byte[] WEBM_BYTES = {
        (byte) 0x1A, (byte) 0x45, (byte) 0xDF, (byte) 0xA3, 0, 0, 0, 0, 0, 0, 0, 0
    };

    private static final String BUCKET = "test-video-bucket";
    private static final String PREFIX = "test";

    @Container
    static LocalStackContainer localstack =
            new LocalStackContainer(DockerImageName.parse("localstack/localstack:3.8"))
                    .withServices(LocalStackContainer.Service.S3);

    private static S3Client s3Client;
    private static S3Presigner s3Presigner;
    private static StorageProperties properties;

    @BeforeAll
    static void setUp() {
        URI endpoint = localstack.getEndpointOverride(LocalStackContainer.Service.S3);
        StaticCredentialsProvider credentials =
                StaticCredentialsProvider.create(
                        AwsBasicCredentials.create(
                                localstack.getAccessKey(), localstack.getSecretKey()));
        S3Configuration config = S3Configuration.builder().pathStyleAccessEnabled(true).build();

        s3Client =
                S3Client.builder()
                        .endpointOverride(endpoint)
                        .credentialsProvider(credentials)
                        .region(Region.of(localstack.getRegion()))
                        .serviceConfiguration(config)
                        .build();
        s3Presigner =
                S3Presigner.builder()
                        .endpointOverride(endpoint)
                        .credentialsProvider(credentials)
                        .region(Region.of(localstack.getRegion()))
                        .serviceConfiguration(config)
                        .build();

        s3Client.createBucket(CreateBucketRequest.builder().bucket(BUCKET).build());

        properties =
                new StorageProperties(
                        StorageProperties.Type.S3,
                        null,
                        new StorageProperties.S3(BUCKET, localstack.getRegion(), PREFIX, 60));
    }

    @AfterAll
    static void tearDown() {
        if (s3Client != null) s3Client.close();
        if (s3Presigner != null) s3Presigner.close();
    }

    private static String stripBucketSegment(String pathWithoutLeadingSlash) {
        if (pathWithoutLeadingSlash.startsWith(BUCKET + "/")) {
            return pathWithoutLeadingSlash.substring(BUCKET.length() + 1);
        }
        return pathWithoutLeadingSlash;
    }

    @Test
    void uploadStoresMp4UnderVideosPrefix() {
        S3VideoStorage storage = new S3VideoStorage(properties, s3Client, s3Presigner);
        MultipartFile file = new MockMultipartFile("file", "demo.mp4", "video/mp4", MP4_BYTES);

        StoredVideo stored = storage.upload(file);

        assertThat(stored.url())
                .contains(BUCKET)
                .contains("/" + PREFIX + "/videos/")
                .endsWith(".mp4");
        String key = stripBucketSegment(URI.create(stored.url()).getPath().substring(1));
        assertThatCode(
                        () ->
                                s3Client.headObject(
                                        HeadObjectRequest.builder()
                                                .bucket(BUCKET)
                                                .key(key)
                                                .build()))
                .doesNotThrowAnyException();
    }

    @Test
    void uploadStoresWebm() {
        S3VideoStorage storage = new S3VideoStorage(properties, s3Client, s3Presigner);
        MultipartFile file = new MockMultipartFile("file", "demo.webm", "video/webm", WEBM_BYTES);

        StoredVideo stored = storage.upload(file);

        assertThat(stored.url()).endsWith(".webm").contains("/" + PREFIX + "/videos/");
    }

    @Test
    void toPublicUrlReturnsWorkingPresignedUrl() throws IOException, InterruptedException {
        S3VideoStorage storage = new S3VideoStorage(properties, s3Client, s3Presigner);
        MultipartFile file = new MockMultipartFile("file", "demo.mp4", "video/mp4", MP4_BYTES);
        StoredVideo stored = storage.upload(file);

        String publicUrl = storage.toPublicUrl(stored.url());

        assertThat(publicUrl).contains("X-Amz-Signature");
        HttpResponse<byte[]> resp =
                HttpClient.newHttpClient()
                        .send(
                                HttpRequest.newBuilder(URI.create(publicUrl)).GET().build(),
                                HttpResponse.BodyHandlers.ofByteArray());
        assertThat(resp.statusCode()).isEqualTo(200);
        assertThat(resp.body()).isEqualTo(MP4_BYTES);
    }

    @Test
    void deleteRemovesObjectAndIsIdempotent() {
        S3VideoStorage storage = new S3VideoStorage(properties, s3Client, s3Presigner);
        MultipartFile file = new MockMultipartFile("file", "demo.mp4", "video/mp4", MP4_BYTES);
        StoredVideo stored = storage.upload(file);
        String key = stripBucketSegment(URI.create(stored.url()).getPath().substring(1));

        storage.delete(stored.url());

        assertThatThrownBy(
                        () ->
                                s3Client.headObject(
                                        HeadObjectRequest.builder()
                                                .bucket(BUCKET)
                                                .key(key)
                                                .build()))
                .isInstanceOf(NoSuchKeyException.class);
        assertThatCode(() -> storage.delete(stored.url())).doesNotThrowAnyException();
    }

    @Test
    void rejectsNonVideoContentType() {
        S3VideoStorage storage = new S3VideoStorage(properties, s3Client, s3Presigner);
        MultipartFile file = new MockMultipartFile("file", "demo.mp4", "image/png", MP4_BYTES);

        assertThatThrownBy(() -> storage.upload(file))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(StorageErrorCode.INVALID_VIDEO);
    }

    @Test
    void rejectsWhenMagicBytesDoNotMatchExtension() {
        S3VideoStorage storage = new S3VideoStorage(properties, s3Client, s3Presigner);
        // MP4 매직바이트인데 webm 확장자
        MultipartFile file = new MockMultipartFile("file", "demo.webm", "video/webm", MP4_BYTES);

        assertThatThrownBy(() -> storage.upload(file))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(StorageErrorCode.INVALID_VIDEO);
    }

    @Test
    void rejectsTruncatedVideo() {
        S3VideoStorage storage = new S3VideoStorage(properties, s3Client, s3Presigner);
        // ftyp 시그니처만 있고 데이터 없음 (8 byte)
        byte[] truncated = {0, 0, 0, 0x20, 'f', 't', 'y', 'p'};
        MultipartFile file = new MockMultipartFile("file", "tiny.mp4", "video/mp4", truncated);

        assertThatThrownBy(() -> storage.upload(file))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(StorageErrorCode.INVALID_VIDEO);
    }

    @Test
    void deleteIgnoresBlankUrl() {
        S3VideoStorage storage = new S3VideoStorage(properties, s3Client, s3Presigner);

        assertThatCode(() -> storage.delete(null)).doesNotThrowAnyException();
        assertThatCode(() -> storage.delete("")).doesNotThrowAnyException();
        assertThatCode(() -> storage.delete("   ")).doesNotThrowAnyException();
    }

    @Test
    void toPublicUrlReturnsNullForLegacyLocalStorageUrl() {
        // S14P31E103-511 — 옛 LocalVideoStorage URL 이 DB 에 남아있는 케이스 graceful 처리.
        S3VideoStorage storage = new S3VideoStorage(properties, s3Client, s3Presigner);

        String legacyUrl = "/api/v1/uploads/videos/abc123.mp4";
        assertThat(storage.toPublicUrl(legacyUrl)).isNull();
    }

    @Test
    void deleteIsIdempotentForLegacyLocalStorageUrl() {
        S3VideoStorage storage = new S3VideoStorage(properties, s3Client, s3Presigner);

        String legacyUrl = "/api/v1/uploads/videos/abc123.mp4";
        assertThatCode(() -> storage.delete(legacyUrl)).doesNotThrowAnyException();
    }
}
