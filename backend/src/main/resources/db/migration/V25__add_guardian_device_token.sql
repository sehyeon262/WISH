-- V25: Add guardian device token for FCM push notifications.
--
-- Product rules:
--   - One FCM token belongs to one guardian account at a time.
--   - Re-registering the same token updates ownership and reactivates it.
--   - Deactivation is idempotent and keeps the row for audit/debugging.

CREATE TABLE guardian_device_token (
    id              BIGSERIAL       PRIMARY KEY,
    user_id         BIGINT          NOT NULL,
    device_token    VARCHAR(4096)   NOT NULL,
    platform        VARCHAR(20)     NOT NULL,
    user_agent      VARCHAR(512),
    active          BOOLEAN         NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMP(6)    NOT NULL,
    updated_at      TIMESTAMP(6)    NOT NULL,
    deactivated_at  TIMESTAMP(6),
    CONSTRAINT fk_guardian_device_token_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT uk_guardian_device_token UNIQUE (device_token)
);

CREATE INDEX idx_guardian_device_token_user_active
    ON guardian_device_token (user_id, updated_at DESC, id DESC)
    WHERE active = TRUE;
