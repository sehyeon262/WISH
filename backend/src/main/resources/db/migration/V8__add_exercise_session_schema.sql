-- V8: Add gymnastics exercise session persistence schema.

CREATE TABLE motion (
    id              BIGSERIAL           PRIMARY KEY,
    exercise_type   VARCHAR(20)         NOT NULL,
    name            VARCHAR(100)        NOT NULL,
    routine_order   INTEGER             NOT NULL,
    target_reps     INTEGER             NOT NULL,
    description     TEXT                NOT NULL,
    demo_video_url  VARCHAR(500),
    thumbnail_url   VARCHAR(500),
    created_at      TIMESTAMP(6)        NOT NULL,
    updated_at      TIMESTAMP(6)        NOT NULL,
    CONSTRAINT uk_motion_exercise_type_routine_order UNIQUE (exercise_type, routine_order),
    CONSTRAINT ck_motion_routine_order_positive CHECK (routine_order > 0),
    CONSTRAINT ck_motion_target_reps_positive CHECK (target_reps > 0)
);

CREATE TABLE exercise_session (
    id                       BIGSERIAL           PRIMARY KEY,
    patient_id               BIGINT              NOT NULL,
    exercise_type            VARCHAR(20)         NOT NULL,
    duration_sec             INTEGER             NOT NULL,
    average_accuracy         DOUBLE PRECISION    NOT NULL,
    completed_motion_count   INTEGER             NOT NULL,
    created_at               TIMESTAMP(6)        NOT NULL,
    CONSTRAINT fk_exercise_session_patient FOREIGN KEY (patient_id) REFERENCES patient_profiles(id),
    CONSTRAINT ck_exercise_session_duration_non_negative CHECK (duration_sec >= 0),
    CONSTRAINT ck_exercise_session_average_accuracy_range CHECK (average_accuracy >= 0.0 AND average_accuracy <= 1.0),
    CONSTRAINT ck_exercise_session_completed_motion_count_non_negative CHECK (completed_motion_count >= 0)
);

CREATE TABLE exercise_session_motion (
    id               BIGSERIAL           PRIMARY KEY,
    session_id       BIGINT              NOT NULL,
    motion_id        BIGINT              NOT NULL,
    duration_sec     INTEGER             NOT NULL,
    accuracy         DOUBLE PRECISION    NOT NULL,
    completed_reps   INTEGER             NOT NULL,
    feedback         VARCHAR(255)        NOT NULL,
    created_at       TIMESTAMP(6)        NOT NULL,
    CONSTRAINT fk_exercise_session_motion_session FOREIGN KEY (session_id) REFERENCES exercise_session(id),
    CONSTRAINT fk_exercise_session_motion_motion FOREIGN KEY (motion_id) REFERENCES motion(id),
    CONSTRAINT ck_exercise_session_motion_duration_non_negative CHECK (duration_sec >= 0),
    CONSTRAINT ck_exercise_session_motion_accuracy_range CHECK (accuracy >= 0.0 AND accuracy <= 1.0),
    CONSTRAINT ck_exercise_session_motion_completed_reps_non_negative CHECK (completed_reps >= 0)
);

CREATE INDEX idx_motion_exercise_type_order ON motion (exercise_type, routine_order);
CREATE INDEX idx_exercise_session_patient_created ON exercise_session (patient_id, created_at DESC);
CREATE INDEX idx_exercise_session_motion_session ON exercise_session_motion (session_id);
CREATE INDEX idx_exercise_session_motion_motion ON exercise_session_motion (motion_id);
