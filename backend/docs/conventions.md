# 백엔드 코드 컨벤션

팀 공통 규약입니다. PR 리뷰 시 이 문서를 기준으로 논의합니다.

## 1. 패키지 구조

```
com.comong.backend
├─ global/        # 애플리케이션 전역
│  ├─ common/     # 공통 유틸/응답 포맷 등
│  ├─ config/     # @Configuration 클래스
│  └─ exception/  # 공통 예외 처리
└─ domain/        # 비즈니스 도메인
   └─ <도메인>/
      ├─ controller/
      ├─ service/
      ├─ repository/
      ├─ entity/
      ├─ dto/
      └─ exception/  # 해당 도메인 전용 ErrorCode enum
```

**원칙**
- 도메인 간 의존은 **service 레이어**에서만 허용 (repository/entity 크로스 참조 금지)
- `global/` 패키지는 도메인을 import 하지 않는다 (역방향 의존 금지)
- 공통 추상 클래스/인터페이스는 `global/common/` 에 둔다

## 2. 공통 응답 포맷

모든 REST 응답은 `ApiResponse<T>` 로 감싼다.

```json
{ "code": "SUCCESS", "message": "OK", "data": { ... } }
```

### 사용

```java
return ResponseEntity.ok(ApiResponse.success(dto));
return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(dto));
```

실패 응답은 **직접 만들지 말 것.** `BusinessException` 을 던지면 `GlobalExceptionHandler` 가 알아서 변환한다.

### 필드 설명

| 필드 | 성공 | 비즈니스 실패 | 검증 실패 |
| --- | --- | --- | --- |
| `code` | `"SUCCESS"` | `"U-001"` 등 | `"G-001"` |
| `message` | `"OK"` | 에러코드 정의 메시지 | 입력값 오류 메시지 |
| `data` | 도메인 응답 DTO | `null` | `null` |
| `errors` | `null` | `null` | `{"field": "메시지"}` |

Jackson `@JsonInclude(NON_NULL)` 로 `null` 필드는 응답에서 제외된다.

## 3. 에러 코드 규칙

### 접두사 배정

| 접두사 | 영역 | 예시 |
| --- | --- | --- |
| `G-` | 전역/공통 | `G-001` 입력값 오류, `G-003` 인증 필요, `G-004` 접근 권한 없음 |
| `U-` | User 도메인 | `U-001` 사용자 없음, `U-002` 이메일 중복 |
| `A-` | Auth 도메인 | `A-001` 자격증명 불일치, `A-002` 토큰 만료 |
| `P-` | Patient 도메인 (환자 프로필) | `P-001` 프로필 없음, `P-002` 프로필 중복 |
| `S-` | Storage (이미지 업로드/저장소) | `S-001` 유효 이미지 아님, `S-002` 처리 실패, `S-003` 파일 크기 초과 |
| `AR-` | Artwork 도메인 | `AR-001` 작품 없음, `AR-002` 접근 권한 없음 |
| `EX-` | Exercise 도메인 (체조) | `EX-001` 동작 없음, `EX-003` 사용 중 동작, `EX-005` 세션 없음 |
| `DL-` | Dialogue 도메인 (NPC 대화) | `DL-001` 세션 없음, `DL-002` 세션 접근 권한 없음 |
| `(새 접두사)` | 새 도메인 | 신규 도메인 추가 시 팀 논의로 결정 (충돌 회피 — 위 표에서 사용 중인 prefix 와 겹치지 않게) |

### enum 정의

각 도메인은 `<도메인>/exception/` 하위에 enum을 둔다.

```java
@Getter
@RequiredArgsConstructor
public enum UserErrorCode implements ErrorCode {
    USER_NOT_FOUND(HttpStatus.NOT_FOUND, "U-001", "사용자를 찾을 수 없습니다."),
    EMAIL_DUPLICATED(HttpStatus.CONFLICT, "U-002", "이미 사용 중인 이메일입니다.");

    private final HttpStatus status;
    private final String code;
    private final String message;
}
```

**메시지는 사용자에게 노출되는 한글 텍스트**로 작성한다 (프론트가 그대로 표시 가능).

## 4. 예외 처리

### 비즈니스 예외

서비스 레이어에서 에러 상황은 항상 `BusinessException` 으로 던진다.

```java
User user = userRepository.findById(id)
    .orElseThrow(() -> new BusinessException(UserErrorCode.USER_NOT_FOUND));
```

금지:
- `throw new RuntimeException(...)`
- `throw new IllegalArgumentException(...)` (입력 검증은 DTO의 `@Valid` 로)
- Controller 에서 `try/catch` 로 상태코드 변환

### 검증 예외

요청 DTO에 Jakarta Validation 어노테이션(`@NotBlank`, `@Email`, `@Size` 등)을 붙이고 컨트롤러에서 `@Valid` 로 받는다. 필드별 메시지는 `GlobalExceptionHandler` 가 Map 으로 만들어 `errors` 에 담아준다.

### 처리되지 않은 예외

`GlobalExceptionHandler.handleUnexpectedException` 에서 500 으로 처리 + `log.error`. 이 로그가 찍히면 **버그**로 간주하고 원인 제거가 우선 (fallback 에 의존하지 않기).

## 5. 엔티티 규칙

- 기본 생성자 접근자: `@NoArgsConstructor(access = AccessLevel.PROTECTED)`
- 객체 생성은 `@Builder` + private 생성자로만 허용 (무분별한 setter 금지)
- setter 는 쓰지 않고, 상태 변경은 의미 있는 메서드(`user.changeNickname(...)`)로 표현
- 테이블명은 **복수형** (`users`, `games`) 으로 통일
- `createdAt` / `updatedAt` 은 `@PrePersist` / `@PreUpdate` 또는 JPA Auditing 사용
- **빌더 필수 필드 검증**: `@ManyToOne(optional = false)` / `@Column(nullable = false)` 만으로는 `build()` 시점에 null 차단이 안 되고 JPA save 단계의 `PropertyValueException` 으로 늦게 발견된다. 빌더 생성자에서 `Objects.requireNonNull(field, "field must not be null")` 로 즉시 fail-fast. 도메인 invariant (`playDurationSeconds >= 0` 등) 도 같은 위치에서 검사 (예: `User`, `PatientProfile`, `Artwork` 참고)

### FK / ON DELETE 정책

신규 도메인이 외래키를 추가할 때 Flyway 마이그레이션의 `FOREIGN KEY (...) REFERENCES ...` 절에 **반드시 `ON DELETE` 를 명시**한다. 누락 시 PostgreSQL 기본 `NO ACTION` 으로 동작하지만, 정책이 코드/리뷰에 드러나지 않으면 운영 단계에서 부모 행 삭제가 어떻게 전파되는지 추측해야 한다.

선택 가이드:

| 관계 유형 | 권장 | 이유 |
| --- | --- | --- |
| 부모-자식이 **소유 관계** (보호자 → 환자 → 작품/세션 등) | `ON DELETE CASCADE` | 부모 삭제 시 자식 데이터도 함께 정리하는 것이 자연스러움. 사용자/환자 탈퇴 흐름이 단순해진다. |
| **마스터 데이터** 참조 (exercise_motion 등 시스템 공유 데이터) | `ON DELETE RESTRICT` | 사용 중인 마스터 행 삭제를 DB 레벨에서 차단. 비즈니스 단의 `IN_USE` 예외와 같은 불변식을 DB 가 다시 잠그는 defense in depth. |
| 자식이 부모 없이도 **독립 의미** | `ON DELETE SET NULL` | (현재 사용처 없음) FK 컬럼이 nullable 일 때만 사용 가능. 작품을 환자 삭제 후에도 보존하는 등 특수한 경우. |

현재 적용된 정책은 [`V11__apply_on_delete_policy.sql`](../src/main/resources/db/migration/V11__apply_on_delete_policy.sql) 참고. 새 FK 추가 시 이 표 기준으로 결정하고, 결정 근거가 표에 없으면 팀과 논의 후 표를 갱신한다.

## 6. DTO 규칙

- 요청/응답 모두 `record` 사용 (불변 + 간결)
- 엔티티를 Controller 에 그대로 노출하지 않는다 — 반드시 DTO 변환
- 변환 메서드는 DTO 에 둔다 (`UserSignupRequest#toEntity()`, `UserResponse#from(User)`)

## 7. 서비스 레이어

- `@Transactional(readOnly = true)` 를 **클래스 레벨**에 기본으로 둔다
- 쓰기 메서드에만 `@Transactional` 재선언
- `@RequiredArgsConstructor` + `final` 필드로 생성자 주입 (필드/세터 주입 금지)

## 8. 컨트롤러 레이어

- REST 관례 준수
  - 생성: `POST /<resource>` → `201 Created`
  - 조회: `GET /<resource>/{id}` → `200 OK`
  - 수정: `PUT` 또는 `PATCH`
  - 삭제: `DELETE` → `204 No Content`
- 컨트롤러는 **DTO 변환과 HTTP 상태코드만** 담당. 비즈니스 로직 금지
- URL 은 소문자 복수형 (`/users`, `/games`)

## 9. 새 도메인 추가 가이드

1. `domain/<도메인>/` 디렉토리 생성
2. `domain/user/` 의 서브 구조(`controller/service/repository/entity/dto/exception`) 복사
3. 새 `<도메인>ErrorCode` enum 작성 및 접두사 배정 (팀과 협의)
4. 엔티티 → 레포지토리 → DTO → 서비스 → 컨트롤러 순으로 구현
5. 필요시 Flyway 마이그레이션 스크립트 추가 (도입 시점에 가이드 업데이트 예정)

## 10. 코드 포매팅 (Spotless)

[Spotless](https://github.com/diffplug/spotless) + **Google Java Format** 으로 전체 포맷을 강제한다.

### 개발자 사용법

```bash
# 포맷 어긋나면 자동 수정
./gradlew spotlessApply

# 포맷 검사만 (CI 에서 동일하게 실행)
./gradlew spotlessCheck
```

`./gradlew build`, `./gradlew check` 는 내부적으로 `spotlessCheck` 를 실행한다. **포맷이 어긋난 코드는 빌드 실패 → PR 머지 불가.**

### 규칙 요약

- Google Java Format 1.28 **AOSP variant** (4-space indent, 100자 라인)
- import 순서: `java → javax → jakarta → org → com → (기타)`
- 미사용 import 자동 제거
- 파일 끝 개행 강제, trailing whitespace 제거

### IntelliJ 연동 (선택)

1. `Plugins → Marketplace` 에서 **google-java-format** 설치 후 재시작
2. `Settings → Other Settings → google-java-format Settings` → Enable 체크, **Code style: AOSP**
3. `Help → Edit Custom VM Options...` 에 JDK 16+ 용 `--add-exports` 옵션 6줄 추가 후 **IntelliJ 완전 재시작**
   ```
   --add-exports=jdk.compiler/com.sun.tools.javac.api=ALL-UNNAMED
   --add-exports=jdk.compiler/com.sun.tools.javac.code=ALL-UNNAMED
   --add-exports=jdk.compiler/com.sun.tools.javac.file=ALL-UNNAMED
   --add-exports=jdk.compiler/com.sun.tools.javac.parser=ALL-UNNAMED
   --add-exports=jdk.compiler/com.sun.tools.javac.tree=ALL-UNNAMED
   --add-exports=jdk.compiler/com.sun.tools.javac.util=ALL-UNNAMED
   ```
   ⚠️ 반드시 **`=` 포함 형식**으로 작성할 것 (공백 구분자는 JVM은 인식해도 플러그인 감지 로직이 못 잡아서 "Configure the JRE" 알림이 계속 뜸)
4. `Settings → Tools → Actions on Save` → **Reformat code (Whole file)** + **Optimize imports** 체크

이렇게 하면 커밋 전 `spotlessApply` 를 매번 돌리지 않아도 된다.

## 11. API 문서 (Springdoc OpenAPI)

Swagger UI 가 `/swagger-ui.html` 에 자동 생성된다. 컨트롤러/DTO 만 제대로 작성해도 기본 문서는 나오지만, 프론트·기획자 가독성을 위해 어노테이션으로 설명을 추가한다.

### 권장 어노테이션

```java
@Operation(summary = "회원가입", description = "이메일과 닉네임으로 신규 회원을 등록한다")
@ApiResponse(responseCode = "201", description = "가입 성공")
@ApiResponse(responseCode = "409", description = "이메일/닉네임 중복")
@PostMapping
public ResponseEntity<ApiResponse<UserResponse>> signup(@Valid @RequestBody UserSignupRequest request) { ... }
```

DTO 필드에도 설명 추가 가능:
```java
public record UserSignupRequest(
        @Schema(description = "이메일 주소", example = "test@comong.com")
        @NotBlank @Email String email,
        ...
) { }
```

### `ApiResponse` 이름 충돌

자체 응답 record `com.comong.backend.global.common.response.ApiResponse` 와 Swagger 어노테이션 `io.swagger.v3.oas.annotations.responses.ApiResponse` 가 동명 — 같은 컨트롤러에서 둘 다 쓰면 컴파일 ambiguous. **자체 record 가 메서드 시그니처마다 등장**하므로 import 는 자체 쪽을 가져가고, **Swagger 어노테이션은 fully-qualified** 로 적는다. (S14P31E103-504)

```java
import com.comong.backend.global.common.response.ApiResponse;          // 자체 record
import io.swagger.v3.oas.annotations.responses.ApiResponses;            // 묶음 어노테이션은 import OK
// io.swagger.v3.oas.annotations.responses.ApiResponse 는 import 하지 않음

@ApiResponses({
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "..."),
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "...")
})
public ResponseEntity<ApiResponse<Foo>> get(...) { ... }
```

### 동일 status code 에 여러 ErrorCode 가 매핑되는 경우

OpenAPI 스펙상 한 메서드에 같은 `responseCode` 는 한 개만 등록 가능. 같은 status (예: 404) 가 여러 도메인 ErrorCode (P-001, TK-006 등) 로 갈리면 **description 에 모두 나열 + 응답 body 의 `code` 필드 참조 안내** 를 적는다. 클라이언트는 status code 가 아닌 body 의 `code` 로 분기한다 (2장 참조).

```java
@io.swagger.v3.oas.annotations.responses.ApiResponse(
    responseCode = "404",
    description = "환자 프로필이 없거나 본인 소유가 아님 (P-001), 또는 진척도 데이터 없음 (TK-006). "
                + "응답 body 의 code 필드로 구분.")
```

### 프로파일별 활성화

| 프로파일 | Swagger UI | OpenAPI JSON |
| --- | --- | --- |
| `local` / `dev` | ✅ 활성 | ✅ 활성 |
| `prod` | ❌ 차단 | ❌ 차단 |

`application-prod.yaml` 에서 `springdoc.*.enabled: false` 로 강제.
운영 환경에 API 스펙을 외부 노출하지 않기 위함. 필요시 (파트너 공개 등) 팀 논의 후 해제.

### Server URL — 자동 추론에 맡길 것

`OpenApiConfig` 의 `OpenAPI` 빈에 `addServersItem(...)` 을 박지 않는다. 명시하는 순간 springdoc 가 요청 URL 기반 자동 추론을 끈다. dev 의 nginx 가 `X-Forwarded-Prefix=/dev/api/v1` 을 보내고 백엔드는 `server.forward-headers-strategy: framework` 로 받기 때문에, 자동 추론이 동작해야 환경별 base URL 이 알아서 박힌다 (S14P31E103-291 회귀).

## 12. 인증 / 인가

### 방식

- **Stateless JWT** 기반. 세션/쿠키/CSRF/formLogin/httpBasic 모두 비활성.
- `Authorization: Bearer <access_token>` 헤더로 인증.
- 필터: `JwtAuthenticationFilter` 가 `UsernamePasswordAuthenticationFilter` 앞에서 토큰 검증.

### 공개 엔드포인트

`SecurityConfig.PUBLIC_ENDPOINTS` 에 정의. 변경 시 팀 리뷰 필수.

- `/auth/**` (회원가입, 로그인 등)
- `/actuator/health`
- `/v3/api-docs/**`, `/swagger-ui.html`, `/swagger-ui/**`

그 외 모든 엔드포인트는 **인증 필요**.

### 실패 응답

| 상황 | 상태 | 코드 |
| --- | --- | --- |
| 토큰 없음 / 유효하지 않음 | 401 | `G-003` |
| 인가 실패 (권한 부족) | 403 | `G-004` |
| 로그인 자격증명 불일치 | 401 | `A-001` |
| 토큰 만료 | 401 | `A-002` |

→ `RestAuthenticationEntryPoint` / `RestAccessDeniedHandler` 가 `ApiResponse` 포맷으로 변환.

### 비밀번호

- 저장은 **BCrypt 해시**만 (`PasswordEncoder` 빈 사용). 평문 저장 금지.
- DTO 검증: 영문/숫자/특수문자 각 1개 이상, 8~64자.

### JWT 설정

`application.yaml` → `security.jwt.*` 로 바인딩 (`JwtProperties`).

| 키 | 설명 | 기본값 |
| --- | --- | --- |
| `security.jwt.secret` | HS256 서명 키 (32자 이상) | 로컬 기본값 존재, **운영은 반드시 `JWT_SECRET` 환경변수** |
| `security.jwt.access-token-ttl-seconds` | Access 토큰 유효시간 | 3600 (1시간) |
| `security.jwt.issuer` | 발급자 (iss) | `comong` |

### 사용자 역할 (USER / ADMIN)

`UserRole { USER, ADMIN }` 만 존재. 회원가입은 항상 `USER` 로 생성되고, 회원가입 API 에는 role 입력 필드를 노출하지 않는다.

`ADMIN` 부여는 **DB 직접 수정** 으로만 한다. 운영자가 환경별로 SQL 한 줄을 실행:

```sql
-- 새 admin 계정 생성 (BCrypt 해시는 별도 도구로 생성)
INSERT INTO users (email, nickname, password, role, created_at)
VALUES ('admin@comong', 'admin', '<bcrypt-hash>', 'ADMIN', NOW());

-- 또는 기존 USER 를 ADMIN 으로 승격
UPDATE users SET role = 'ADMIN' WHERE email = 'guardian@example.com';
```

상세 절차 (BCrypt 해시 생성, 환경별 주의점 등) 는 [`admin-bootstrap.md`](./admin-bootstrap.md) 참고.

이 방식을 택한 이유:
- 운영 자격증명이 git/VCS 밖에 머무름 (마이그레이션에 박지 않는다)
- 환경별 admin 셋이 완전히 분리
- 코드 경로에서 사용자 데이터를 자동 변형하는 부분이 없어 감사·디버깅 표면적이 작음

권한 보호는 `@PreAuthorize("hasRole('ADMIN')")` 사용 — `JwtAuthenticationFilter` 가 토큰의 role claim 을 `ROLE_<enum>` 으로 부여하므로 enum 이름과 자동 매칭.

> **테스트 주의**: 통합 테스트의 `with(user().roles("ADMIN"))` 은 Spring Security Test 가 `SecurityContext` 를 직접 주입해 `JwtAuthenticationFilter` 를 우회한다. 실제 ADMIN 권한 발급 경로 검증은 `AdminAuthorizationIntegrationTest` 가 담당 (운영 절차를 `User#promoteToAdmin()` 호출로 시뮬레이션).

### Swagger 연동

- `OpenApiConfig` 에 Bearer 스키마 등록 완료.
- Swagger UI 우측 상단 **Authorize** 버튼 → 발급받은 토큰 입력 → 보호된 엔드포인트 호출 가능.

### 인증된 사용자 조회

컨트롤러/서비스에서 현재 사용자 필요 시:

```java
JwtTokenProvider.AuthenticatedUser user =
        (JwtTokenProvider.AuthenticatedUser) SecurityContextHolder.getContext()
                .getAuthentication().getPrincipal();
Long userId = user.userId();
```

(추후 `@AuthenticationPrincipal` 용 커스텀 어노테이션 검토 — 새 이슈)

## 13. 미디어 업로드 / 저장소

이미지·영상 파일을 다루는 모든 도메인은 `ImageStorage` / `VideoStorage` 추상화를 통해 저장한다. 도메인별로 직접 디스크/외부 SDK 를 만지지 말 것 — 보안 룰을 한 곳에 모아두기 위함.

### 추상화

- `global/storage/ImageStorage` — 이미지 인터페이스 (`upload`, `toPublicUrl`, `delete`)
- `global/storage/LocalImageStorage` — 로컬 디스크 이미지 구현체 (`storage.type=local` / 디폴트)
- `global/storage/S3ImageStorage` — S3 이미지 구현체 (`storage.type=s3`, S14P31E103-491)
- `global/storage/StoredImage` — 이미지 영구 식별자 래퍼 (DB `image_url`/`thumbnail_url` 컬럼에 저장)
- `global/storage/VideoStorage` — 영상 인터페이스 (S14P31E103-308)
- `global/storage/LocalVideoStorage` — 로컬 디스크 영상 구현체 (`storage.type=local` / 디폴트)
- `global/storage/S3VideoStorage` — S3 영상 구현체 (`storage.type=s3`, S14P31E103-492)
- `global/storage/StoredVideo` — 영상 영구 식별자 래퍼 (DB `demo_video_url` 컬럼에 저장)
- `global/storage/StorageProperties` — `storage.{type, local.*, s3.*}` 바인딩
- `global/config/S3ClientConfig` — `storage.type=s3` 일 때만 `S3Client` / `S3Presigner` 빈 등록

### 프로파일별 활성 백엔드 (S14P31E103-490 ~ 493)

| 프로파일 | `storage.type` | 동작 |
| --- | --- | --- |
| `local` | `local` | 디스크 (`./uploads/`) 에 저장. 정적 핸들러로 직접 서빙. |
| `dev`, `prod` | `s3` | private S3 버킷에 putObject. 응답마다 presigned GET URL (TTL 15분) 발급. |

자격증명은 SDK default credential chain (env 변수 `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` 또는 EC2/ECS IAM Role) 에서 자동으로 읽는다 — yaml/코드 어디에도 박지 않는다. 버킷 / IAM 정책 / 환경변수 주입 절차는 [`infra/aws-s3-bucket-setup-guide.md`](../../infra/aws-s3-bucket-setup-guide.md) (S14P31E103-393) 참조.

#### 저장 식별자 vs 외부 노출 URL (S14P31E103-491)

`upload()` 가 반환하는 `StoredImage.url` / `StoredVideo.url` 은 **DB 에 영구 저장하는 식별자**다. 응답에 내려보낼 때는 반드시 `imageStorage.toPublicUrl(stored)` / `videoStorage.toPublicUrl(stored)` 을 거쳐야 한다.

- 로컬 백엔드: `toPublicUrl` 은 identity. 식별자 자체가 영구 servlet URL.
- S3 백엔드: 식별자는 영구 객체 URL (private 이라 직접 GET 시 403). `toPublicUrl` 이 매번 새 presigned URL 발급.

호출자가 `toPublicUrl` 을 거치지 않고 stored 값을 그대로 응답에 내려주면 S3 환경에서 클라가 403 을 받는다. `ArtworkResponse.from(artwork, imageStorage)` / `ExerciseMotionResponse.from(motion, imageStorage, videoStorage)` 같은 시그니처가 이 호출을 강제한다.

### 업로드 검증 — 4중 방어 (이미지·영상 동일 패턴)

각 구현체가 다음 순서로 검사한다. 어느 한 층만으로는 우회 가능하므로 모두 거친다.

1. **Content-Type** 이 `image/*` 또는 `video/*` 인지 (1차, 클라이언트 헤더라 신뢰도 낮음)
2. 실제 binary 의 **magic bytes** 가 알려진 시그니처와 일치하는지 (2차)
3. 매직바이트로 검출한 포맷과 **파일명 확장자가 일치**하는지 (3차, mislabeled 차단)
4. 확장자가 **whitelist** 에 포함되는지 (4차, 정적 서빙 시 실행 가능 콘텐츠 차단)

| 구분 | 허용 포맷 | 자체 한도 | 에러코드 |
| --- | --- | --- | --- |
| 이미지 | PNG / JPEG / GIF / WEBP (`.png/.jpg/.jpeg/.webp/.gif`) | 10MB | `S-001 INVALID_IMAGE` |
| 영상 | MP4 / WebM (`.mp4/.webm`) | 100MB | `S-004 INVALID_VIDEO` |

IO 실패는 `S-002 STORAGE_FAILURE`. 한도 초과는 `S-003 PAYLOAD_TOO_LARGE` (multipart 글로벌 한도 초과 또는 각 구현체의 자체 한도 초과 모두).

### 파일명 / Path Traversal 방어

- 저장 파일명은 **UUID + canonical 확장자**. 원본 파일명 기반 추측 공격을 막는다.
- `delete(url)` 는 idempotent — 파일이 없으면 조용히 무시한다.
- 다만 URL 의 filename 부분에 경로 구분자(`/` `\`), `..`, 단일 `.` 가 포함되면 `S-002` 로 거부한다 (DB 변조 등 데이터 무결성 위반 가드).
- 한 단계 더: 정규화 후에도 정해진 root (이미지는 `uploadRoot`, 영상은 `uploadRoot/videos`) 하위인지 검사 (defense in depth).

### 디렉토리 레이아웃 / S3 키 컨벤션

| 백엔드 | 이미지 | 영상 |
| --- | --- | --- |
| 로컬 | `<upload-dir>/UUID.<ext>` (flat) | `<upload-dir>/videos/UUID.<ext>` |
| S3 | `<storage.s3.prefix>/UUID.<ext>` | `<storage.s3.prefix>/videos/UUID.<ext>` |

영상은 양쪽 모두 `videos/` 서브패스로 분리해 ops/감사 가독성 확보. S3 의 `prefix` 는 환경별 (`local` / `dev` / `prod`) 분리되어 객체가 섞이지 않는다.

### prefix / public URL 동기화 (로컬 백엔드만)

`storage.local.public-url-prefix` (yaml) → `LocalImageStorage` / `LocalVideoStorage` 가 반환 URL 을 생성, `StorageConfig` 가 정적 리소스 핸들러에 매핑, `SecurityConfig.PUBLIC_ENDPOINTS` 가 같은 prefix 를 permit. **세 군데가 동일한 값을 공유**하므로 yaml 한 곳만 바꾸면 모두 따라간다. 새 prefix 를 도입할 때 한 군데라도 빠뜨리지 말 것.

S3 백엔드에서는 `StorageConfig` / `SecurityConfig` 의 prefix 매핑이 자동으로 비활성화된다 (BE 가 정적 서빙을 하지 않으므로). presigned URL 은 `storage.s3.bucket` 의 도메인 위에서 직접 발급된다.

### 멀티파트 한도

| 키 | 값 | 의미 |
| --- | --- | --- |
| `spring.servlet.multipart.max-file-size` | 100MB | 파일 단건 한도 (영상 수용) |
| `spring.servlet.multipart.max-request-size` | 110MB | 요청 본문 전체 한도 |
| `server.tomcat.max-http-form-post-size` | 110MB | 톰캣 단계 차단 한도 |
| `server.tomcat.max-swallow-size` | 110MB | 한도 초과 시에도 톰캣이 본문을 읽어들이는 한계 |

위 4개를 **같이** 잡아야 톰캣 단계에서 미리 차단되지 않는다. 글로벌 한도가 영상에 맞춰져 크게 잡혀 있어도 이미지는 자체적으로 10MB 를 다시 강제한다 (`LocalImageStorage` 코드). 한도 초과는 `MaxUploadSizeExceededException` → `S-003` 로 매핑.

### 트랜잭션 정합성 (orphan cleanup)

파일 IO 는 트랜잭션 외 자원이라 DB 커밋과 묶이지 못한다. `ArtworkService` / `ExerciseMotionService` 는 `TransactionSynchronization` 으로 다음 패턴을 적용한다.

- **create**: 새로 업로드된 파일은 롤백 시 삭제, 커밋 시 보존
- **update (교체)**: 새 파일은 롤백 시 삭제, 커밋 시 옛 파일 삭제
- **update (clear)**: `clear*` 플래그가 true 면 커밋 시 옛 파일 삭제
- **delete**: 커밋 후 모든 연관 파일 삭제

완벽한 2PC 가 아니라 최악의 경우(커밋 직전 JVM 크래시 등) 일부 orphan 이 남을 수 있음 — 별도 cleanup 배치는 후속 이슈.

### 접근 통제

| 백엔드 | 정책 |
| --- | --- |
| 로컬 (`storage.type=local`) | 정적 핸들러 — UUID 만 알면 누구나 GET 가능. 비공개 컨텐츠에 대한 권한 체크 없음. |
| S3 (`storage.type=s3`) | private 버킷 + presigned GET URL (TTL 15분). 영구 객체 URL 은 BE 만 알고, 클라엔 매번 짧은 TTL URL 만 노출. |

S3 백엔드에서도 작품 단위의 인가 체크 (예: 비공개 작품을 본인만 볼 수 있게) 는 `ArtworkAccessChecker` 같은 service 레이어가 담당. presigned URL 자체는 발급 받기만 하면 누구나 GET 가능 — 인가 검증을 BE 가 통과시킨 뒤에만 발급한다.

## 14. 커밋 메시지

```
[S14P31E103-<이슈번호>] BE/<타입>: <내용>
```

- 타입: `init`, `feat`, `fix`, `refactor`, `test`, `docs`, `chore` 등
- 한 커밋은 한 관심사. 공통 설정과 도메인 기능을 섞지 말 것
