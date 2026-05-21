ALTER TABLE gomoku_matches
    ADD COLUMN black_texture_key VARCHAR(80) NOT NULL DEFAULT 'character',
    ADD COLUMN white_texture_key VARCHAR(80);
