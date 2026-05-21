package com.comong.backend.support;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.stream.Stream;

import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.postgresql.PostgreSQLContainer;

/**
 * 통합 테스트 베이스. Testcontainers Postgres 컨테이너를 테스트 JVM에서 한 번 띄워 모든 하위 테스트가 공유한다.
 *
 * <p>여러 Spring 테스트 클래스가 같은 ApplicationContext를 안전하게 재사용할 수 있도록 datasource 접속 정보는
 * DynamicPropertySource로 주입한다.
 *
 * <p>JUnit이 클래스 단위로 {@code @Container} 생명주기를 관리하면 Spring context cache가 이미 종료된 datasource를 재사용할 수
 * 있어, 컨테이너를 테스트 JVM 생명주기에 맞춰 직접 시작한다.
 *
 * <p><b>스토리지 디렉토리 격리</b>: {@code storage.local.upload-dir} 을 OS 임시 디렉토리 하위로 매번 새로 만들고 JVM 종료 시 재귀
 * 삭제. 운영 default ({@code ./uploads}) 가 테스트 산출물로 더럽혀지지 않도록 분리.
 */
@SpringBootTest
@ActiveProfiles("test")
public abstract class IntegrationTestSupport {

    private static final PostgreSQLContainer POSTGRES =
            new PostgreSQLContainer("postgres:16-alpine");

    private static final Path TEST_UPLOAD_DIR;

    static {
        POSTGRES.start();
        try {
            TEST_UPLOAD_DIR = Files.createTempDirectory("comong-test-uploads");
        } catch (IOException e) {
            throw new IllegalStateException("테스트용 임시 업로드 디렉토리 생성 실패", e);
        }
        Runtime.getRuntime()
                .addShutdownHook(new Thread(IntegrationTestSupport::deleteUploadDirRecursive));
    }

    @DynamicPropertySource
    static void integrationProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("storage.local.upload-dir", TEST_UPLOAD_DIR::toString);
        registry.add("livekit.url", () -> "wss://test.livekit.cloud");
        registry.add("livekit.api-key", () -> "test-livekit-api-key");
        registry.add("livekit.api-secret", () -> "test-livekit-api-secret");
    }

    /**
     * shutdown hook 은 best-effort 이지만, 정리 실패 원인을 추적할 수 있도록 {@code System.err} 로 출력. SLF4J 로거는 종료 후
     * 시점일 수 있어 표준 에러 스트림이 더 안정적. CI 환경에서 임시 디스크 누수 발견에 도움.
     */
    private static void deleteUploadDirRecursive() {
        try (Stream<Path> walk = Files.walk(TEST_UPLOAD_DIR)) {
            walk.sorted(Comparator.reverseOrder())
                    .forEach(
                            p -> {
                                try {
                                    Files.deleteIfExists(p);
                                } catch (IOException e) {
                                    System.err.println(
                                            "test upload cleanup failed for "
                                                    + p
                                                    + ": "
                                                    + e.getMessage());
                                }
                            });
        } catch (IOException e) {
            System.err.println(
                    "test upload dir walk failed for " + TEST_UPLOAD_DIR + ": " + e.getMessage());
        }
    }
}
