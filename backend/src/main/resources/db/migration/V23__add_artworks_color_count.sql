-- V23: artworks 테이블에 사용한 색 개수(color_count) 컬럼 추가.
-- FE 색칠/자유드로잉 씬에서 작품 저장/수정 시 사용한 distinct 색 개수를 전송한다 (선행 [S14P31E103-603]).
-- 기존 행은 0 으로 백필 — 응답 DTO 직렬화 시 0 이 내려가지만 FE 응답 타입은 옵셔널이라 안전.
-- 도안마다 팔레트 크기가 다를 수 있어 상한값은 두지 않고 음수만 차단한다.

ALTER TABLE artworks
    ADD COLUMN color_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE artworks
    ADD CONSTRAINT ck_artworks_color_count_non_negative
        CHECK (color_count >= 0);
