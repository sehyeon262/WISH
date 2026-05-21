-- V4: artworks 테이블 추가. 색칠하기 미술 도메인의 작품 결과물 저장.
-- 이 파일은 한 번 적용된 후 절대 수정하지 않는다. 변경이 필요하면 V5, V6... 로 추가한다.
-- ddl-auto=validate 이므로 Artwork 엔티티와 컬럼 타입/길이/nullable/제약 이름이 정확히 일치해야 한다.
--
-- 소유자 컬럼: 보호자 계정(users) 이 아닌 실제 플레이 주체(patient_profiles) 에 작품을 귀속한다.
-- 현재 정책은 보호자 1명당 환자 1명(1:1) 이지만, 1:N 으로 열릴 때 기존 작품의 환자 귀속을
-- 추론할 수 없는 마이그레이션 함정을 방지하기 위해 처음부터 patient_profile_id 로 잡는다.

CREATE TABLE artworks (
    id                    BIGSERIAL     PRIMARY KEY,
    patient_profile_id    BIGINT        NOT NULL,
    sketch_code           VARCHAR(50)   NOT NULL,
    title                 VARCHAR(50),
    image_url             VARCHAR(500)  NOT NULL,
    play_duration_seconds INTEGER       NOT NULL DEFAULT 0,
    is_public             BOOLEAN       NOT NULL DEFAULT FALSE,
    created_at            TIMESTAMP(6)  NOT NULL,
    updated_at            TIMESTAMP(6)  NOT NULL,
    CONSTRAINT fk_artworks_patient_profile FOREIGN KEY (patient_profile_id) REFERENCES patient_profiles(id)
);

-- 마이페이지 "환자별 작품 최신순" 조회용
CREATE INDEX idx_artworks_patient_created ON artworks (patient_profile_id, created_at DESC);

-- 공개 갤러리 "최신 공개작 최신순" 조회용
CREATE INDEX idx_artworks_public_created  ON artworks (is_public, created_at DESC);
