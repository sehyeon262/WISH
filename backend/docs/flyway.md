# Flyway 마이그레이션 운영 규칙

## 철학
- **스키마 소유권은 Flyway**. 모든 프로파일의 `ddl-auto` 는 `validate`. Hibernate 가 DDL 을 만들지 않는다.
- 엔티티 변경과 마이그레이션 스크립트는 같은 커밋에 함께 올린다. drift 는 부팅 단계에서 실패로 드러난다.

## 파일 위치
- `backend/src/main/resources/db/migration/`
- 파일명: `V{버전}__{설명}.sql` — 예: `V2__add_user_profile_image.sql`
- 버전은 단조 증가 정수 (V1, V2, V3, ...)

## 불변 규칙 (반드시 지킬 것)
- **적용된 마이그레이션은 절대 수정하지 않는다.** 이미 어떤 환경(로컬 포함)에서 돌아간 버전 파일은 체크섬이 기록되므로 내용을 바꾸면 이후 부팅 시 Flyway 가 실패한다.
- 잘못 올린 V_n 을 고치고 싶으면 V_n 은 그대로 두고 **V_n+1 을 추가해서 되돌리거나 보정**한다.
- 절대 하지 말 것: `baseline-on-migrate` 켜서 실패 숨기기, 직접 `flyway_schema_history` 테이블 수정, "그냥 삭제하고 다시".

## 새 엔티티/컬럼 추가 절차
1. 엔티티 작성/수정
2. 같은 커밋에 `V{다음번호}__{설명}.sql` 추가 — 엔티티와 컬럼 타입/길이/nullable/제약 이름이 **정확히** 일치해야 `validate` 통과
3. 로컬에서 부팅 → 마이그레이션 적용 & `validate` 통과 확인 → 커밋

## 로컬 DB 리셋 절차
초기 세팅 단계에서는 스키마가 자주 바뀐다. 이전 상태가 꼬이면 깨끗하게 다시 시작한다.

DB 이름/사용자는 본인이 `DB_URL` / `DB_USERNAME` 환경변수로 주입한 값을 사용한다 (예: `DB_URL=jdbc:postgresql://localhost:5432/<DB_NAME>` 의 `<DB_NAME>`). 아래 예시의 `<DB_NAME>` 을 본인 값으로 치환.

```bash
# 1. 앱 중지 후 DB 재생성 (psql 기준)
psql -U postgres -c "DROP DATABASE IF EXISTS <DB_NAME>;"
psql -U postgres -c "CREATE DATABASE <DB_NAME>;"

# 2. 앱 부팅 → Flyway 가 V1 부터 전부 재적용
./gradlew :backend:bootRun
```

> 현재 레포에 팀 공통 `docker-compose.yml` 은 없다. Postgres 를 컨테이너로 운영하는 표준 방식이 팀에서 합의되면 이 섹션에 볼륨 리셋 절차를 추가한다.

## 첫 배포 (dev/prod)
초기 세팅이므로 dev/prod DB 가 한 번도 부팅된 적이 없다 → 기본값(`validate`) 으로 띄우면 Flyway 가 빈 DB 에 V1 을 적용한다. 별도 조치 없음.

(참고: 이미 스키마가 존재하는 환경으로 이관해야 하는 상황이 생기면 그때 별도 Jira 로 `baseline` 운영 절차를 수립한다. 현재는 해당 없음.)
