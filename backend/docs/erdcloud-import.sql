-- ERDCloud import DDL for WISH backend.
-- Source of truth: Flyway migrations in backend/src/main/resources/db/migration through V42.
-- Scope: tables, primary keys, unique constraints, and foreign-key relationships.
-- Omitted for ERDCloud compatibility: seed data, UPDATE statements, non-unique indexes,
-- check constraints, and partial unique indexes that cannot be represented as table constraints.

CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    email VARCHAR(100) NOT NULL,
    nickname VARCHAR(30) NOT NULL,
    password VARCHAR(100) NOT NULL,
    created_at TIMESTAMP(6) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'USER',
    CONSTRAINT uk_users_email UNIQUE (email),
    CONSTRAINT uk_users_nickname UNIQUE (nickname)
);

CREATE TABLE patient_profiles (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    name VARCHAR(50) NOT NULL,
    nickname VARCHAR(30) NOT NULL,
    birth_date DATE NOT NULL,
    gender VARCHAR(10) NOT NULL,
    created_at TIMESTAMP(6) NOT NULL,
    CONSTRAINT uk_patient_profiles_user_id UNIQUE (user_id),
    CONSTRAINT fk_patient_profiles_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE performance_video (
    id BIGSERIAL PRIMARY KEY,
    patient_id BIGINT NOT NULL,
    video_key VARCHAR(1024) NOT NULL,
    thumb_key VARCHAR(1024),
    created_at TIMESTAMP(6) NOT NULL,
    CONSTRAINT fk_performance_video_patient
        FOREIGN KEY (patient_id) REFERENCES patient_profiles(id) ON DELETE CASCADE
);

CREATE TABLE artworks (
    id BIGSERIAL PRIMARY KEY,
    patient_profile_id BIGINT NOT NULL,
    sketch_code INTEGER,
    image_url VARCHAR(500) NOT NULL,
    play_duration_seconds INTEGER NOT NULL DEFAULT 0,
    is_public BOOLEAN NOT NULL DEFAULT FALSE,
    color_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP(6) NOT NULL,
    updated_at TIMESTAMP(6) NOT NULL,
    CONSTRAINT fk_artworks_patient_profile
        FOREIGN KEY (patient_profile_id) REFERENCES patient_profiles(id) ON DELETE CASCADE
);

CREATE TABLE exercise_motion (
    id BIGSERIAL PRIMARY KEY,
    exercise_type VARCHAR(20) NOT NULL,
    name VARCHAR(100) NOT NULL,
    routine_order INTEGER NOT NULL,
    target_reps INTEGER NOT NULL,
    description TEXT NOT NULL,
    demo_video_url VARCHAR(500),
    thumbnail_url VARCHAR(500),
    created_at TIMESTAMP(6) NOT NULL,
    updated_at TIMESTAMP(6) NOT NULL,
    CONSTRAINT uk_exercise_motion_exercise_type_routine_order
        UNIQUE (exercise_type, routine_order)
);

CREATE TABLE exercise_session (
    id BIGSERIAL PRIMARY KEY,
    patient_id BIGINT NOT NULL,
    exercise_type VARCHAR(20) NOT NULL,
    duration_sec INTEGER NOT NULL,
    average_accuracy DOUBLE PRECISION NOT NULL,
    completed_motion_count INTEGER NOT NULL,
    created_at TIMESTAMP(6) NOT NULL,
    CONSTRAINT fk_exercise_session_patient
        FOREIGN KEY (patient_id) REFERENCES patient_profiles(id) ON DELETE CASCADE
);

CREATE TABLE exercise_session_motion (
    id BIGSERIAL PRIMARY KEY,
    session_id BIGINT NOT NULL,
    exercise_motion_id BIGINT NOT NULL,
    performance_video_id BIGINT,
    duration_sec INTEGER NOT NULL,
    accuracy DOUBLE PRECISION NOT NULL,
    completed_reps INTEGER NOT NULL,
    feedback VARCHAR(255) NOT NULL,
    pose_replay TEXT,
    compact_pose_replay TEXT,
    created_at TIMESTAMP(6) NOT NULL,
    CONSTRAINT fk_exercise_session_motion_session
        FOREIGN KEY (session_id) REFERENCES exercise_session(id) ON DELETE CASCADE,
    CONSTRAINT fk_exercise_session_motion_exercise_motion
        FOREIGN KEY (exercise_motion_id) REFERENCES exercise_motion(id) ON DELETE RESTRICT,
    CONSTRAINT fk_exercise_session_motion_performance_video
        FOREIGN KEY (performance_video_id) REFERENCES performance_video(id) ON DELETE SET NULL
);

CREATE TABLE music_chart (
    id BIGSERIAL PRIMARY KEY,
    chart_id VARCHAR(100) NOT NULL,
    title VARCHAR(100) NOT NULL,
    bpm INTEGER NOT NULL,
    duration_ms INTEGER NOT NULL,
    audio_url VARCHAR(500) NOT NULL,
    cover_url VARCHAR(500) NOT NULL,
    total_notes INTEGER NOT NULL,
    notes_json TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP(6) NOT NULL,
    CONSTRAINT uk_music_chart_chart_id UNIQUE (chart_id)
);

CREATE TABLE music_result (
    id BIGSERIAL PRIMARY KEY,
    patient_profile_id BIGINT NOT NULL,
    music_chart_id BIGINT NOT NULL,
    score INTEGER NOT NULL,
    max_combo INTEGER NOT NULL,
    perfect_count INTEGER NOT NULL,
    good_count INTEGER NOT NULL,
    great_count INTEGER NOT NULL DEFAULT 0,
    miss_count INTEGER NOT NULL,
    total_notes INTEGER NOT NULL,
    accuracy DOUBLE PRECISION NOT NULL,
    rank CHAR(1) NOT NULL,
    played_duration_ms INTEGER NOT NULL,
    played_at TIMESTAMP(6) NOT NULL,
    video_key VARCHAR(1024),
    thumb_key VARCHAR(1024),
    CONSTRAINT fk_music_result_patient_profile
        FOREIGN KEY (patient_profile_id) REFERENCES patient_profiles(id) ON DELETE CASCADE,
    CONSTRAINT fk_music_result_music_chart
        FOREIGN KEY (music_chart_id) REFERENCES music_chart(id) ON DELETE RESTRICT
);

CREATE TABLE taekwondo_motion (
    id BIGSERIAL PRIMARY KEY,
    poomsae VARCHAR(20) NOT NULL,
    name VARCHAR(100) NOT NULL,
    routine_order INTEGER NOT NULL,
    target_reps INTEGER NOT NULL,
    description TEXT NOT NULL,
    demo_video_url VARCHAR(500),
    thumbnail_url VARCHAR(500),
    created_at TIMESTAMP(6) NOT NULL,
    updated_at TIMESTAMP(6) NOT NULL,
    CONSTRAINT uk_taekwondo_motion_poomsae_routine_order
        UNIQUE (poomsae, routine_order),
    CONSTRAINT uk_taekwondo_motion_poomsae_name
        UNIQUE (poomsae, name)
);

CREATE TABLE taekwondo_session (
    id BIGSERIAL PRIMARY KEY,
    patient_id BIGINT NOT NULL,
    poomsae VARCHAR(20) NOT NULL,
    duration_sec INTEGER NOT NULL,
    average_accuracy DOUBLE PRECISION NOT NULL,
    completed_motion_count INTEGER NOT NULL,
    monsters_defeated INTEGER NOT NULL,
    created_at TIMESTAMP(6) NOT NULL,
    CONSTRAINT fk_taekwondo_session_patient
        FOREIGN KEY (patient_id) REFERENCES patient_profiles(id) ON DELETE CASCADE
);

CREATE TABLE taekwondo_session_motion (
    id BIGSERIAL PRIMARY KEY,
    session_id BIGINT NOT NULL,
    motion_id BIGINT NOT NULL,
    performance_video_id BIGINT,
    duration_sec INTEGER NOT NULL,
    accuracy DOUBLE PRECISION NOT NULL,
    completed_reps INTEGER NOT NULL,
    monsters_defeated INTEGER NOT NULL DEFAULT 0,
    feedback VARCHAR(255) NOT NULL,
    created_at TIMESTAMP(6) NOT NULL,
    CONSTRAINT fk_taekwondo_session_motion_session
        FOREIGN KEY (session_id) REFERENCES taekwondo_session(id) ON DELETE CASCADE,
    CONSTRAINT fk_taekwondo_session_motion_motion
        FOREIGN KEY (motion_id) REFERENCES taekwondo_motion(id) ON DELETE RESTRICT,
    CONSTRAINT fk_taekwondo_session_motion_performance_video
        FOREIGN KEY (performance_video_id) REFERENCES performance_video(id) ON DELETE SET NULL
);

CREATE TABLE taekwondo_progress (
    id BIGSERIAL PRIMARY KEY,
    patient_id BIGINT NOT NULL,
    current_belt VARCHAR(20) NOT NULL,
    total_monsters_defeated INTEGER NOT NULL,
    session_count INTEGER NOT NULL,
    last_promoted_at TIMESTAMP(6),
    updated_at TIMESTAMP(6) NOT NULL,
    CONSTRAINT uk_taekwondo_progress_patient UNIQUE (patient_id),
    CONSTRAINT fk_taekwondo_progress_patient
        FOREIGN KEY (patient_id) REFERENCES patient_profiles(id) ON DELETE CASCADE
);

CREATE TABLE taekwondo_belt_history (
    id BIGSERIAL PRIMARY KEY,
    patient_id BIGINT NOT NULL,
    from_belt VARCHAR(20),
    to_belt VARCHAR(20) NOT NULL,
    trigger_session_id BIGINT NOT NULL,
    promoted_at TIMESTAMP(6) NOT NULL,
    CONSTRAINT fk_taekwondo_belt_history_patient
        FOREIGN KEY (patient_id) REFERENCES patient_profiles(id) ON DELETE CASCADE,
    CONSTRAINT fk_taekwondo_belt_history_session
        FOREIGN KEY (trigger_session_id) REFERENCES taekwondo_session(id) ON DELETE CASCADE
);

CREATE TABLE user_login_session (
    id BIGSERIAL PRIMARY KEY,
    patient_profile_id BIGINT NOT NULL,
    started_at TIMESTAMP(6) NOT NULL,
    last_heartbeat_at TIMESTAMP(6) NOT NULL,
    ended_at TIMESTAMP(6),
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT fk_user_login_session_patient
        FOREIGN KEY (patient_profile_id) REFERENCES patient_profiles(id) ON DELETE CASCADE
);

CREATE TABLE daily_usage_stat (
    id BIGSERIAL PRIMARY KEY,
    stat_date DATE NOT NULL,
    content_type VARCHAR(20) NOT NULL,
    total_seconds BIGINT NOT NULL DEFAULT 0,
    patient_profile_id BIGINT NOT NULL,
    CONSTRAINT uk_daily_usage_stat_date_type_patient
        UNIQUE (stat_date, content_type, patient_profile_id),
    CONSTRAINT fk_daily_usage_stat_patient
        FOREIGN KEY (patient_profile_id) REFERENCES patient_profiles(id) ON DELETE CASCADE
);

CREATE TABLE dialogue_sessions (
    id BIGSERIAL PRIMARY KEY,
    patient_profile_id BIGINT NOT NULL,
    npc_name VARCHAR(32) NOT NULL,
    status VARCHAR(16) NOT NULL,
    step_count INTEGER NOT NULL DEFAULT 0,
    max_steps INTEGER NOT NULL DEFAULT 3,
    finish_reason VARCHAR(32),
    script_id VARCHAR(64),
    started_at TIMESTAMP(6) NOT NULL,
    ended_at TIMESTAMP(6),
    CONSTRAINT fk_dialogue_session_patient
        FOREIGN KEY (patient_profile_id) REFERENCES patient_profiles(id) ON DELETE CASCADE
);

CREATE TABLE dialogue_turns (
    id BIGSERIAL PRIMARY KEY,
    session_id BIGINT NOT NULL,
    step_index INTEGER NOT NULL,
    question_text TEXT NOT NULL,
    choice_intent_id VARCHAR(64) NOT NULL,
    choice_text TEXT NOT NULL,
    intensity SMALLINT NOT NULL,
    concern_flags JSONB NOT NULL,
    protective_factors JSONB NOT NULL,
    generated_by VARCHAR(16) NOT NULL,
    valence VARCHAR(16),
    tone VARCHAR(16),
    topic_keywords JSONB NOT NULL DEFAULT '[]',
    sentiment_words JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMP(6) NOT NULL,
    CONSTRAINT uk_dialogue_turn_session_step
        UNIQUE (session_id, step_index),
    CONSTRAINT fk_dialogue_turn_session
        FOREIGN KEY (session_id) REFERENCES dialogue_sessions(id) ON DELETE CASCADE
);

CREATE TABLE fuel_event (
    id BIGSERIAL PRIMARY KEY,
    patient_id BIGINT NOT NULL,
    sender_id BIGINT NOT NULL,
    amount INTEGER NOT NULL,
    message VARCHAR(100) NOT NULL,
    created_at TIMESTAMP(6) NOT NULL,
    consumed_at TIMESTAMP(6),
    CONSTRAINT fk_fuel_event_patient
        FOREIGN KEY (patient_id) REFERENCES patient_profiles(id) ON DELETE CASCADE,
    CONSTRAINT fk_fuel_event_sender
        FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE guardian_device_token (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    device_token VARCHAR(4096) NOT NULL,
    platform VARCHAR(20) NOT NULL,
    user_agent VARCHAR(512),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP(6) NOT NULL,
    updated_at TIMESTAMP(6) NOT NULL,
    deactivated_at TIMESTAMP(6),
    CONSTRAINT uk_guardian_device_token UNIQUE (device_token),
    CONSTRAINT fk_guardian_device_token_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE refresh_token (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    token_hash VARCHAR(64) NOT NULL,
    expires_at TIMESTAMP(6) NOT NULL,
    revoked_at TIMESTAMP(6),
    created_at TIMESTAMP(6) NOT NULL,
    CONSTRAINT uk_refresh_token_hash UNIQUE (token_hash),
    CONSTRAINT fk_refresh_token_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE photo_booth_photos (
    id BIGSERIAL PRIMARY KEY,
    patient_profile_id BIGINT NOT NULL,
    frame_id VARCHAR(50) NOT NULL,
    image_url VARCHAR(500) NOT NULL,
    thumbnail_url VARCHAR(500),
    is_public BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP(6) NOT NULL,
    updated_at TIMESTAMP(6) NOT NULL,
    CONSTRAINT fk_photo_booth_photos_patient_profile
        FOREIGN KEY (patient_profile_id) REFERENCES patient_profiles(id)
);

CREATE TABLE gomoku_matches (
    id BIGSERIAL PRIMARY KEY,
    room_code VARCHAR(12) NOT NULL,
    black_patient_profile_id BIGINT NOT NULL,
    white_patient_profile_id BIGINT,
    winner_patient_profile_id BIGINT,
    rematch_source_match_id BIGINT,
    status VARCHAR(20) NOT NULL,
    rule_set VARCHAR(20) NOT NULL,
    timer_seconds INTEGER NOT NULL,
    current_turn VARCHAR(10) NOT NULL,
    result VARCHAR(20),
    end_reason VARCHAR(20),
    move_count INTEGER NOT NULL DEFAULT 0,
    moves_json TEXT NOT NULL DEFAULT '[]',
    ranked BOOLEAN NOT NULL DEFAULT FALSE,
    black_texture_key VARCHAR(80) NOT NULL DEFAULT 'character',
    white_texture_key VARCHAR(80),
    started_at TIMESTAMP,
    finished_at TIMESTAMP,
    black_last_seen_at TIMESTAMP,
    white_last_seen_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    CONSTRAINT uk_gomoku_matches_room_code UNIQUE (room_code),
    CONSTRAINT uk_gomoku_matches_rematch_source UNIQUE (rematch_source_match_id),
    CONSTRAINT fk_gomoku_matches_black_patient
        FOREIGN KEY (black_patient_profile_id) REFERENCES patient_profiles(id) ON DELETE CASCADE,
    CONSTRAINT fk_gomoku_matches_white_patient
        FOREIGN KEY (white_patient_profile_id) REFERENCES patient_profiles(id) ON DELETE CASCADE,
    CONSTRAINT fk_gomoku_matches_winner_patient
        FOREIGN KEY (winner_patient_profile_id) REFERENCES patient_profiles(id) ON DELETE CASCADE,
    CONSTRAINT fk_gomoku_matches_rematch_source
        FOREIGN KEY (rematch_source_match_id) REFERENCES gomoku_matches(id) ON DELETE SET NULL
);

CREATE TABLE gomoku_chat_messages (
    id BIGSERIAL PRIMARY KEY,
    match_id BIGINT NOT NULL,
    sender_patient_profile_id BIGINT NOT NULL,
    content VARCHAR(200) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_gomoku_chat_messages_match
        FOREIGN KEY (match_id) REFERENCES gomoku_matches(id),
    CONSTRAINT fk_gomoku_chat_messages_sender
        FOREIGN KEY (sender_patient_profile_id) REFERENCES patient_profiles(id)
);
