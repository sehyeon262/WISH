-- V11: Apply ON DELETE policy to all FKs.
--
-- 이전 마이그레이션은 ON DELETE 절을 명시하지 않아 PostgreSQL 기본 NO ACTION 으로 동작 중이었다.
-- 운영 중 사용자/환자 프로필 삭제 흐름이 정의됨에 따라 정책을 명시화한다.
--
-- 정책:
--   - 부모-자식이 소유 관계(보호자→환자→작품/세션)인 경우 CASCADE 로 함께 정리.
--   - 마스터 데이터(exercise_motion)는 RESTRICT 로 보호 — 수행 기록(exercise_session_motion)이
--     남아 있는 동작은 삭제 불가. 비즈니스 레이어의 EX-003 EXERCISE_MOTION_IN_USE 와 같은
--     불변식을 DB 레벨에서 한 번 더 잠근다 (defense in depth).
--
-- PostgreSQL 은 기존 FK 의 ON DELETE 를 ALTER 로 변경할 수 없으므로 DROP 후 ADD 한다.
-- (constraint 이름은 동일하게 유지하여 V9 의 rename 결과와 호환.)

ALTER TABLE patient_profiles DROP CONSTRAINT fk_patient_profiles_user;
ALTER TABLE patient_profiles
    ADD CONSTRAINT fk_patient_profiles_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE artworks DROP CONSTRAINT fk_artworks_patient_profile;
ALTER TABLE artworks
    ADD CONSTRAINT fk_artworks_patient_profile
    FOREIGN KEY (patient_profile_id) REFERENCES patient_profiles(id) ON DELETE CASCADE;

ALTER TABLE exercise_session DROP CONSTRAINT fk_exercise_session_patient;
ALTER TABLE exercise_session
    ADD CONSTRAINT fk_exercise_session_patient
    FOREIGN KEY (patient_id) REFERENCES patient_profiles(id) ON DELETE CASCADE;

ALTER TABLE exercise_session_motion DROP CONSTRAINT fk_exercise_session_motion_session;
ALTER TABLE exercise_session_motion
    ADD CONSTRAINT fk_exercise_session_motion_session
    FOREIGN KEY (session_id) REFERENCES exercise_session(id) ON DELETE CASCADE;

ALTER TABLE exercise_session_motion DROP CONSTRAINT fk_exercise_session_motion_exercise_motion;
ALTER TABLE exercise_session_motion
    ADD CONSTRAINT fk_exercise_session_motion_exercise_motion
    FOREIGN KEY (exercise_motion_id) REFERENCES exercise_motion(id) ON DELETE RESTRICT;
