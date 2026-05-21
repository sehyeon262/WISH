-- V14: Add taekwondo domain schema (motion catalog, session results, progress, belt history).
--
-- 핵심 결정:
--   - taekwondo_motion 의 (poomsae, routine_order) 유니크는 DEFERRABLE INITIALLY DEFERRED
--     로 두어 관리자 페이지에서 두 동작 routine_order swap 시 트랜잭션 끝 검사로 허용한다.
--   - (poomsae, name) 도 유니크로 두어 AI `action_name` 으로 motion 을 안전하게 lookup 한다.
--   - ON DELETE 정책은 V11 패턴을 따른다: 환자 종속 데이터는 CASCADE, 마스터(motion) 은 RESTRICT.

CREATE TABLE taekwondo_motion (
    id              BIGSERIAL           PRIMARY KEY,
    poomsae         VARCHAR(20)         NOT NULL,
    name            VARCHAR(100)        NOT NULL,
    routine_order   INTEGER             NOT NULL,
    target_reps     INTEGER             NOT NULL,
    description     TEXT                NOT NULL,
    demo_video_url  VARCHAR(500),
    thumbnail_url   VARCHAR(500),
    created_at      TIMESTAMP(6)        NOT NULL,
    updated_at      TIMESTAMP(6)        NOT NULL,
    CONSTRAINT uk_taekwondo_motion_poomsae_routine_order
        UNIQUE (poomsae, routine_order) DEFERRABLE INITIALLY DEFERRED,
    CONSTRAINT uk_taekwondo_motion_poomsae_name
        UNIQUE (poomsae, name),
    CONSTRAINT ck_taekwondo_motion_routine_order_positive
        CHECK (routine_order > 0),
    CONSTRAINT ck_taekwondo_motion_target_reps_positive
        CHECK (target_reps > 0)
);
CREATE INDEX idx_taekwondo_motion_poomsae_order
    ON taekwondo_motion (poomsae, routine_order);

CREATE TABLE taekwondo_session (
    id                       BIGSERIAL           PRIMARY KEY,
    patient_id               BIGINT              NOT NULL,
    poomsae                  VARCHAR(20)         NOT NULL,
    duration_sec             INTEGER             NOT NULL,
    average_accuracy         DOUBLE PRECISION    NOT NULL,
    completed_motion_count   INTEGER             NOT NULL,
    monsters_defeated        INTEGER             NOT NULL,
    created_at               TIMESTAMP(6)        NOT NULL,
    CONSTRAINT fk_taekwondo_session_patient
        FOREIGN KEY (patient_id) REFERENCES patient_profiles(id) ON DELETE CASCADE,
    CONSTRAINT ck_taekwondo_session_duration_non_negative
        CHECK (duration_sec >= 0),
    CONSTRAINT ck_taekwondo_session_average_accuracy_range
        CHECK (average_accuracy >= 0.0 AND average_accuracy <= 1.0),
    CONSTRAINT ck_taekwondo_session_completed_motion_count_non_negative
        CHECK (completed_motion_count >= 0),
    CONSTRAINT ck_taekwondo_session_monsters_defeated_non_negative
        CHECK (monsters_defeated >= 0)
);
CREATE INDEX idx_taekwondo_session_patient_created
    ON taekwondo_session (patient_id, created_at DESC);

CREATE TABLE taekwondo_session_motion (
    id              BIGSERIAL           PRIMARY KEY,
    session_id      BIGINT              NOT NULL,
    motion_id       BIGINT              NOT NULL,
    duration_sec    INTEGER             NOT NULL,
    accuracy        DOUBLE PRECISION    NOT NULL,
    completed_reps  INTEGER             NOT NULL,
    feedback        VARCHAR(255)        NOT NULL,
    created_at      TIMESTAMP(6)        NOT NULL,
    CONSTRAINT fk_taekwondo_session_motion_session
        FOREIGN KEY (session_id) REFERENCES taekwondo_session(id) ON DELETE CASCADE,
    CONSTRAINT fk_taekwondo_session_motion_motion
        FOREIGN KEY (motion_id) REFERENCES taekwondo_motion(id) ON DELETE RESTRICT,
    CONSTRAINT ck_taekwondo_session_motion_duration_non_negative
        CHECK (duration_sec >= 0),
    CONSTRAINT ck_taekwondo_session_motion_accuracy_range
        CHECK (accuracy >= 0.0 AND accuracy <= 1.0),
    CONSTRAINT ck_taekwondo_session_motion_completed_reps_non_negative
        CHECK (completed_reps >= 0)
);
CREATE INDEX idx_taekwondo_session_motion_session
    ON taekwondo_session_motion (session_id);
CREATE INDEX idx_taekwondo_session_motion_motion
    ON taekwondo_session_motion (motion_id);

CREATE TABLE taekwondo_progress (
    id                       BIGSERIAL           PRIMARY KEY,
    patient_id               BIGINT              NOT NULL,
    current_belt             VARCHAR(20)         NOT NULL,
    total_monsters_defeated  INTEGER             NOT NULL,
    session_count            INTEGER             NOT NULL,
    last_promoted_at         TIMESTAMP(6),
    updated_at               TIMESTAMP(6)        NOT NULL,
    CONSTRAINT fk_taekwondo_progress_patient
        FOREIGN KEY (patient_id) REFERENCES patient_profiles(id) ON DELETE CASCADE,
    CONSTRAINT uk_taekwondo_progress_patient UNIQUE (patient_id),
    CONSTRAINT ck_taekwondo_progress_total_monsters_defeated_non_negative
        CHECK (total_monsters_defeated >= 0),
    CONSTRAINT ck_taekwondo_progress_session_count_non_negative
        CHECK (session_count >= 0)
);

CREATE TABLE taekwondo_belt_history (
    id                  BIGSERIAL           PRIMARY KEY,
    patient_id          BIGINT              NOT NULL,
    from_belt           VARCHAR(20),
    to_belt             VARCHAR(20)         NOT NULL,
    trigger_session_id  BIGINT              NOT NULL,
    promoted_at         TIMESTAMP(6)        NOT NULL,
    CONSTRAINT fk_taekwondo_belt_history_patient
        FOREIGN KEY (patient_id) REFERENCES patient_profiles(id) ON DELETE CASCADE,
    CONSTRAINT fk_taekwondo_belt_history_session
        FOREIGN KEY (trigger_session_id) REFERENCES taekwondo_session(id) ON DELETE CASCADE
);
CREATE INDEX idx_taekwondo_belt_history_patient_promoted
    ON taekwondo_belt_history (patient_id, promoted_at DESC);

-- 환자별 첫 진입 (NULL → WHITE) 항목은 1번만 적재되어야 한다 — 도메인 불변식의 DB 레벨 방어.
-- Progress 가 1:1 UNIQUE 라 정상 흐름에선 자연 보호되지만, partial unique index 로 다중 안전망을 둔다.
CREATE UNIQUE INDEX uk_taekwondo_belt_history_patient_first_entry
    ON taekwondo_belt_history (patient_id) WHERE from_belt IS NULL;
