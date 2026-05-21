package com.comong.backend.global.config;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import com.comong.backend.global.storage.StorageProperties;

import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;

/**
 * S3 백엔드 활성 시점에만 등록되는 AWS SDK 빈 컨테이너. {@code storage.type=s3} 가 아닌 환경에서는 클래스 자체가 로드되지만 빈은 만들어지지
 * 않는다.
 *
 * <p>자격증명은 명시적으로 지정하지 않고 SDK 의 default credential provider chain (환경변수 / 시스템 프로퍼티 / EC2/ECS IAM
 * Role 등) 에 위임한다 — yaml/코드 어디에도 access key 가 박히지 않도록 보장.
 *
 * <p>presigner 는 별도 구현체 ({@code S3ImageStorage} / {@code S3VideoStorage}, S14P31E103-491/492 에서 도입)
 * 에서 GET URL 발급용으로 주입받는다. 본 이슈 (S14P31E103-490) 는 빈 등록까지만 처리.
 */
@Configuration
@EnableConfigurationProperties(StorageProperties.class)
@ConditionalOnProperty(name = "storage.type", havingValue = "s3")
public class S3ClientConfig {

    private final StorageProperties properties;

    public S3ClientConfig(StorageProperties properties) {
        this.properties = properties;
    }

    @Bean
    public S3Client s3Client() {
        return S3Client.builder().region(Region.of(properties.s3().region())).build();
    }

    @Bean
    public S3Presigner s3Presigner() {
        return S3Presigner.builder().region(Region.of(properties.s3().region())).build();
    }
}
