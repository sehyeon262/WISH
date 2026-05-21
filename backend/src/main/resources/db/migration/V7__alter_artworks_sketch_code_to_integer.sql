-- V7: artworks.sketch_code 컬럼 타입을 VARCHAR(50) → INTEGER 로 교체. FE 가 도안 코드를 정수로 사용하기로 결정된 데 따른 contract 변경.
-- 이 파일은 한 번 적용된 후 절대 수정하지 않는다. 변경이 필요하면 V8, V9... 로 추가한다.
-- ddl-auto=validate 이므로 Artwork 엔티티의 @Column(name="sketch_code") private Integer sketchCode 와 정확히 일치해야 한다.
--
-- 운영 미부팅 + dev 데이터 폐기 가능 전제로 USING 변환 없이 DROP + ADD 로 깔끔하게 교체한다.
-- 기존 행의 sketch_code 값은 모두 NULL 로 초기화된다 (자유 그리기로 다운그레이드 — 상관없는 정책).
-- nullable 정책은 V5 와 동일하게 유지 (자유 그리기 지원).

ALTER TABLE artworks
    DROP COLUMN sketch_code;

ALTER TABLE artworks
    ADD COLUMN sketch_code INTEGER;
