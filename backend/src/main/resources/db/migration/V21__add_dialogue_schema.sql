-- V21: Add dialogue domain schema (NPC dialogue sessions + turn-level events).
--
-- 핵심 결정:
--   - npc_name 으로 등대지기 영철 (Claude 생성) / 마을 주민 5인 (정적 스크립트) 분기.
--     같은 turns 테이블에 generated_by 로 출처를 기록하므로 향후 보고서 집계가 1쿼리로 가능.
--   - concern_flags / protective_factors 는 JSONB 로 저장. FE 가 choice 정의에 박은 값을
--     그대로 적재하며, 의미 해석은 향후 LLM 보고서 시점에 한다 (BE 는 매핑/카탈로그 미보유).
--     emotion_weights 는 dead-weight 로 판단되어 컬럼 제외 — 필요해지면 별도 마이그레이션.
--   - (session_id, step_index) UNIQUE 로 중복 클릭/재시도 idempotency 를 DB 레벨에서 보장.
--   - intensity 는 0~3 범위 (기획). CHECK 로 강제.
--   - finest granularity (turn) 로 저장하고 보고서는 SUM/COUNT 로 derive — V20 와 같은 OLAP 원칙.
--   - patient_profile 삭제 시 CASCADE (소유 관계). dialogue_session 삭제 시 turns CASCADE.

CREATE TABLE dialogue_sessions (
    id                  BIGSERIAL    PRIMARY KEY,
    patient_profile_id  BIGINT       NOT NULL,
    npc_name            VARCHAR(32)  NOT NULL,
    status              VARCHAR(16)  NOT NULL,
    step_count          INTEGER      NOT NULL DEFAULT 0,
    max_steps           INTEGER      NOT NULL DEFAULT 3,
    finish_reason       VARCHAR(32),
    started_at          TIMESTAMP(6) NOT NULL,
    ended_at            TIMESTAMP(6),
    CONSTRAINT fk_dialogue_session_patient
        FOREIGN KEY (patient_profile_id) REFERENCES patient_profiles(id) ON DELETE CASCADE,
    CONSTRAINT ck_dialogue_session_step_count_non_negative
        CHECK (step_count >= 0),
    CONSTRAINT ck_dialogue_session_max_steps_positive
        CHECK (max_steps > 0),
    CONSTRAINT ck_dialogue_session_step_count_within_max
        CHECK (step_count <= max_steps)
);
-- 환자 단위 시간순 조회 (향후 보고서/배치 집계) 가속.
CREATE INDEX idx_dialogue_session_patient_started
    ON dialogue_sessions (patient_profile_id, started_at DESC);

CREATE TABLE dialogue_turns (
    id                  BIGSERIAL    PRIMARY KEY,
    session_id          BIGINT       NOT NULL,
    step_index          INTEGER      NOT NULL,
    question_text       TEXT         NOT NULL,
    choice_intent_id    VARCHAR(64)  NOT NULL,
    choice_text         TEXT         NOT NULL,
    intensity           SMALLINT     NOT NULL,
    concern_flags       JSONB        NOT NULL,
    protective_factors  JSONB        NOT NULL,
    generated_by        VARCHAR(16)  NOT NULL,
    created_at          TIMESTAMP(6) NOT NULL,
    CONSTRAINT fk_dialogue_turn_session
        FOREIGN KEY (session_id) REFERENCES dialogue_sessions(id) ON DELETE CASCADE,
    CONSTRAINT uk_dialogue_turn_session_step
        UNIQUE (session_id, step_index),
    CONSTRAINT ck_dialogue_turn_step_index_non_negative
        CHECK (step_index >= 0),
    CONSTRAINT ck_dialogue_turn_intensity_range
        CHECK (intensity >= 0 AND intensity <= 3)
);
-- session 단위 step_index 순회는 위 UNIQUE 인덱스가 cover.
