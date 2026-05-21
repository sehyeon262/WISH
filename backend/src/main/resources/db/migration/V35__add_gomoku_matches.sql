CREATE TABLE gomoku_matches (
    id BIGSERIAL PRIMARY KEY,
    room_code VARCHAR(12) NOT NULL,
    black_patient_profile_id BIGINT NOT NULL,
    white_patient_profile_id BIGINT,
    status VARCHAR(20) NOT NULL,
    rule_set VARCHAR(20) NOT NULL,
    timer_seconds INTEGER NOT NULL,
    current_turn VARCHAR(10) NOT NULL,
    result VARCHAR(20),
    end_reason VARCHAR(20),
    winner_patient_profile_id BIGINT,
    move_count INTEGER NOT NULL DEFAULT 0,
    moves_json TEXT NOT NULL DEFAULT '[]',
    ranked BOOLEAN NOT NULL DEFAULT FALSE,
    started_at TIMESTAMP,
    finished_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    CONSTRAINT uk_gomoku_matches_room_code UNIQUE (room_code),
    CONSTRAINT fk_gomoku_matches_black_patient
        FOREIGN KEY (black_patient_profile_id) REFERENCES patient_profiles(id) ON DELETE CASCADE,
    CONSTRAINT fk_gomoku_matches_white_patient
        FOREIGN KEY (white_patient_profile_id) REFERENCES patient_profiles(id) ON DELETE CASCADE,
    CONSTRAINT fk_gomoku_matches_winner_patient
        FOREIGN KEY (winner_patient_profile_id) REFERENCES patient_profiles(id) ON DELETE CASCADE
);

CREATE INDEX idx_gomoku_matches_status_created
    ON gomoku_matches(status, created_at DESC);

CREATE INDEX idx_gomoku_matches_black_created
    ON gomoku_matches(black_patient_profile_id, created_at DESC);

CREATE INDEX idx_gomoku_matches_white_created
    ON gomoku_matches(white_patient_profile_id, created_at DESC);

CREATE INDEX idx_gomoku_matches_ranked_finished
    ON gomoku_matches(ranked, status, finished_at DESC);
