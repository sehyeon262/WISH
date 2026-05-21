-- V34: 마을 NPC 대화 세션의 script_id 영속화.
-- (이력: 원래 V32 로 develop 에 머지되었으나 동반 V31(dialogue) 가 V33 으로 옮겨가면서 함께 V34 로 재번호.)
--
-- 핵심 결정:
--   - 마을 NPC 가 도메인 스페셜리스트 모델로 전환되면서 한 NPC 가 여러 미니
--     스크립트(보통 3개) 를 가진다. 세션 시작 시 BE 가 "안 본 거 우선" 으로
--     하나 선택해 세션에 박는다. 같은 NPC 를 재방문할 때 이 컬럼을 기준으로
--     이미 본 script 를 제외한다.
--   - 등대지기(YEONGCHEOL)는 catalog 기반이 아니므로 NULL.
--   - 카탈로그 변경에도 세션 분석 안전성을 위해 script_id 도 스냅샷
--     (V33 의 turn metadata snapshot 정책과 동일).

ALTER TABLE dialogue_sessions
    ADD COLUMN script_id VARCHAR(64);

-- 환자별 NPC 재방문 시 "안 본 script 우선" 정책을 위한 인덱스.
CREATE INDEX idx_dialogue_session_patient_npc_script
    ON dialogue_sessions (patient_profile_id, npc_name, script_id);
