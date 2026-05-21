-- V2: patient_profiles 테이블 추가. 보호자 계정(User) 기반 환자 프로필 관리.
-- 이 파일은 한 번 적용된 후 절대 수정하지 않는다. 변경이 필요하면 V3, V4... 로 추가한다.
-- ddl-auto=validate 이므로 PatientProfile 엔티티와 컬럼 타입/길이/nullable/제약 이름이 정확히 일치해야 한다.

CREATE TABLE patient_profiles (
    id         BIGSERIAL     PRIMARY KEY,
    user_id    BIGINT        NOT NULL,
    name       VARCHAR(50)   NOT NULL,
    nickname   VARCHAR(30)   NOT NULL,
    birth_date DATE          NOT NULL,
    gender     VARCHAR(10)   NOT NULL,
    created_at TIMESTAMP(6)  NOT NULL,
    CONSTRAINT fk_patient_profiles_user FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX idx_patient_profiles_user_id ON patient_profiles (user_id);
