-- V12: Add role column to users for ADMIN authorization (S14P31E103-300).
--
-- 기존 행은 모두 USER 로 채운다 (DEFAULT 'USER' 가 backfill 도 담당).
-- ADMIN 부여는 회원가입 흐름이 아닌 운영자가 환경별 DB 에 직접 SQL (INSERT/UPDATE) 로 처리한다 —
-- 자격증명을 코드/VCS 에 박지 않기 위함. 절차는 backend/docs/admin-bootstrap.md 참고.
-- DEFAULT 는 후속 INSERT 시 role 컬럼 누락 시 안전망.

ALTER TABLE users
    ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'USER';
