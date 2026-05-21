-- V10: Seed default TOP exercise motions.

INSERT INTO exercise_motion (
    exercise_type,
    name,
    routine_order,
    target_reps,
    description,
    demo_video_url,
    thumbnail_url,
    created_at,
    updated_at
) VALUES
    (
        'TOP',
        '제자리 걷기',
        1,
        8,
        '한쪽 무릎을 들어 올리고 반대쪽 발로 지지하면서 좌우 번갈아 제자리에서 걷는다.',
        NULL,
        NULL,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    ),
    (
        'TOP',
        '사이드 스텝',
        2,
        8,
        '좌우로 옆 스텝을 밟으면서 두 주먹을 가슴 앞에 두고 팔꿈치를 어깨 높이까지 올렸다 내린다.',
        NULL,
        NULL,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    ),
    (
        'TOP',
        '대각선 몸통 지르기',
        3,
        8,
        '주먹을 쥐고 오른쪽 방향으로 몸통을 돌리며 대각선 방향으로 지르고, 좌우를 번갈아 반복한다.',
        NULL,
        NULL,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    ),
    (
        'TOP',
        '대각선 얼굴 지르기',
        4,
        8,
        '주먹을 쥐고 오른쪽 대각선 위 방향으로 얼굴 높이 지르기를 하고, 좌우를 번갈아 반복한다.',
        NULL,
        NULL,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    ),
    (
        'TOP',
        '앉았다 일어서기',
        5,
        8,
        '양발을 어깨 너비로 벌리고 양손을 가슴 앞에서 교차한 상태에서 앉았다가 다시 일어나는 동작을 반복한다.',
        NULL,
        NULL,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    )
ON CONFLICT ON CONSTRAINT uk_exercise_motion_exercise_type_routine_order
DO UPDATE SET
    name = EXCLUDED.name,
    target_reps = EXCLUDED.target_reps,
    description = EXCLUDED.description,
    demo_video_url = COALESCE(EXCLUDED.demo_video_url, exercise_motion.demo_video_url),
    thumbnail_url = COALESCE(EXCLUDED.thumbnail_url, exercise_motion.thumbnail_url),
    updated_at = CURRENT_TIMESTAMP;
