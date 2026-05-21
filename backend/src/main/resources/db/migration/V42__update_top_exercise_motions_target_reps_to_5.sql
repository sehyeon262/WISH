-- V42: Reduce TOP exercise motion target_reps from 8 to 5.
--
-- 배경:
--   체조 동작별 목표 횟수를 8회 → 5회로 통일. V10 seed 로 적재된 5종 TOP 동작에 일괄 적용 (S14P31E103-886).

UPDATE exercise_motion
SET target_reps = 5,
    updated_at = CURRENT_TIMESTAMP
WHERE exercise_type = 'TOP'
  AND target_reps <> 5;
