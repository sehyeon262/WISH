# 보호자 계정 / 환자 프로필 구조

이 문서는 **결정 기록(ADR)** 이다. 기능 사용법이 아닌 "왜 이렇게 설계했는가" 를 남긴다. 코드/Swagger 로 표현되지 않는 정책·의도·미도입 배경을 남겨 향후 팀원이 맥락 없이 뒤집지 않도록 한다.

## 1. 한 줄 결정

MVP 에서는 **보호자가 로그인 주체**이고, 환자는 보호자 계정 아래의 **프로필**로 관리한다.

- `User` = 보호자 계정 (로그인 주체)
- `PatientProfile` = 실제 게임 플레이 대상자 (아동)
- `patient_profiles.user_id → users.id` FK 로 관계 표현

## 2. 왜 이렇게 결정했는가

- 소아암 환자 대상 서비스라 실제 사용자는 대체로 아동이며, 이메일/비밀번호를 직접 관리하는 것이 UX·책임·동의 측면에서 부담이 크다.
- 감정/플레이 기록 같은 민감 데이터는 **보호자 동의·관리** 가 전제되어야 한다.
- 환자를 독립 로그인 계정으로 두면 "누가 로그인했는가" 와 "누가 플레이했는가" 가 섞여 권한 설계가 불필요하게 복잡해진다.

## 3. 데이터 모델

### 3.1 엔티티

- `User` — 로그인 주체. 필드: `id, email, nickname, password, createdAt`.
- `PatientProfile` — 플레이 대상자. 필드: `id, user(FK), name, nickname, birthDate, gender, createdAt`.

### 3.2 FK 네이밍

- FK 컬럼은 **`user_id`** 로 둔다 (`guardian_id` 아님).
- 지금 User 는 보호자 역할만 존재하므로 `user_id` 가 현재 상태를 정확히 기술한다.
- 의료진 등 역할이 **실제로** 추가되는 시점에 구조에 맞춰 rename 을 검토한다 (마이그레이션 + IDE 리팩터링으로 저비용).
- "미래 대비" 만으로 `guardian_id` 를 선택하지 않는다 — 아직 확정되지 않은 설계에 이름을 고정하는 것은 추측 기반.

### 3.3 DB 제약

- `patient_profiles.user_id` 에 FK 제약(`fk_patient_profiles_user`), 인덱스(`idx_patient_profiles_user_id`), unique 제약(`uk_patient_profiles_user_id`) 이 존재한다.
- 현재 정책이 1:1 이므로 DB 도 1:1 로 잠근다. 정책이 1:N 으로 열리는 시점에 unique 드랍 + 응답 DTO/UX 를 함께 변경한다 (5절 참고).
- 초기 V2 에서는 unique 를 두지 않고 "구조 1:N + 정책 1:1" 로 갔으나, 서비스 선검사만으로는 TOCTOU race 가 열려 있어 invariant 가 보장되지 않았다. V3 에서 unique 추가 + 예외 매핑으로 전환 (S14P31E103-186).

## 4. API 설계

### 4.1 엔드포인트

| Method | Path | 설명 |
| --- | --- | --- |
| GET | `/users/me` | 보호자 본인 정보 |
| POST | `/patient-profiles` | 환자 프로필 등록 (201 + Location) |
| GET | `/patient-profiles` | 본인 소유 환자 프로필 목록 |
| GET | `/patient-profiles/{id}` | 단건 조회 |
| GET | `/exercise-sessions?patientProfileId={id}` | 환자별 체조 세션 목록 (4.2 예외 패턴) |
| GET | `/taekwondo-sessions?patientProfileId={id}` | 환자별 태권도 세션 목록 (4.2 예외 패턴) |
| GET | `/taekwondo-progress?patientProfileId={id}` | 환자별 태권도 진척도 (4.2 예외 패턴) |
| GET | `/taekwondo-belt-history?patientProfileId={id}` | 환자별 태권도 띠 승급 이력 (4.2 예외 패턴) |

### 4.2 소유 관계 표현

- 기본 패턴: URL 네스팅(`/users/me/patient-profiles`) 이 아니라 **JWT principal** 로 소유자를 결정한다.
- 자원은 평평하게 (`/patient-profiles`) 두고, 서버가 인증된 보호자 기준으로 필터한다.
- `/users/me` 에 환자 정보를 embed 하지 않는다 — 리소스 경계를 섞지 않기 위함 (프론트는 필요 시 병렬 호출).

#### 예외: 환자별 컬렉션 조회는 `?patientProfileId=` 명시

세션·진척도·벨트 이력처럼 **환자 1명의 누적 데이터를 조회하는 컬렉션** 은 `?patientProfileId=` 를 필수 파라미터로 받는다 (4.1 표의 마지막 4개). 근거:

- **권한 의도의 가시성** *(주된 근거)*: service 가 `(userId, patientProfileId)` 둘 다 받아 `PatientProfileService.findOwnedOrThrow` 로 owner 검증을 한 줄에 명시. 자동 lookup 으로 숨기지 않으므로 "어떤 환자 데이터에 접근하는지 + 본인 소유인지" 가 시그니처/리뷰 단계에서 바로 보인다.
- **세션 데이터의 환자 단위 의미**: 세션·진척도·벨트 이력은 본질적으로 "환자 1명의 누적 기록" 이라 환자 ID 가 도메인 식별자에 포함되는 게 자연스럽다 ("내 세션" 이 아닌 "이 환자의 세션").

부수 효과로, 다중 환자 / 의료진 확장 (6.1 / 6.2) 시점에 API 시그니처를 바꾸지 않고도 동작이 유지된다. 다만 이는 부수 효과지 주된 도입 근거는 아니다 — **현재 1:1 환경에서는 redundant 한 파라미터**라는 trade-off 를 인정한다. YAGNI 관점이라면 1:N 도입 시점에 새 엔드포인트를 추가하는 것도 충분히 합리적이다.

작품 도메인 (`/artworks/me`) 처럼 본인 1인분만 다루는 컬렉션은 기본 패턴 (JWT principal 만) 을 유지한다 — 작품은 환자 단위가 아닌 "내 작품" 의미라 patientProfileId 가 의미상 어울리지 않는다.

새로운 환자별 컬렉션 API 를 추가할 때는 4.1 표에 항목을 더하고, 컨트롤러에 `@Parameter(description, required=true)` + `@ApiResponse(responseCode="404", ...)` 를 함께 단다 ([컨벤션 11장](conventions.md) 권장).

### 4.3 에러 응답

| 상황 | 상태 | 코드 |
| --- | --- | --- |
| 보호자가 이미 환자 프로필을 가짐 | 409 | `P-002` |
| 프로필이 없거나 본인 소유가 아님 | 404 | `P-001` |

- 비소유 자원에 대해 403 이 아닌 **404** 로 응답한다. 403 은 "ID 는 존재한다" 는 사실을 유출해 순차 PK enumeration 에 단서를 준다.
- 4.2 예외 패턴 (`?patientProfileId=`) 의 비소유/비존재 응답도 모두 같은 `P-001 / 404` 로 통일된다. 이 책임은 [`PatientProfileService.findOwnedOrThrow`](../src/main/java/com/comong/backend/domain/patient/service/PatientProfileService.java) 한 곳에 집중되어 있어 4개 service (TaekwondoSession / TaekwondoProgress / TaekwondoBeltHistory / ExerciseSession) 가 모두 이 메서드를 거친다 — 새 환자별 API 를 추가할 때도 같은 메서드를 사용해 enumeration 방지 규칙을 일관 적용한다.

## 5. MVP 정책

### 5.1 보호자 1인당 환자 1명

- **다층 방어**: 서비스 선검사(`existsByUserId`) 는 빠른 실패용 UX, 최종 invariant 는 DB unique(`uk_patient_profiles_user_id`).
- 동시 POST race 는 unique 위반으로 잡고, `DataIntegrityViolationException` → `P-002` 로 매핑한다 (회원가입 race 119/121 와 동일 패턴).
- 1:N 으로 전환할 때는 unique 드랍 + 선검사·예외매핑·`P-002` 제거 + 응답 DTO list 화 + 프론트 프로필 선택 UX 를 같이 처리한다. unique 한 줄을 미루기 위해 invariant 를 포기하지 않는다 — 마이그레이션 비용보다 race 로 invariant 가 깨지는 비용이 크다.

### 5.2 PIN/프로필 선택 흐름 미도입

- 넷플릭스 프로필처럼 여러 프로필을 두고 아이가 PIN 으로 선택하는 흐름은 **도입하지 않는다**.
- MVP 는 보호자가 로그인하면 그대로 아이가 이어서 플레이하는 단순 흐름. 이후 보호자 세션 유지 상태에서 아이가 바로 접속 가능한 UX 로 완화한다.
- 이유: 환자 1명 전제에서 PIN 은 부가 가치 없는 마찰이고, 민감 데이터 경계는 이미 "보호자 세션" 하나로 충분.

## 6. 확장 방향

### 6.1 다중 환자 (형제자매 등)

- 엔티티·스키마 변경 없음. 서비스의 1:1 제약만 제거하고, 응답 DTO 를 list 로 확장.
- 프론트의 프로필 선택 UX 가 이 시점에 비로소 의미를 가진다.

### 6.2 의료진 계정

- 선호 방식: **`User` 확장** (role 컬럼 도입).
  - 이유: 로그인/JWT/Spring Security 인프라를 공유. 별도 테이블은 auth 로직을 두 벌로 관리해야 하는 부담.
- 환자와 의료진의 관계는 **별도 조인 테이블** (`patient_clinicians` 등) 로 표현. 보호자와 의료진은 patient 에 대해 역할이 다르므로 같은 FK 에 섞지 않는다.
- 이 시점에 `patient_profiles.user_id` 를 `guardian_id` 로 rename 하는 편이 자연스럽다 (의료진 추가 후엔 `user_id` 가 모호해지기 때문).

### 6.3 범위 밖

- 의료진 페이지·리포트 공유 기능은 별도 Epic 에서 다룬다.
- 본 문서는 MVP 범위의 계정/프로필 구조만 커버한다.

## 7. 참고

- 엔티티: [`User`](../src/main/java/com/comong/backend/domain/user/entity/User.java), [`PatientProfile`](../src/main/java/com/comong/backend/domain/patient/entity/PatientProfile.java)
- 마이그레이션: [`V2__add_patient_profiles.sql`](../src/main/resources/db/migration/V2__add_patient_profiles.sql)
- API: [`PatientProfileController`](../src/main/java/com/comong/backend/domain/patient/controller/PatientProfileController.java)
- 코드 컨벤션: [`conventions.md`](./conventions.md)
