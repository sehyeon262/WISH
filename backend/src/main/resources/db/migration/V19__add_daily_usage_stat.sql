-- V19: Add daily_usage_stat aggregation table.
--
-- 핵심 결정:
--   - (stat_date, content_type) 가 의미적 PK 이지만 surrogate id (BIGSERIAL) + UNIQUE 로 처리
--     — JPA composite key 보일러플레이트 (@IdClass / @EmbeddedId) 회피
--   - content_type 은 ENUM 5종 (LOGIN/ART/MUSIC/TAEKWONDO/GYMNASTICS) — VARCHAR(20)
--   - total_seconds 는 BIGINT — 누적 환자 수 × 24h 까지 견디게 (INT 한도 ~24.8일 부족)
--   - 일별 집계 배치(매일 KST 01:00) 가 idempotent UPSERT 로 채움
--   - 통계 조회 API (S14P31E103-543) 가 (stat_date, content_type) 로 lookup, 조회 인덱스는 PK/UNIQUE 가 커버

CREATE TABLE daily_usage_stat (
    id               BIGSERIAL    PRIMARY KEY,
    stat_date        DATE         NOT NULL,
    content_type     VARCHAR(20)  NOT NULL,
    total_seconds    BIGINT       NOT NULL DEFAULT 0,
    unique_patients  INTEGER      NOT NULL DEFAULT 0,
    CONSTRAINT uk_daily_usage_stat_date_type UNIQUE (stat_date, content_type),
    CONSTRAINT ck_daily_usage_stat_total_seconds_non_negative CHECK (total_seconds >= 0),
    CONSTRAINT ck_daily_usage_stat_unique_patients_non_negative CHECK (unique_patients >= 0)
);
