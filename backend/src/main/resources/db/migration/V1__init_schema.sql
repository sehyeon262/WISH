-- V1: 초기 스키마. User 엔티티와 1:1 매칭.
-- 이 파일은 한 번 적용된 후 절대 수정하지 않는다. 변경이 필요하면 V2, V3... 로 추가한다.
-- ddl-auto=validate 가 이 스키마를 검증하므로 엔티티와 컬럼 타입/길이/nullable/제약 이름이 정확히 일치해야 한다.

CREATE TABLE users (
    id         BIGSERIAL      PRIMARY KEY,
    email      VARCHAR(100)   NOT NULL,
    nickname   VARCHAR(30)    NOT NULL,
    password   VARCHAR(100)   NOT NULL,
    created_at TIMESTAMP(6)   NOT NULL,
    CONSTRAINT uk_users_email    UNIQUE (email),
    CONSTRAINT uk_users_nickname UNIQUE (nickname)
);
