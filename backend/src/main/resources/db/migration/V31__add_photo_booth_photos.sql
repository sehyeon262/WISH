-- V31: 인생네컷 포토부스 결과물 저장 테이블 추가. 합성된 PNG 1장 + 메타데이터 보관.
-- 이 파일은 한 번 적용된 후 절대 수정하지 않는다. 변경이 필요하면 V32, V33... 로 추가한다.
-- ddl-auto=validate 이므로 PhotoBoothPhoto 엔티티와 컬럼 타입/길이/nullable/제약 이름이 정확히 일치해야 한다.
--
-- 소유자 컬럼: artworks 와 동일하게 보호자 계정(users) 이 아닌 실제 플레이 주체(patient_profiles) 에 귀속.
-- frame_id 는 FE 정적 자산의 프레임 식별자 ("frame-1" 등) — DB 외래키 없음. 프레임 추가/제거는 FE/자산 단에서 결정.

CREATE TABLE photo_booth_photos (
    id                 BIGSERIAL     PRIMARY KEY,
    patient_profile_id BIGINT        NOT NULL,
    frame_id           VARCHAR(50)   NOT NULL,
    image_url          VARCHAR(500)  NOT NULL,
    is_public          BOOLEAN       NOT NULL DEFAULT FALSE,
    created_at         TIMESTAMP(6)  NOT NULL,
    updated_at         TIMESTAMP(6)  NOT NULL,
    CONSTRAINT fk_photo_booth_photos_patient_profile
        FOREIGN KEY (patient_profile_id) REFERENCES patient_profiles(id)
);

-- 마이페이지 "내 인생네컷 최신순" 조회용
CREATE INDEX idx_photo_booth_photos_patient_created
    ON photo_booth_photos (patient_profile_id, created_at DESC);

-- 공개 갤러리 "최신 공개작 최신순" 조회용
CREATE INDEX idx_photo_booth_photos_public_created
    ON photo_booth_photos (is_public, created_at DESC);
