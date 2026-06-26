-- V45: Add indexes for usage-stats read paths.
--
-- The usage-stats APIs aggregate today's source rows by date range and patient.
-- Existing indexes are mostly patient-first, which is good for single-patient lookup
-- but less effective for whole-day aggregation across all patients.

CREATE INDEX idx_user_login_session_started_patient
    ON user_login_session (started_at, patient_profile_id);

CREATE INDEX idx_music_result_played_patient
    ON music_result (played_at, patient_profile_id);

CREATE INDEX idx_taekwondo_session_created_patient
    ON taekwondo_session (created_at, patient_id);

CREATE INDEX idx_exercise_session_created_patient
    ON exercise_session (created_at, patient_id);

CREATE INDEX idx_artworks_updated_patient
    ON artworks (updated_at, patient_profile_id);

CREATE INDEX idx_daily_usage_stat_patient_type_date
    ON daily_usage_stat (patient_profile_id, content_type, stat_date);
