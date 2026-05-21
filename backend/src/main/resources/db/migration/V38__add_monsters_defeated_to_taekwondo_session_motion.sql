-- V38: Add monsters_defeated to taekwondo_session_motion for incremental session saving.
--
-- 배경:
--   체조/태권도 세션이 "모든 동작 완료 후 한 방 저장" 에서 "동작 단위 누적 저장" 으로 전환됨.
--   동작 도중 중단해도 그 시점까지 잡은 몬스터 수가 띠 승급 누적에 반영되어야 한다 (S14P31E103-861).
--
-- V37 충돌 정정 (S14P31E103-870):
--   원래 V37 로 작성되었으나 S14P31E103-835 의 V37 (오목 player texture keys) 와 충돌 발생.
--   태권도 측을 V38 로 재번호. V37 (태권도) 가 이미 적용된 환경 (스테이징/로컬) 에서도 안전하게 재실행되도록
--   ADD COLUMN IF NOT EXISTS / DROP CONSTRAINT IF EXISTS 로 idempotent 화한다.
--
-- 핵심 결정:
--   - taekwondo_session_motion 에 monsters_defeated 컬럼을 추가하여 동작 단위로 처치수를 보존한다.
--   - taekwondo_session.monsters_defeated 는 그대로 두고, 동작 저장 시 자식 motion 들의 합으로 재계산한다.

ALTER TABLE taekwondo_session_motion
    ADD COLUMN IF NOT EXISTS monsters_defeated INTEGER NOT NULL DEFAULT 0;

ALTER TABLE taekwondo_session_motion
    DROP CONSTRAINT IF EXISTS ck_taekwondo_session_motion_monsters_defeated_non_negative;

ALTER TABLE taekwondo_session_motion
    ADD CONSTRAINT ck_taekwondo_session_motion_monsters_defeated_non_negative
        CHECK (monsters_defeated >= 0);
