ALTER TABLE gomoku_matches
    ADD COLUMN rematch_source_match_id BIGINT;

ALTER TABLE gomoku_matches
    ADD CONSTRAINT fk_gomoku_matches_rematch_source
        FOREIGN KEY (rematch_source_match_id) REFERENCES gomoku_matches(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX uk_gomoku_matches_rematch_source
    ON gomoku_matches(rematch_source_match_id)
    WHERE rematch_source_match_id IS NOT NULL;
