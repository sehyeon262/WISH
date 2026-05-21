-- V22: Add GREAT note count to music results.

ALTER TABLE music_result
    ADD COLUMN great_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE music_result
    ADD CONSTRAINT ck_music_result_great_count_non_negative
        CHECK (great_count >= 0);
