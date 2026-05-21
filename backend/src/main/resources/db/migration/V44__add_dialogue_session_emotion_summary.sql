ALTER TABLE dialogue_sessions
    ADD COLUMN emotion_valence VARCHAR(16),
    ADD COLUMN emotion_tone VARCHAR(16),
    ADD COLUMN emotion_intensity SMALLINT,
    ADD COLUMN emotion_concern_flags JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN emotion_protective_factors JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN guardian_message TEXT,
    ADD COLUMN emotion_analyzed_at TIMESTAMP;

ALTER TABLE dialogue_sessions
    ADD CONSTRAINT ck_dialogue_session_emotion_valence
        CHECK (emotion_valence IS NULL OR emotion_valence IN ('POSITIVE', 'NEUTRAL', 'NEGATIVE')),
    ADD CONSTRAINT ck_dialogue_session_emotion_tone
        CHECK (emotion_tone IS NULL OR emotion_tone IN ('CALM', 'TIRED', 'WORRIED')),
    ADD CONSTRAINT ck_dialogue_session_emotion_intensity
        CHECK (emotion_intensity IS NULL OR emotion_intensity BETWEEN 0 AND 3);

CREATE INDEX idx_dialogue_sessions_emotion_analyzed_at
    ON dialogue_sessions (patient_profile_id, emotion_analyzed_at DESC)
    WHERE emotion_analyzed_at IS NOT NULL;
