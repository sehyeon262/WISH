-- V16: Seed default TAEGEUK_1 taekwondo motions.
--
-- 9 동작은 AI (ai/app/models/taegeuk1/checkpoints/) 가 학습한 태극 1장 동작 목록과 매칭된다.
-- routine_order 는 임시 1~9 — 정식 태극 1장 순서는 추후 관리자 페이지에서 조정한다 (S14P31E103-388).
-- target_reps 는 1 (태권도 동작은 세트 반복 개념이 약하므로 향후 조정 여지).
-- 미디어(영상/썸네일) 는 NULL — 관리자 페이지에서 추후 업로드.

INSERT INTO taekwondo_motion (
    poomsae,
    name,
    routine_order,
    target_reps,
    description,
    demo_video_url,
    thumbnail_url,
    created_at,
    updated_at
) VALUES
    ('TAEGEUK_1', '기본준비', 1, 1,
     '정면을 보고 양팔을 자연스럽게 내리고 두 발을 모은 준비 자세를 잡는다.',
     NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('TAEGEUK_1', '앞서고 아래막기', 2, 1,
     '앞서기 자세에서 앞손을 아래로 내리며 아래막기 동작을 한다.',
     NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('TAEGEUK_1', '앞서고 안막기', 3, 1,
     '앞서기 자세에서 팔을 안쪽으로 회전하며 안막기 동작을 한다.',
     NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('TAEGEUK_1', '앞서고 얼굴막기', 4, 1,
     '앞서기 자세에서 팔을 얼굴 높이로 들어 올려 얼굴막기 동작을 한다.',
     NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('TAEGEUK_1', '앞서고 지르기', 5, 1,
     '앞서기 자세에서 정면을 향해 주먹을 지른다.',
     NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('TAEGEUK_1', '앞굽이하고 아래막기', 6, 1,
     '앞굽이 자세를 잡으면서 아래막기 동작을 함께 수행한다.',
     NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('TAEGEUK_1', '앞굽이하고 지르기', 7, 1,
     '앞굽이 자세에서 정면을 향해 주먹을 지른다.',
     NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('TAEGEUK_1', '앞굽이하고 아래막고 지르기', 8, 1,
     '앞굽이 자세에서 아래막기 후 곧바로 정면 지르기를 연속으로 수행한다.',
     NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('TAEGEUK_1', '앞차고 앞서고 지르기', 9, 1,
     '앞차기 후 앞서기 자세를 잡으며 정면 지르기를 연속으로 수행한다.',
     NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
-- ON CONFLICT 의 arbiter 는 NON-DEFERRABLE 인 (poomsae, name) UNIQUE 를 사용한다.
-- (poomsae, routine_order) 는 DEFERRABLE INITIALLY DEFERRED 로 정의되어 있어 PostgreSQL 이
-- ON CONFLICT 의 arbiter 로 허용하지 않는다. 또한 routine_order 는 관리자 페이지에서 변경 가능하므로
-- 시드 재실행 시 EXCLUDED 로 덮어쓰지 않고 기존 값을 유지한다 (관리자 변경 보존).
ON CONFLICT ON CONSTRAINT uk_taekwondo_motion_poomsae_name
DO UPDATE SET
    target_reps = EXCLUDED.target_reps,
    description = EXCLUDED.description,
    demo_video_url = COALESCE(EXCLUDED.demo_video_url, taekwondo_motion.demo_video_url),
    thumbnail_url = COALESCE(EXCLUDED.thumbnail_url, taekwondo_motion.thumbnail_url),
    updated_at = CURRENT_TIMESTAMP;
