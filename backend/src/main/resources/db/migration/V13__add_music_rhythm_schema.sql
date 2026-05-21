-- V13: Add music rhythm chart/result persistence schema.

CREATE TABLE music_chart (
    id              BIGSERIAL       PRIMARY KEY,
    chart_id        VARCHAR(100)    NOT NULL,
    title           VARCHAR(100)    NOT NULL,
    bpm             INTEGER         NOT NULL,
    duration_ms     INTEGER         NOT NULL,
    audio_url       VARCHAR(500)    NOT NULL,
    cover_url       VARCHAR(500)    NOT NULL,
    total_notes     INTEGER         NOT NULL,
    notes_json      TEXT,
    is_active       BOOLEAN         NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMP(6)    NOT NULL,
    CONSTRAINT uk_music_chart_chart_id UNIQUE (chart_id),
    CONSTRAINT ck_music_chart_bpm_positive CHECK (bpm > 0),
    CONSTRAINT ck_music_chart_duration_ms_positive CHECK (duration_ms > 0),
    CONSTRAINT ck_music_chart_total_notes_positive CHECK (total_notes > 0)
);

CREATE TABLE music_result (
    id                  BIGSERIAL           PRIMARY KEY,
    patient_profile_id  BIGINT              NOT NULL,
    music_chart_id      BIGINT              NOT NULL,
    score               INTEGER             NOT NULL,
    max_combo           INTEGER             NOT NULL,
    perfect_count       INTEGER             NOT NULL,
    good_count          INTEGER             NOT NULL,
    miss_count          INTEGER             NOT NULL,
    total_notes         INTEGER             NOT NULL,
    accuracy            DOUBLE PRECISION    NOT NULL,
    rank                CHAR(1)             NOT NULL,
    played_duration_ms  INTEGER             NOT NULL,
    played_at           TIMESTAMP(6)        NOT NULL,
    CONSTRAINT fk_music_result_patient_profile
        FOREIGN KEY (patient_profile_id) REFERENCES patient_profiles(id) ON DELETE CASCADE,
    CONSTRAINT fk_music_result_music_chart
        FOREIGN KEY (music_chart_id) REFERENCES music_chart(id) ON DELETE RESTRICT,
    CONSTRAINT ck_music_result_score_non_negative CHECK (score >= 0),
    CONSTRAINT ck_music_result_max_combo_non_negative CHECK (max_combo >= 0),
    CONSTRAINT ck_music_result_perfect_count_non_negative CHECK (perfect_count >= 0),
    CONSTRAINT ck_music_result_good_count_non_negative CHECK (good_count >= 0),
    CONSTRAINT ck_music_result_miss_count_non_negative CHECK (miss_count >= 0),
    CONSTRAINT ck_music_result_total_notes_positive CHECK (total_notes > 0),
    CONSTRAINT ck_music_result_accuracy_range CHECK (accuracy >= 0.0 AND accuracy <= 1.0),
    CONSTRAINT ck_music_result_rank CHECK (rank IN ('S', 'A', 'B', 'C', 'D')),
    CONSTRAINT ck_music_result_played_duration_ms_non_negative CHECK (played_duration_ms >= 0)
);

CREATE INDEX idx_music_chart_active ON music_chart (is_active);
CREATE INDEX idx_music_result_patient_played ON music_result (patient_profile_id, played_at DESC);
CREATE INDEX idx_music_result_patient_chart_best
    ON music_result (patient_profile_id, music_chart_id, score DESC, accuracy DESC, played_at DESC);
CREATE INDEX idx_music_result_music_chart ON music_result (music_chart_id);

INSERT INTO music_chart (
    chart_id,
    title,
    bpm,
    duration_ms,
    audio_url,
    cover_url,
    total_notes,
    notes_json,
    is_active,
    created_at
) VALUES
    (
        'baby-shark',
        '아기상어',
        115,
        96196,
        'sounds/themes/music/babyshark.wav',
        'images/themes/music/ui/babyshark_thum.png',
        175,
        NULL,
        TRUE,
        CURRENT_TIMESTAMP
    ),
    (
        'twinkle-star',
        '작은별',
        120,
        27000,
        'sounds/themes/music/twinkle-star.wav',
        'images/themes/music/ui/littlestart_thum.png',
        42,
        NULL,
        TRUE,
        CURRENT_TIMESTAMP
    )
ON CONFLICT ON CONSTRAINT uk_music_chart_chart_id
DO UPDATE SET
    title = EXCLUDED.title,
    bpm = EXCLUDED.bpm,
    duration_ms = EXCLUDED.duration_ms,
    audio_url = EXCLUDED.audio_url,
    cover_url = EXCLUDED.cover_url,
    total_notes = EXCLUDED.total_notes,
    notes_json = EXCLUDED.notes_json,
    is_active = EXCLUDED.is_active;
