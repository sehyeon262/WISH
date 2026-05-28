-- V46: Add index for chart-based music ranking queries.

CREATE INDEX idx_music_result_chart_patient_best
    ON music_result (music_chart_id, patient_profile_id, score DESC, accuracy DESC, played_at DESC);
