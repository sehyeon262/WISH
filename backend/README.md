# Backend

`comong` 게임 서비스의 백엔드 애플리케이션.

## 기술 스택

- Java 21
- Spring Boot 4.0.5
- Gradle 9.4.1
- PostgreSQL
- Spring Data JPA (Hibernate)

> Spring Boot 4.0 모듈화로 starter POM 이름이 3.x 와 다릅니다. `spring-boot-starter-web` → `spring-boot-starter-webmvc`, feature별 `*-test` starter 등. 의존성 추가 시 4.0 기준 이름을 확인하세요.

## 실행 방법

### 1. 필수 환경

- JDK 21
- PostgreSQL (로컬 DB 기동 필요)

### 2. 환경 변수

#### 필수 (모든 프로파일)

| 변수 | 설명 | 예시 |
| --- | --- | --- |
| `DB_URL` | JDBC URL | `jdbc:postgresql://localhost:5432/comong` |
| `DB_USERNAME` | DB 사용자 | `comong` |
| `DB_PASSWORD` | DB 비밀번호 | `comong` |
| `SPRING_PROFILES_ACTIVE` | 프로파일 (미설정 시 `local`) | `local` / `dev` / `prod` |

#### 선택 (기본값 존재)

| 변수 | 설명 | 기본값 | 운영 권장 |
| --- | --- | --- | --- |
| `JWT_SECRET` | JWT 서명 키 (HS256, **32자 이상**) | 로컬 전용 플레이스홀더 | ✅ **반드시 강한 랜덤값으로 오버라이드** |
| `JWT_ACCESS_TTL_SECONDS` | Access 토큰 유효시간 (초) | `3600` (1시간) | 정책에 맞춰 조정 |
| `JWT_ISSUER` | 토큰 발급자 (`iss` 클레임) | `comong` | 필요 시 변경 |
| `LIVEKIT_URL` | LiveKit Cloud 서버 URL | (빈 값) | ✅ 실시간 모니터링 토큰 발급 전 주입 |
| `LIVEKIT_API_KEY` | LiveKit API key | (빈 값) | ✅ 서버 환경변수로만 주입 |
| `LIVEKIT_API_SECRET` | LiveKit API secret | (빈 값) | ✅ 서버 환경변수로만 주입, git/Jira/Slack 평문 공유 금지 |
| `FIREBASE_PUSH_ENABLED` | FCM push 발송 활성화 여부 | `false` | Firebase 인증 정보가 설정된 dev/prod 에서만 `true` |
| `FIREBASE_PROJECT_ID` | Firebase project ID | (빈 값) | Firebase Console 의 project ID |
| `FIREBASE_CREDENTIALS_BASE64` | Firebase service account JSON 을 base64 로 인코딩한 값 | (빈 값) | EC2 `.env.dev` 등 서버 환경변수로만 주입, git/Jira/Slack 평문 공유 금지 |
| `GMS_KEY` | GMS Anthropic Claude API 키 (등대지기 LLM) | (빈 값) | ✅ dev/prod 에서 주입. 미설정 시 Claude 비활성, 항상 fallback scene |
| `GMS_ANTHROPIC_BASE_URL` | GMS 엔드포인트 | `https://gms.ssafy.io/gmsapi/api.anthropic.com/v1` | 운영 도메인 변경 시만 |
| `GMS_ANTHROPIC_MODEL` | Claude 모델 ID | `claude-sonnet-4-5-20250929` | 모델 업그레이드 시 |
| `GMS_ANTHROPIC_VERSION` | Anthropic API 버전 헤더 | `2023-06-01` | API 스펙 변경 시 |
| `GMS_ANTHROPIC_TIMEOUT_SECONDS` | Claude 응답 timeout (초) | `5` | 네트워크 환경 따라 조정 |

> ⚠️ `JWT_SECRET` 의 기본값은 로컬 개발 편의용 플레이스홀더입니다. `dev`/`prod` 환경에서는 외부에서 반드시 주입하세요. 유출되면 토큰 위조 가능.
> 랜덤값 생성 예: `openssl rand -base64 48`
> Firebase service account JSON 원문과 `FIREBASE_CREDENTIALS_BASE64` 값은 절대 커밋하지 마세요. 예시 파일에는 placeholder만 두고, EC2 `.env.dev` 에만 실제 값을 주입합니다.


Firebase service account JSON 을 base64 로 변환하는 예시는 다음과 같습니다.

```bash
base64 -w 0 firebase-service-account.json
```

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\path\to\firebase-service-account.json"))
```

IntelliJ `Run Configuration > Environment variables` 또는 쉘 `export` 로 주입.

### 3. 빌드 & 실행

```bash
./gradlew bootRun
# 또는
./gradlew build && java -jar build/libs/backend-0.0.1-SNAPSHOT.jar
```

기본 포트: `8080`, 컨텍스트 경로: `/api/v1`
- 헬스체크: `GET /api/v1/actuator/health`
- **API 문서 (Swagger UI)**: `http://localhost:8080/api/v1/swagger-ui.html` (local/dev 전용, prod 비활성화)
- OpenAPI JSON: `http://localhost:8080/api/v1/v3/api-docs`

## 프로파일

| 프로파일 | 용도 | JPA `ddl-auto` | 로깅 |
| --- | --- | --- | --- |
| `local` | 개발자 로컬 | `validate` + SQL 로그 | CONSOLE, 앱 DEBUG, SQL/바인딩 TRACE |
| `dev` | 통합 개발 서버 | `validate` | CONSOLE + FILE, 앱 DEBUG |
| `prod` | 운영 | `validate` | CONSOLE + FILE, root WARN / 앱 INFO |

> 스키마 변경은 Flyway 가 담당합니다. Hibernate 는 전 프로파일에서 `validate` 로 통일되어 DDL 을 만들지 않고 엔티티-스키마 일치 여부만 검증합니다. 자세한 운영 규칙은 [docs/flyway.md](docs/flyway.md) 참고.

로그 파일은 `./logs/backend.log` 에 쌓이며 100MB/30일 기준으로 롤링됩니다.

## 디렉토리 구조

```
backend/src/main/java/com/comong/backend
├─ BackendApplication.java
├─ global/                 # 애플리케이션 전역 요소
│  ├─ common/response/     # ApiResponse 등 공통 응답 포맷
│  ├─ config/              # 설정 클래스
│  └─ exception/           # ErrorCode, BusinessException, GlobalExceptionHandler
└─ domain/                 # 비즈니스 도메인별 패키지
   └─ user/
      ├─ controller/
      ├─ service/
      ├─ repository/
      ├─ entity/
      ├─ dto/
      └─ exception/        # UserErrorCode 등 도메인 에러 enum
```

## 테스트

Testcontainers 가 실제 Postgres 컨테이너를 띄워 Flyway 마이그레이션 적용 + JPA `ddl-auto=validate` 로
엔티티-스키마 정합성을 검증합니다. 마이그레이션 SQL 또는 엔티티 매핑이 어긋나면 컨텍스트 로드 단계에서 실패합니다.

```bash
./gradlew test
```

### 필수 환경

- **Docker** (Docker Desktop 등) 가 실행 중이어야 합니다. Testcontainers 가 Docker 데몬 API 로 컨테이너를 기동합니다.
- 첫 실행은 `postgres:16-alpine` 이미지를 풀링하므로 수십 초 정도 걸릴 수 있습니다.

### 트러블슈팅

`Could not find a valid Docker environment` 또는 컨테이너 생성 실패가 뜨면:

- Docker Desktop 이 켜져 있는지 (`docker info` 로 확인)
- WSL 통합 / Linux containers 모드인지
- 그래도 안 되면 셸에서 `DOCKER_HOST` 를 지정 후 재시도
  - Windows PowerShell: `$env:DOCKER_HOST="npipe:////./pipe/dockerDesktopLinuxEngine"`
  - Linux/macOS: `export DOCKER_HOST=unix:///var/run/docker.sock`
- 통합 테스트는 GitLab CI 에서 DinD 로도 검증되므로, 로컬 Docker 디버깅이 막히면 일단 푸시 후 CI 로 확인 가능

## 코드 포매팅

Spotless + Google Java Format 으로 강제합니다.

```bash
./gradlew spotlessApply   # 자동 수정
./gradlew spotlessCheck   # 검사만
```

빌드·CI 가 `spotlessCheck` 를 포함하므로 포맷이 어긋난 코드는 머지 불가입니다.

## 코드 컨벤션

별도 문서 참고: [docs/conventions.md](docs/conventions.md)

새 도메인을 추가할 때는 `domain/user/` 구조를 복붙해서 따라가세요.
