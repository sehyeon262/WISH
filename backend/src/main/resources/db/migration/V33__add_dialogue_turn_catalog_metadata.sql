-- V33: Add catalog-driven metadata columns to dialogue_turns.
-- (이력: 원래 V31 로 develop 에 머지되었으나 photo_booth V31 과 충돌하여 V33 으로 재번호.
--  dev DB 의 flyway_schema_history 에는 V31 photo_booth 만 적용된 상태였으므로 안전하게 재번호.)
--
-- 핵심 결정:
--   - valence / tone 은 BE 카탈로그(JSON) 기반 응답 분류·정서 카테고리. 보호자 화면의
--     "응답 톤 비율" 위젯 (긍정/보통/부정) 과 안정/피로/걱정 분포의 데이터 소스.
--   - topic_keywords / sentiment_words 는 JSONB. 주제 태그 위젯 + 채팅 말풍선
--     단어 하이라이트의 raw 데이터.
--   - 새 컬럼은 모두 *nullable* — 기존 V21 시점 turn (FE-driven, catalog 미적용)
--     은 그대로 두기 위함. B2 이후 신규 turn 은 BE 카탈로그에서 채움.
--   - JSONB default '[]' 로 빈 리스트 보존 — null vs 빈 배열 혼동 차단.
--   - enum 값은 CHECK 으로 잠금. NULL 은 통과 (3치 논리).

ALTER TABLE dialogue_turns
    ADD COLUMN valence         VARCHAR(16),
    ADD COLUMN tone            VARCHAR(16),
    ADD COLUMN topic_keywords  JSONB        NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN sentiment_words JSONB        NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE dialogue_turns
    ADD CONSTRAINT ck_dialogue_turn_valence
        CHECK (valence IS NULL OR valence IN ('POSITIVE', 'NEUTRAL', 'NEGATIVE')),
    ADD CONSTRAINT ck_dialogue_turn_tone
        CHECK (tone IS NULL OR tone IN ('CALM', 'TIRED', 'WORRIED'));
