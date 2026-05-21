package com.comong.backend.global.storage;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 스토리지 설정. {@code application.yaml} 의 {@code storage.*} 트리를 바인딩한다.
 *
 * <p><b>구조</b>
 *
 * <ul>
 *   <li>{@code type}: 활성 백엔드 선택 ({@link Type#LOCAL} | {@link Type#S3}). 모든 환경에서 yaml 로 명시한다 — 누락
 *       방지를 위해 디폴트는 {@code local} 이지만 {@link
 *       org.springframework.boot.autoconfigure.condition.ConditionalOnProperty} 의 {@code
 *       matchIfMissing} 에 의존하지 않는다.
 *   <li>{@code local}: 로컬 디스크 백엔드 설정. {@link LocalImageStorage} / {@link LocalVideoStorage} 가 사용.
 *   <li>{@code s3}: S3 백엔드 설정. {@code type=s3} 일 때만 의미 — 그 외 환경에서는 {@code null} 일 수 있다.
 * </ul>
 *
 * <p>구현체 빈은 모두 {@link
 * org.springframework.boot.autoconfigure.condition.ConditionalOnProperty}({@code storage.type=...})
 * 로 가드되며, 한 시점에 한 백엔드만 활성화된다.
 */
@ConfigurationProperties(prefix = "storage")
public record StorageProperties(Type type, Local local, S3 s3) {

    /** 활성 스토리지 백엔드. */
    public enum Type {
        LOCAL,
        S3
    }

    /**
     * 로컬 디스크 백엔드 설정.
     *
     * <ul>
     *   <li>{@code uploadDir}: 업로드 파일이 실제로 저장되는 OS 경로. 디렉토리는 첫 업로드 시점에 lazy 생성.
     *   <li>{@code publicUrlPrefix}: 외부 노출 URL 의 servlet 상대 prefix. {@link
     *       com.comong.backend.global.config.StorageConfig} 정적 핸들러 / {@link
     *       com.comong.backend.global.config.SecurityConfig} permit 이 동일 prefix 를 공유.
     * </ul>
     */
    public record Local(String uploadDir, String publicUrlPrefix) {}

    /**
     * S3 백엔드 설정. private 버킷을 가정하며, 외부 노출 URL 은 {@code S3Presigner} 가 발급하는 짧은 TTL GET URL.
     *
     * <ul>
     *   <li>{@code bucket}: S3 버킷 이름.
     *   <li>{@code region}: AWS 리전 (예: {@code ap-northeast-2}).
     *   <li>{@code prefix}: 객체 키 prefix. 환경별 격리에 사용 (예: {@code dev}, {@code prod}).
     *   <li>{@code presignedTtlSeconds}: presigned GET URL 의 유효 시간 (초).
     * </ul>
     */
    public record S3(String bucket, String region, String prefix, long presignedTtlSeconds) {}
}
