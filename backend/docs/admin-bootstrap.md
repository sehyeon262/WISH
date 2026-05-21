# ADMIN 계정 부트스트랩

운영 환경에 ADMIN 계정을 등록하는 절차. **마이그레이션이나 코드에 자격증명을 박지 않는다** — 환경별로 운영자가 직접 DB 에 SQL 을 실행한다.

## 왜 수동인가

대안으로 (1) Flyway 마이그레이션에 INSERT (2) 환경변수 기반 부팅 시 promote 가 있었으나 모두 기각.

| 대안 | 기각 사유 |
| --- | --- |
| Flyway 마이그레이션에 INSERT | BCrypt 해시도 결국 비밀번호의 지문이라 git 에 들어가면 무제한 오프라인 brute-force 표면이 생김. 또 모든 환경(local/dev/prod)이 같은 admin 자격증명을 공유하게 됨 |
| 부팅 시 env-based promote | 자동화 가치가 admin 추가 빈도(매우 낮음) 대비 작고, env 변경 시 재배포 사이클이 SQL 한 줄보다 무거움. 코드 경로에서 사용자 데이터를 자동 변형하는 부분이 감사 측면에서 표면적 |

수동 SQL 의 트레이드오프는 **ops runbook 의존성** — 본 문서가 그 runbook.

## 절차

### 1. BCrypt 해시 생성

application 이 사용하는 `BCryptPasswordEncoder` 와 동일한 알고리즘으로 생성해야 한다. 가장 간단한 방법은 본인 로컬에서 한 번만 띄우는 Java 스니펫:

```bash
# 프로젝트 루트에서
./gradlew :backend:bootRun --console=plain &
# bootRun 이 떠 있는 동안, 다른 터미널에서:
```

또는 임시 main 메서드 / JUnit 테스트:

```java
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

public class HashGen {
    public static void main(String[] args) {
        // args[0] = 평문 비밀번호
        System.out.println(new BCryptPasswordEncoder().encode(args[0]));
    }
}
```

> **주의**: 평문 비밀번호를 shell history / IDE recent runs 에 남기지 말 것. 입력은 stdin 으로 받거나 메모리에서만 다룬다.

대안: `htpasswd -B -n -b admin '<plain>'` (htpasswd 의 BCrypt 출력은 Spring Security 와 호환).

### 2. 새 ADMIN 계정 생성

기존 사용자가 없는 경우 (가장 흔한 케이스):

```sql
INSERT INTO users (email, nickname, password, role, created_at)
VALUES ('admin@comong', 'admin', '<bcrypt-hash-from-step-1>', 'ADMIN', NOW());
```

### 3. 기존 USER 를 ADMIN 으로 승격

이미 본인이 보호자 계정으로 회원가입한 상태라면 INSERT 대신 UPDATE:

```sql
UPDATE users
SET role = 'ADMIN'
WHERE email = 'guardian@example.com';
```

### 4. 검증

ADMIN 토큰으로 admin endpoint 호출이 통과하는지 확인. 가장 빠른 방법은 새 계정으로 로그인 → 받은 토큰으로 `POST /exercise-motions` 등 호출:

```bash
TOKEN=$(curl -s -X POST '<base>/auth/login' \
    -H 'Content-Type: application/json' \
    -d '{"email":"admin@comong","password":"<plain>"}' \
    | jq -r '.data.accessToken')

curl -X POST '<base>/exercise-motions' \
    -H "Authorization: Bearer $TOKEN" \
    -H 'Content-Type: application/json' \
    -d '{"exerciseType":"TOP","name":"테스트","routineOrder":99,"targetReps":1,"description":"verify"}'
```

201 이면 통과. 403 이면 토큰 발급 시점에 role 이 USER 였을 가능성이 큼 — 재로그인.

## ADMIN 추가/제거 / 강등

- **추가**: 위 1~3 절차 반복.
- **강등**: `UPDATE users SET role = 'USER' WHERE email = '...';` 후 본인은 토큰 만료 (TTL 1시간) 까지 권한 유지하므로 즉시 끊으려면 DB 토큰 무효화 메커니즘이 따로 필요 (현재 미도입).
- **삭제**: `DELETE FROM users WHERE email = '...';` — FK CASCADE 가 적용되어 환자 프로필/작품/세션 기록도 함께 사라진다 ([V11 정책](../src/main/resources/db/migration/V11__apply_on_delete_policy.sql)). 의도와 일치하는지 반드시 확인.

## 환경별 주의

| 환경 | 접근 경로 | 권한 |
| --- | --- | --- |
| local | `psql -U <user> -d <db>` 직접 | 본인 |
| dev | DB 컨테이너 `docker exec` 또는 ssh 터널 + psql | 인프라 담당과 협의 |
| prod | 운영 DB 접근 권한 보유자만 | 변경 사실을 슬랙/노션에 기록 (감사) |

운영 ADMIN 계정 자격증명은 비밀 관리 도구(1Password / Bitwarden 등)에 보관. 이메일·해시·평문을 git/Jira/Slack 평문에 남기지 말 것.

## 코드 위치

- `User#promoteToAdmin()` — 도메인 메서드. 향후 admin UI 가 생기면 여기로 들어옴
- `UserRole` enum — `domain/user/entity/UserRole.java`
- 권한 보호 — `@PreAuthorize("hasRole('ADMIN')")` (현재 `ExerciseMotionController` 의 CUD 만 사용)
- 토큰 발행 시 role claim 박는 곳 — `JwtTokenProvider#createAccessToken`
