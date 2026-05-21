-- V17: Add optional S3 media object keys for music result previews.

ALTER TABLE music_result
    ADD COLUMN video_key VARCHAR(1024),
    ADD COLUMN thumb_key VARCHAR(1024);
