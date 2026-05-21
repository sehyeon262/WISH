-- V30: Seed canon (Pachelbel) music chart row.
-- V13 originally seeded only baby-shark and twinkle-star, so canon plays were
-- failing with MUSIC_CHART_NOT_FOUND on score save / ranking lookup.

INSERT INTO music_chart (
    chart_id,
    title,
    bpm,
    duration_ms,
    audio_url,
    cover_url,
    total_notes,
    notes_json,
    is_active,
    created_at
) VALUES (
    'canon',
    '캐논',
    100,
    49876,
    'sounds/themes/music/canon.wav',
    'images/themes/music/ui/canon_thum.png',
    174,
    NULL,
    TRUE,
    CURRENT_TIMESTAMP
)
ON CONFLICT ON CONSTRAINT uk_music_chart_chart_id
DO UPDATE SET
    title = EXCLUDED.title,
    bpm = EXCLUDED.bpm,
    duration_ms = EXCLUDED.duration_ms,
    audio_url = EXCLUDED.audio_url,
    cover_url = EXCLUDED.cover_url,
    total_notes = EXCLUDED.total_notes,
    is_active = EXCLUDED.is_active;
