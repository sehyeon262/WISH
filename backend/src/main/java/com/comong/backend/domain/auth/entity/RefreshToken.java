package com.comong.backend.domain.auth.entity;

import java.time.Instant;
import java.util.Objects;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * Refresh token DB 저장 형태 (S14P31E103-780).
 *
 * <p>토큰 자체는 클라이언트에만 전달되고 서버는 SHA-256 해시만 보관 — DB 가 노출돼도 토큰 위조 불가. {@code revokedAt} 이 NULL 이면 활성,
 * NOT NULL 이면 회전(rotation) 또는 로그아웃으로 폐기됨. 한 사용자가 여러 디바이스에서 동시 로그인하면 여러 활성 토큰을 갖게 된다.
 */
@Entity
@Getter
@Table(
        name = "refresh_token",
        uniqueConstraints = {
            @UniqueConstraint(name = "uk_refresh_token_hash", columnNames = "token_hash")
        },
        indexes = {@Index(name = "idx_refresh_token_user", columnList = "user_id")})
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class RefreshToken {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "token_hash", nullable = false, length = 64)
    private String tokenHash;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "revoked_at")
    private Instant revokedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Builder
    private RefreshToken(Long userId, String tokenHash, Instant expiresAt, Instant createdAt) {
        this.userId = Objects.requireNonNull(userId, "userId must not be null");
        this.tokenHash = Objects.requireNonNull(tokenHash, "tokenHash must not be null");
        this.expiresAt = Objects.requireNonNull(expiresAt, "expiresAt must not be null");
        this.createdAt = createdAt != null ? createdAt : Instant.now();
    }

    /** 회전 또는 로그아웃 시 호출. 멱등 — 이미 폐기된 토큰을 다시 폐기해도 NoOp. */
    public void revoke(Instant now) {
        if (this.revokedAt == null) {
            this.revokedAt = now;
        }
    }

    public boolean isActive(Instant now) {
        return revokedAt == null && expiresAt.isAfter(now);
    }
}
