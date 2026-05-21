-- V3: patient_profiles.user_id 에 unique 제약 추가.
-- 보호자 1명당 환자 1명 정책을 DB 레벨에서 강제한다 (서비스 선검사만으로는 TOCTOU race 가 열려있음).
-- 119/121 회원가입 race 와 동일한 패턴: pre-check 는 UX 용 빠른 실패, DB unique 가 최종 invariant.
-- 정책이 1:N 으로 열리는 시점에 이 unique 를 드랍하고 응답 DTO/UX 를 함께 변경한다.

ALTER TABLE patient_profiles
    ADD CONSTRAINT uk_patient_profiles_user_id UNIQUE (user_id);
