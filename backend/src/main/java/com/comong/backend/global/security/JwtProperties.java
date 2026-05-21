package com.comong.backend.global.security;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * JWT 관련 설정. application.yaml 의 {@code security.jwt.*} 값을 바인딩한다.
 *
 * <ul>
 *   <li>{@code secret}: HS256 서명용 비밀키 (256비트 이상 권장, Base64 또는 평문)
 *   <li>{@code accessTokenTtlSeconds}: Access 토큰 유효시간 (초)
 *   <li>{@code refreshTokenTtlSeconds}: Refresh 토큰 유효시간 (초). access 보다 훨씬 길게 — 기본 30일.
 *   <li>{@code issuer}: 토큰 발급자 (claim {@code iss})
 * </ul>
 */
@ConfigurationProperties(prefix = "security.jwt")
public record JwtProperties(
        String secret, long accessTokenTtlSeconds, long refreshTokenTtlSeconds, String issuer) {}
