package com.comong.backend.global.storage;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

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
 * S3ImageStorage 단위 테스트. LocalStack 컨테이너로 실제 S3 API 호출을 검증한다 (Mock 보다 회귀 안정성 ↑).
 *
 * <p>presigned URL 검증은 LocalStack 의 endpoint override 가 필요해서 path-style 로 강제 — 운영 SDK 기본 (virtual
 * hosted) 와는 다르지만, 발급/만료/HTTP 200 verification 은 같은 코드 경로를 탄다.
 */
@Testcontainers
class S3ImageStorageTest {

    /** PNG signature 8 byte + 4 byte filler — total 12 byte (MAGIC_HEAD_SIZE 충족) */
    private static final byte[] PNG_BYTES = {
        (byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0
    };

    private static final String BUCKET = "test-bucket";
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
        // path-style: LocalStack 은 virtual-hosted 도메인을 자동 라우팅하지 못하므로 명시적으로 켠다.
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

    @Test
    void uploadStoresObjectAndReturnsPermanentUrl() {
        S3ImageStorage storage = new S3ImageStorage(properties, s3Client, s3Presigner);
        MultipartFile file = new MockMultipartFile("file", "picture.png", "image/png", PNG_BYTES);

        StoredImage stored = storage.upload(file);

        assertThat(stored.url()).contains(BUCKET).contains("/" + PREFIX + "/").endsWith(".png");
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

    /** path-style URL 에서는 path 의 첫 segment 가 bucket — 그 부분을 떼어내고 순수 key 만 남긴다. */
    private static String stripBucketSegment(String pathWithoutLeadingSlash) {
        if (pathWithoutLeadingSlash.startsWith(BUCKET + "/")) {
            return pathWithoutLeadingSlash.substring(BUCKET.length() + 1);
        }
        return pathWithoutLeadingSlash;
    }

    @Test
    void toPublicUrlReturnsWorkingPresignedUrl() throws IOException, InterruptedException {
        S3ImageStorage storage = new S3ImageStorage(properties, s3Client, s3Presigner);
        MultipartFile file = new MockMultipartFile("file", "picture.png", "image/png", PNG_BYTES);
        StoredImage stored = storage.upload(file);

        String publicUrl = storage.toPublicUrl(stored.url());

        assertThat(publicUrl).contains("X-Amz-Signature");
        // presigned URL 로 GET 시 200 확인 — bucket 이 private 이라도 presigned 면 통과
        HttpResponse<byte[]> resp =
                HttpClient.newHttpClient()
                        .send(
                                HttpRequest.newBuilder(URI.create(publicUrl)).GET().build(),
                                HttpResponse.BodyHandlers.ofByteArray());
        assertThat(resp.statusCode()).isEqualTo(200);
        assertThat(resp.body()).isEqualTo(PNG_BYTES);
    }

    @Test
    void deleteRemovesObjectAndIsIdempotent() {
        S3ImageStorage storage = new S3ImageStorage(properties, s3Client, s3Presigner);
        MultipartFile file = new MockMultipartFile("file", "picture.png", "image/png", PNG_BYTES);
        StoredImage stored = storage.upload(file);
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
        // 두 번째 delete 도 idempotent
        assertThatCode(() -> storage.delete(stored.url())).doesNotThrowAnyException();
    }

    @Test
    void rejectsWhenMagicBytesDoNotMatchExtension() {
        S3ImageStorage storage = new S3ImageStorage(properties, s3Client, s3Presigner);
        // PNG 시그니처를 jpg 확장자로 위장
        MultipartFile file = new MockMultipartFile("file", "fake.jpg", "image/jpeg", PNG_BYTES);

        assertThatThrownBy(() -> storage.upload(file))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(StorageErrorCode.INVALID_IMAGE);
    }

    @Test
    void rejectsHtmlMasqueradingAsPng() {
        S3ImageStorage storage = new S3ImageStorage(properties, s3Client, s3Presigner);
        MultipartFile file =
                new MockMultipartFile(
                        "file",
                        "fake.png",
                        "image/png",
                        ("<html></html>" + "x".repeat(20)).getBytes(StandardCharsets.UTF_8));

        assertThatThrownBy(() -> storage.upload(file))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(StorageErrorCode.INVALID_IMAGE);
    }

    @Test
    void rejectsTruncatedImage() {
        S3ImageStorage storage = new S3ImageStorage(properties, s3Client, s3Presigner);
        byte[] truncated = {(byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A};
        MultipartFile file = new MockMultipartFile("file", "tiny.png", "image/png", truncated);

        assertThatThrownBy(() -> storage.upload(file))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(StorageErrorCode.INVALID_IMAGE);
    }

    @Test
    void deleteIgnoresBlankUrl() {
        S3ImageStorage storage = new S3ImageStorage(properties, s3Client, s3Presigner);

        assertThatCode(() -> storage.delete(null)).doesNotThrowAnyException();
        assertThatCode(() -> storage.delete("")).doesNotThrowAnyException();
        assertThatCode(() -> storage.delete("   ")).doesNotThrowAnyException();
    }

    @Test
    void toPublicUrlReturnsNullForLegacyLocalStorageUrl() {
        // S14P31E103-511 — #493 머지 후 dev 에 옛 LocalImageStorage URL 이 DB 에 남아있는 케이스.
        // toPublicUrl 이 예외 던지지 않고 null 반환해서 응답이 500 으로 깨지지 않게 한다.
        S3ImageStorage storage = new S3ImageStorage(properties, s3Client, s3Presigner);

        String legacyUrl = "/api/v1/uploads/0fd6176f-6731-4f7b-ba62-867b5b121090.png";
        assertThat(storage.toPublicUrl(legacyUrl)).isNull();
    }

    @Test
    void deleteIsIdempotentForLegacyLocalStorageUrl() {
        // S14P31E103-511 — 옛 작품을 UI 에서 삭제해도 500 으로 깨지지 않게.
        S3ImageStorage storage = new S3ImageStorage(properties, s3Client, s3Presigner);

        String legacyUrl = "/api/v1/uploads/0fd6176f-6731-4f7b-ba62-867b5b121090.png";
        assertThatCode(() -> storage.delete(legacyUrl)).doesNotThrowAnyException();
    }

    @Test
    void toPublicUrlReturnsNullForArbitraryNonS3Url() {
        // 적대 입력 — DB 변조나 임의 URL 도 graceful 처리.
        S3ImageStorage storage = new S3ImageStorage(properties, s3Client, s3Presigner);

        assertThat(storage.toPublicUrl("https://evil.example.com/some/path.png")).isNull();
        assertThat(storage.toPublicUrl("not even a url")).isNull();
    }

    @Test
    void uploadGeneratesUniqueKeysForRepeatedFiles() {
        S3ImageStorage storage = new S3ImageStorage(properties, s3Client, s3Presigner);
        MultipartFile a = new MockMultipartFile("file", "a.png", "image/png", PNG_BYTES);
        MultipartFile b = new MockMultipartFile("file", "b.png", "image/png", PNG_BYTES);

        StoredImage urlA = storage.upload(a);
        StoredImage urlB = storage.upload(b);

        assertThat(urlA.url()).isNotEqualTo(urlB.url());
        // 두 URL 모두 prefix 와 .png 로 끝나며 가운데가 UUID
        String keyA = URI.create(urlA.url()).getPath();
        assertThat(keyA).contains("/" + PREFIX + "/").endsWith(".png");
        // UUID 36자 매칭 (검증 형식만, 정확한 값은 random)
        String uuidPart =
                keyA.substring(keyA.lastIndexOf('/') + 1, keyA.length() - ".png".length());
        assertThatCode(() -> UUID.fromString(uuidPart)).doesNotThrowAnyException();
    }
}
