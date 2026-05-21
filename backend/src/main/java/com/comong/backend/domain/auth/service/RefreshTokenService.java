package com.comong.backend.domain.auth.service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.comong.backend.domain.auth.entity.RefreshToken;
import com.comong.backend.domain.auth.exception.AuthErrorCode;
import com.comong.backend.domain.auth.repository.RefreshTokenRepository;
import com.comong.backend.global.exception.BusinessException;
import com.comong.backend.global.security.JwtProperties;

import lombok.RequiredArgsConstructor;

/**
 * Refresh token 발급 / 검증 / 회전 / 폐기 (S14P31E103-780).
 *
 * <p>토큰 자체는 {@link SecureRandom} 32바이트를 base64url 로 인코딩한 불투명 문자열 (JWT 아님). 서버는 SHA-256 해시만 DB 에
 * 보관한다 — DB 가 털려도 토큰 위조 불가.
 *
 * <p>회전 (rotation): {@link #rotate(String)} 호출 시 기존 토큰 revoke + 새 토큰 발급. 이미 폐기된 토큰을 재사용하려는 시도는 탈취
 * 시그널로 보고 동일 사용자의 모든 활성 토큰을 폐기한다 (재사용 감지).
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class RefreshTokenService {

    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    /** SHA-256 출력 길이 (32B) 의 hex 표현 — DB 컬럼 길이 64 와 일치. */
    private static final int TOKEN_HASH_HEX_LEN = 64;

    /** 토큰 엔트로피 32B. base64url 인코딩 시 43자. */
    private static final int TOKEN_BYTES = 32;

    private final RefreshTokenRepository repository;
    private final JwtProperties properties;

    /** 로그인/회원가입 직후 호출. 새 refresh token 발급해 평문을 반환 (DB 엔 해시만 저장). */
    @Transactional
    public IssuedToken issue(long userId) {
        Instant now = Instant.now();
        String plaintext = generateRandomToken();
        String hash = sha256Hex(plaintext);
        Instant expiresAt = now.plus(Duration.ofSeconds(properties.refreshTokenTtlSeconds()));
        repository.save(
                RefreshToken.builder()
                        .userId(userId)
                        .tokenHash(hash)
                        .expiresAt(expiresAt)
                        .createdAt(now)
                        .build());
        return new IssuedToken(plaintext, properties.refreshTokenTtlSeconds());
    }

    /**
     * 회전. 기존 평문 검증 후 polish 새 토큰 발급. 기존은 즉시 revoke.
     *
     * <p>이미 폐기된 토큰이 들어오면 재사용 시도로 간주 — 호출자에게 401 을 던지며, 같은 사용자의 모든 활성 토큰을 함께 폐기해 탈취 피해를 차단한다.
     */
    @Transactional
    public RotationResult rotate(String plaintext) {
        Instant now = Instant.now();
        RefreshToken token = lookup(plaintext);
        if (token.getRevokedAt() != null) {
            // 재사용 감지 — 같은 user 의 활성 refresh 전부 폐기.
            revokeAllActiveByUserId(token.getUserId(), now);
            throw new BusinessException(AuthErrorCode.INVALID_REFRESH_TOKEN);
        }
        if (!token.isActive(now)) {
            throw new BusinessException(AuthErrorCode.INVALID_REFRESH_TOKEN);
        }

        token.revoke(now);
        IssuedToken next = issue(token.getUserId());
        return new RotationResult(token.getUserId(), next);
    }

    /** 로그아웃 시 호출. 토큰이 없거나 이미 폐기돼도 조용히 NoOp — 멱등. */
    @Transactional
    public void revoke(String plaintext) {
        String hash = sha256Hex(plaintext);
        repository.findByTokenHash(hash).ifPresent(token -> token.revoke(Instant.now()));
    }

    private RefreshToken lookup(String plaintext) {
        String hash = sha256Hex(plaintext);
        return repository
                .findByTokenHash(hash)
                .orElseThrow(() -> new BusinessException(AuthErrorCode.INVALID_REFRESH_TOKEN));
    }

    private void revokeAllActiveByUserId(long userId, Instant now) {
        repository.findAllByUserIdAndRevokedAtIsNull(userId).forEach(t -> t.revoke(now));
    }

    private static String generateRandomToken() {
        byte[] bytes = new byte[TOKEN_BYTES];
        SECURE_RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private static String sha256Hex(String input) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(input.getBytes(StandardCharsets.UTF_8));
            String hex = HexFormat.of().formatHex(hash);
            if (hex.length() != TOKEN_HASH_HEX_LEN) {
                throw new IllegalStateException("unexpected hash length: " + hex.length());
            }
            return hex;
        } catch (NoSuchAlgorithmException e) {
            // SHA-256 은 JRE 표준 — 사실상 발생 불가.
            throw new IllegalStateException("SHA-256 not available", e);
        }
    }

    /** 발급된 토큰 평문 + TTL (초). */
    public record IssuedToken(String plaintext, long expiresInSeconds) {}

    /** 회전 결과 — 새 토큰 + 어떤 user 의 것인지. AuthService 가 새 access token 발급에 사용. */
    public record RotationResult(long userId, IssuedToken refreshToken) {}
}
