-- V6: artworks.title 컬럼 제거. 작품 제목 필드 자체를 도메인에서 제외 (UX 변경 — FE 에서 도안명/날짜 등으로 표시).
-- 이 파일은 한 번 적용된 후 절대 수정하지 않는다. 변경이 필요하면 V7, V8... 로 추가한다.
-- ddl-auto=validate 이므로 Artwork 엔티티에서도 title 필드를 제거해야 부팅 통과한다.

ALTER TABLE artworks
    DROP COLUMN title;
