package com.comong.backend;

import org.junit.jupiter.api.Test;

import com.comong.backend.support.IntegrationTestSupport;

/**
 * 컨텍스트 로드 스모크 테스트.
 *
 * <p>Testcontainers Postgres 위에서 실제 DataSource/JPA/Flyway 가 부팅되며, ddl-auto=validate 로 엔티티-스키마 정합성을
 * 검증한다. 마이그레이션 SQL 또는 엔티티 매핑이 어긋나면 컨텍스트 로드 단계에서 실패한다.
 */
class BackendApplicationTests extends IntegrationTestSupport {

    @Test
    void contextLoads() {}
}
