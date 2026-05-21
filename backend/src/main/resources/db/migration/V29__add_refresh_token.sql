-- V29: Add refresh_token for JWT refresh flow (S14P31E103-780).
--
-- 핵심 결정:
--   - access token (JWT, 1h) 와 별개로 long-lived refresh token (기본 30d) 발급
--   - DB 저장 + SHA-256 해시 — DB 가 털려도 토큰 자체는 노출되지 않음
--   - rotation: refresh 호출 시 새 refresh 발급 + 기존 revoke. 재사용 감지 가능
--   - revoked_at NULL = 활성, NOT NULL = 회전/로그아웃으로 폐기됨
--   - ON DELETE CASCADE: 사용자 삭제 시 모든 refresh 정리

CREATE TABLE refresh_token (
    id          BIGSERIAL       PRIMARY KEY,
    user_id     BIGINT          NOT NULL,
    token_hash  VARCHAR(64)     NOT NULL,
    expires_at  TIMESTAMP(6)    NOT NULL,
    revoked_at  TIMESTAMP(6),
    created_at  TIMESTAMP(6)    NOT NULL,
    CONSTRAINT fk_refresh_token_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT uk_refresh_token_hash UNIQUE (token_hash)
);

CREATE INDEX idx_refresh_token_user ON refresh_token (user_id);
