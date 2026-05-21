-- V25: Store child performance videos separately from motion demo videos.

CREATE TABLE performance_video (
    id          BIGSERIAL       PRIMARY KEY,
    patient_id  BIGINT          NOT NULL,
    video_key   VARCHAR(1024)   NOT NULL,
    thumb_key   VARCHAR(1024),
    created_at  TIMESTAMP(6)    NOT NULL,
    CONSTRAINT fk_performance_video_patient
        FOREIGN KEY (patient_id) REFERENCES patient_profiles(id) ON DELETE CASCADE
);

CREATE INDEX idx_performance_video_patient_created
    ON performance_video (patient_id, created_at DESC);

ALTER TABLE exercise_session_motion
    ADD COLUMN performance_video_id BIGINT,
    ADD CONSTRAINT fk_exercise_session_motion_performance_video
        FOREIGN KEY (performance_video_id) REFERENCES performance_video(id) ON DELETE SET NULL;

CREATE INDEX idx_exercise_session_motion_performance_video
    ON exercise_session_motion (performance_video_id);

ALTER TABLE taekwondo_session_motion
    ADD COLUMN performance_video_id BIGINT,
    ADD CONSTRAINT fk_taekwondo_session_motion_performance_video
        FOREIGN KEY (performance_video_id) REFERENCES performance_video(id) ON DELETE SET NULL;

CREATE INDEX idx_taekwondo_session_motion_performance_video
    ON taekwondo_session_motion (performance_video_id);
