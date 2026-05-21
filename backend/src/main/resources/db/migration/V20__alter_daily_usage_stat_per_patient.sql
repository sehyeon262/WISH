-- V20: Restructure daily_usage_stat to per-patient granularity (S14P31E103-543 follow-up to 542).
--
-- 배경: V19 가 만든 daily_usage_stat 은 전체 합산 (date, content_type) 단위였지만, 543 의 보호자 통계 조회는
-- 환자별 view 라 그 테이블에서 직접 답이 안 나온다. 정공법은 finest granularity (환자별) 로 저장하고 ADMIN 전체 합은
-- 조회 시 SUM 으로 derive 하는 것 (https://en.wikipedia.org/wiki/Online_analytical_processing).
--
-- 변경:
--   - patient_profile_id 추가 (NOT NULL FK), ON DELETE CASCADE — 환자 삭제 시 통계도 따라 정리
--   - unique_patients 제거 — 환자별 row 에선 항상 1, ADMIN 전체 query 시 COUNT(DISTINCT) 로 derive
--   - UNIQUE 제약을 (date, type, patient) 로 확장
--
-- 기존 데이터는 환자 정보가 없어서 마이그레이션 불가능 → TRUNCATE. 다음 배치(KST 01:00) 가 새 스키마로
-- 다시 적재한다 (운영에서는 V20 적용 직후 수동 trigger 가능 — DailyUsageStatBatchService 에서 수동 호출).

TRUNCATE TABLE daily_usage_stat;

ALTER TABLE daily_usage_stat
    DROP CONSTRAINT uk_daily_usage_stat_date_type,
    DROP COLUMN unique_patients,
    ADD COLUMN patient_profile_id BIGINT NOT NULL,
    ADD CONSTRAINT fk_daily_usage_stat_patient
        FOREIGN KEY (patient_profile_id) REFERENCES patient_profiles(id) ON DELETE CASCADE,
    ADD CONSTRAINT uk_daily_usage_stat_date_type_patient
        UNIQUE (stat_date, content_type, patient_profile_id);

-- 543 조회 패턴: WHERE patient_profile_id = ? AND stat_date BETWEEN ... AND content_type = ?
-- UNIQUE 인덱스가 (date, type, patient) 순이라 patient lookup 시 인덱스 prefix 활용이 안 된다 →
-- 환자 단위 쿼리 가속을 위해 보조 인덱스 추가.
CREATE INDEX idx_daily_usage_stat_patient_date
    ON daily_usage_stat (patient_profile_id, stat_date);
