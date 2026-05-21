-- V18: Add user_login_session for tracking patient app activity time.
--
-- 핵심 결정:
--   - heartbeat 기반: started_at 부터 last_heartbeat_at 까지가 활성 구간, ended_at NULL 이면 진행 중
--   - duration_seconds 는 (last_heartbeat_at - started_at) 캐시 — 일별 집계가 매번 EXTRACT EPOCH 안 떠도 되게
--   - patient 단위: 보호자(user) 가 아닌 환자(patient_profile) 기준으로 활동량을 본다 (다른 컨텐츠와 동일)
--   - ON DELETE CASCADE: 환자 종속 데이터, V11 패턴 일관
--   - 일별 집계 배치(V19) 가 (patient_profile_id, started_at) 인덱스로 group by

CREATE TABLE user_login_session (
    id                  BIGSERIAL           PRIMARY KEY,
    patient_profile_id  BIGINT              NOT NULL,
    started_at          TIMESTAMP(6)        NOT NULL,
    last_heartbeat_at   TIMESTAMP(6)        NOT NULL,
    ended_at            TIMESTAMP(6),
    duration_seconds    INTEGER             NOT NULL DEFAULT 0,
    CONSTRAINT fk_user_login_session_patient
        FOREIGN KEY (patient_profile_id) REFERENCES patient_profiles(id) ON DELETE CASCADE,
    CONSTRAINT ck_user_login_session_duration_non_negative CHECK (duration_seconds >= 0)
);

CREATE INDEX idx_user_login_session_patient_started
    ON user_login_session (patient_profile_id, started_at);
