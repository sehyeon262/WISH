-- V5: artworks.sketch_code 를 nullable 로 완화. 자유 그리기 (밑그림 없는 작품) 케이스 지원.
-- 이 파일은 한 번 적용된 후 절대 수정하지 않는다. 변경이 필요하면 V6, V7... 로 추가한다.
-- ddl-auto=validate 이므로 Artwork 엔티티의 @Column(nullable=true, length=50) 와 정확히 일치해야 한다.

ALTER TABLE artworks
    ALTER COLUMN sketch_code DROP NOT NULL;
