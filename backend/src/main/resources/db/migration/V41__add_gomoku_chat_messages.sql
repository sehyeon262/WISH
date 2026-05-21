CREATE TABLE gomoku_chat_messages (
    id BIGSERIAL PRIMARY KEY,
    match_id BIGINT NOT NULL REFERENCES gomoku_matches(id),
    sender_patient_profile_id BIGINT NOT NULL REFERENCES patient_profiles(id),
    content VARCHAR(200) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_gomoku_chat_messages_match_id_id
    ON gomoku_chat_messages(match_id, id);

CREATE INDEX idx_gomoku_chat_messages_sender_created_at
    ON gomoku_chat_messages(sender_patient_profile_id, created_at);
