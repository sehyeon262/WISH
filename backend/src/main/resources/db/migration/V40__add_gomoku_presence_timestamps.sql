ALTER TABLE gomoku_matches
    ADD COLUMN black_last_seen_at TIMESTAMP,
    ADD COLUMN white_last_seen_at TIMESTAMP;

UPDATE gomoku_matches
SET black_last_seen_at = updated_at
WHERE black_last_seen_at IS NULL;

UPDATE gomoku_matches
SET white_last_seen_at = updated_at
WHERE white_patient_profile_id IS NOT NULL
  AND white_last_seen_at IS NULL;

CREATE INDEX idx_gomoku_matches_status_black_seen
    ON gomoku_matches(status, black_last_seen_at);

CREATE INDEX idx_gomoku_matches_status_white_seen
    ON gomoku_matches(status, white_last_seen_at);
