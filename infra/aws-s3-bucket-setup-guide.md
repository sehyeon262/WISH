# AWS S3 버킷 세팅 가이드

Jira: [S14P31E103-393](https://ssafy.atlassian.net/browse/S14P31E103-393)

## 1. 목표

이 문서는 AWS 콘솔에서 S3 버킷을 만들고, 프로젝트에서 사용할 prefix(객체 이름 앞부분), 권한, CORS(브라우저 교차 출처 접근 허용 규칙), 환경변수를 정리하기 위한 인프라 작업 가이드다.

현재 프로젝트에서 S3 우선 적용 대상은 다음이다.

| 우선순위 | 대상 | 설명 |
| --- | --- | --- |
| 1 | 사용자 작품 이미지 | 미술 활동 결과 PNG |
| 1 | 운동 동작 썸네일 | 관리자 등록 이미지 |
| 1 | 운동 데모 영상 | 관리자 등록 MP4/WebM |
| 2 | 프론트 게임 정적 에셋 | 이미지, 음원, 폰트 |
| 2 | MediaPipe 모델/wasm | 외부 CDN 의존 제거 후보 |

프리 티어를 고려해 처음에는 **S3 버킷 2개**만 사용한다.

```text
e103-comong-private-storage
e103-comong-public-assets
```

위 이름은 **버킷 이름 접두사**다. 현재 AWS 콘솔에서 `계정 리전 네임스페이스(권장)`을 선택하면 AWS가 뒤에 접미사를 자동으로 붙인다.

예:

```text
입력하는 값:
e103-comong-private-storage

AWS가 자동으로 붙이는 접미사 예시:
-123456789012-ap-northeast-2-an

실제 전체 버킷 이름:
e103-comong-private-storage-123456789012-ap-northeast-2-an
```

위 `123456789012`는 문서용 더미 계정 ID다. 실제 설정에는 사용하지 않는다.

이후 IAM policy(권한 정책), 환경변수, 백엔드 설정에는 반드시 본인 AWS 화면의 **전체 버킷 이름**을 사용한다.

버킷 개수 자체가 비용 기준은 아니다. S3 비용은 주로 저장 용량, 요청 수, 외부 전송량 기준이다. AWS S3 프리 티어는 계정 조건에 따라 다르므로 Billing 콘솔에서 반드시 확인한다.

공식 참고:

- [Amazon S3 pricing](https://aws.amazon.com/s3/pricing/)
- [S3 bucket creation guide](https://docs.aws.amazon.com/AmazonS3/latest/userguide/creating-bucket.html)
- [S3 Block Public Access](https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-control-block-public-access.html)
- [S3 bucket policies](https://docs.aws.amazon.com/AmazonS3/latest/userguide/bucket-policies.html)
- [S3 CORS configuration](https://docs.aws.amazon.com/AmazonS3/latest/dev/ManageCorsUsingConsole.html)

## 2. 최종 구조

### 2.1 Private 업로드 버킷

사용자/관리자가 업로드하는 파일을 저장한다. 외부 공개 접근은 막는다.

```text
e103-comong-private-storage/
  local/
    artworks/
    exercise/
      thumbnails/
      videos/

  dev/
    artworks/
    exercise/
      thumbnails/
      videos/

  prod/
    artworks/
    exercise/
      thumbnails/
      videos/
```

정책:

- public access 차단
- ACL(Access Control List, 객체별 권한 목록) 비활성화
- 백엔드만 업로드/조회/삭제 가능
- local/dev/prod prefix별 권한 분리
- 지급받은 EC2에 AWS 계정 권한을 붙일 수 없으므로 local/dev/prod 모두 IAM User access key(고정 키)를 사용
- IAM User는 환경별로 분리하고, 각 user는 자기 prefix만 접근하게 제한

### 2.2 Public assets 버킷

프론트 게임 정적 에셋을 저장한다. 브라우저가 직접 읽어야 하므로 읽기만 공개한다.

```text
e103-comong-public-assets/
  frontend/
    game/
      v1/
        assets/
          images/
          sounds/
          fonts/

  mediapipe/
    0.10.21/
      wasm/
      models/
```

정책:

- public read만 허용
- 업로드/삭제는 IAM 사용자 또는 배포 서버만 가능
- 버전 prefix(`v1`, `v2`) 사용
- 같은 파일명을 덮어쓰지 않고 새 버전 경로를 만든다.

공통 자원은 이 버킷에 `frontend/game/...`, `mediapipe/...` 같은 prefix로 둔다. local/dev/prod가 같은 공통 자원을 읽어도 prefix 때문에 성능이 떨어지지는 않는다. 비용과 트래픽은 버킷 개수나 prefix 개수보다 실제 요청 수, 저장 용량, 외부 전송량에 의해 결정된다.

### 2.3 버킷 구분과 생성 사유

팀원에게 설명할 때는 아래 기준으로 말하면 된다.

| 버킷 | 접근 방식 | 넣는 것 | 넣지 않는 것 | 생성 사유 |
| --- | --- | --- | --- | --- |
| private upload bucket | 백엔드만 IAM 권한으로 접근 | 사용자 작품 이미지, 운동 썸네일, 운동 데모 영상, 추후 비공개 업로드 파일 | 프론트가 직접 읽어야 하는 게임 에셋, 공개 모델 파일 | 사용자 업로드 파일은 공개 여부와 권한 검사가 필요하므로 외부 직접 접근을 막기 위해 분리 |
| public assets bucket | 브라우저가 URL로 직접 읽음 | 프론트 게임 이미지/음원/폰트, MediaPipe wasm/model, 공개 정적 자원 | 사용자 업로드 원본, 비공개 작품, 삭제/권한 관리가 필요한 파일 | 정적 자원은 인증 없이 빠르게 읽어야 하므로 public read 전용 버킷으로 분리 |

private bucket은 `public access block`을 켜서 외부 직접 접근을 막는다. public bucket은 특정 prefix의 객체만 읽기 공개하고, 업로드/삭제는 IAM User에게만 허용한다.

두 버킷을 나눈 이유는 성능 때문이 아니라 **권한과 운영 방식이 다르기 때문**이다. 사용자 업로드 파일과 공개 정적 자원을 같은 공개 정책으로 묶으면 실수로 private 파일이 노출될 수 있다.

## 3. 버킷 생성 화면 선택 요약

먼저 private 업로드 버킷을 만들고, 이후 public assets 버킷을 만든다. 두 버킷은 `퍼블릭 액세스 차단 설정`만 다르게 가져간다.

### 3.1 Private 업로드 버킷 선택표

사용자 작품 이미지, 운동 썸네일, 운동 데모 영상 저장용이다. 외부에서 직접 열리면 안 되므로 공개 접근을 전부 막는다.

| 화면 항목 | 선택값 | 설명 |
| --- | --- | --- |
| AWS 리전 | `아시아 태평양(서울) ap-northeast-2` | 이미 화면 상단이 서울이면 그대로 둔다. |
| 버킷 네임스페이스 | `계정 리전 네임스페이스(권장)` | 버킷 이름 접미사를 AWS가 자동으로 붙인다. |
| 버킷 이름 접두사 | `e103-comong-private-storage` | 직접 입력하는 값이다. |
| 전체 버킷 이름 | 자동 생성값 확인 | 이후 환경변수와 IAM policy에 쓸 실제 버킷명이다. |
| 기존 버킷에서 설정 복사 | 누르지 않음 | 새로 만드는 버킷이므로 복사하지 않는다. |
| 객체 소유권 | `ACL 비활성화됨(권장)` | 정책 기반 권한 관리로 통일한다. |
| 모든 퍼블릭 액세스 차단 | 체크 유지 | private 버킷은 외부 공개를 막는다. |
| 버킷 버전 관리 | `비활성화` | 프리 티어 저장 용량을 아낀다. |
| 태그 | 선택 사항 | 넣는다면 아래 예시를 사용한다. |
| 기본 암호화 | `Amazon S3 관리형 키(SSE-S3)` | 추가 KMS 비용 없이 기본 암호화한다. |
| 버킷 키 | 기본값 유지 | SSE-S3에서는 현재 화면 기본값 그대로 둔다. |
| 객체 잠금 | `비활성화` | 삭제 방지 기능이라 지금은 필요 없다. |
| 고급 설정 | 펼쳐져 있어도 기본값 유지 | 따로 켜지 않는다. |

### 3.2 Public assets 버킷 선택표

프론트 게임 이미지, 음원, 폰트, MediaPipe 모델/wasm 후보 저장용이다. 브라우저가 직접 읽어야 하므로 객체 읽기만 공개한다.

| 화면 항목 | 선택값 | 설명 |
| --- | --- | --- |
| AWS 리전 | `아시아 태평양(서울) ap-northeast-2` | private 버킷과 동일하게 둔다. |
| 버킷 네임스페이스 | `계정 리전 네임스페이스(권장)` | private 버킷과 동일하다. |
| 버킷 이름 접두사 | `e103-comong-public-assets` | 직접 입력하는 값이다. |
| 전체 버킷 이름 | 자동 생성값 확인 | 이후 URL, bucket policy에 쓸 실제 버킷명이다. |
| 객체 소유권 | `ACL 비활성화됨(권장)` | ACL은 쓰지 않는다. |
| 모든 퍼블릭 액세스 차단 | 체크 해제 | public read bucket policy를 넣기 위해 해제한다. |
| 경고 확인 체크박스 | 체크 | 공개 버킷을 만들겠다는 AWS 확인 절차다. |
| 버킷 버전 관리 | `비활성화` | `v1`, `v2` prefix로 버전 관리한다. |
| 태그 | 선택 사항 | 넣는다면 아래 예시를 사용한다. |
| 기본 암호화 | `Amazon S3 관리형 키(SSE-S3)` | 기본 암호화 유지 |
| 객체 잠금 | `비활성화` | 지금은 필요 없다. |

### 3.3 누르지 말아야 할 항목

처음 세팅에서는 아래 항목을 켜지 않는다.

- `글로벌 네임스페이스`: 직접 전 세계 고유 이름을 만들어야 하므로 지금은 불필요하다.
- `기존 버킷에서 설정 복사`: 기존 기준 버킷이 없으므로 누르지 않는다.
- `ACL 활성화됨`: 객체별 권한 관리가 섞여 복잡해진다.
- `버킷 버전 관리 활성화`: 저장 용량이 늘 수 있다.
- `AWS Key Management Service 키(SSE-KMS)`: KMS 호출 비용과 권한 관리가 추가된다.
- `DSSE-KMS`: 더 강한 암호화 방식이지만 현재 프로젝트에는 과하다.
- `객체 잠금 활성화`: 삭제/교체가 막힐 수 있고 버전 관리가 같이 켜진다.

## 4. Private 버킷 만들기

### 4.1 S3 콘솔 진입

1. AWS Console 접속
2. 상단 검색창에서 `S3` 검색
3. `Amazon S3` 선택
4. 왼쪽 메뉴 또는 기본 화면에서 `Buckets` 선택
5. `Create bucket` 클릭

### 4.2 일반 구성

현재 화면 기준으로 아래처럼 선택한다.

| 화면 항목 | 선택/입력 |
| --- | --- |
| AWS 리전 | `아시아 태평양(서울) ap-northeast-2` |
| 버킷 네임스페이스 | `계정 리전 네임스페이스(권장)` 선택 |
| 버킷 이름 접두사 | `e103-comong-private-storage` 입력 |
| 기존 버킷에서 설정 복사 | 아무것도 선택하지 않음 |

현재 콘솔은 `버킷 이름 접두사` 오른쪽에 `계정 리전 네임스페이스 접미사`를 자동으로 보여준다. 이 접미사는 AWS가 알아서 붙이는 값이다. 직접 입력하지 않는다.

예:

```text
버킷 이름 접두사:
e103-comong-private-storage

계정 리전 네임스페이스 접미사:
-123456789012-ap-northeast-2-an

전체 버킷 이름:
e103-comong-private-storage-123456789012-ap-northeast-2-an
```

`전체 버킷 이름`을 따로 메모한다. 나중에 아래 값들에 그대로 쓴다.

- IAM policy의 `arn:aws:s3:::...`
- 백엔드 환경변수 `AWS_S3_PRIVATE_BUCKET`, `AWS_S3_PUBLIC_BUCKET`
- 테스트용 S3 URL 확인

주의:

- 버킷을 만든 뒤에는 이름을 바꿀 수 없다.
- `계정 리전 네임스페이스(권장)`을 쓰면 접미사가 붙으므로, 문서의 짧은 이름과 실제 이름이 다를 수 있다.
- 실제 설정에는 항상 `전체 버킷 이름`을 사용한다.

### 4.3 Object Ownership

현재 화면의 `객체 소유권` 영역에서 아래 카드를 선택한다.

```text
ACLs disabled (recommended)
```

한국어 콘솔에서는 아래처럼 보인다.

```text
ACL 비활성화됨(권장)
```

오른쪽의 `ACL 활성화됨`은 선택하지 않는다.

의미:

- ACL은 객체별 권한 목록이다.
- 비활성화하면 버킷 소유자가 모든 객체를 소유하고, IAM policy(권한 정책)와 bucket policy(버킷 정책)로만 권한을 제어한다.

### 4.4 Block Public Access

private 버킷은 전부 막는다.

```text
Block all public access: checked
```

한국어 콘솔에서는 아래 체크박스를 켠 상태로 둔다.

```text
모든 퍼블릭 액세스 차단: 체크
```

하위 4개 옵션도 모두 체크 상태로 둔다.

하위 항목은 회색으로 잠겨 보여도 정상이다. `모든 퍼블릭 액세스 차단`을 체크하면 하위 4개가 같이 켜진다.

이 설정의 의미:

- 인터넷에서 버킷 객체를 직접 열 수 없다.
- bucket policy로 public read를 실수로 추가해도 차단된다.
- 백엔드가 IAM 권한으로 접근하는 것은 막지 않는다.

### 4.5 Bucket Versioning

`버킷 버전 관리` 영역에서 아래를 선택한다.

```text
Disable
```

한국어 콘솔에서는 아래처럼 보인다.

```text
비활성화
```

이유:

- Versioning(같은 파일의 이전 버전을 보관하는 기능)을 켜면 삭제/교체 후에도 이전 객체가 남아 저장량이 늘어난다.
- 프리 티어에서는 처음에 끄는 것이 안전하다.

### 4.6 Tags

태그는 선택 사항이다. 비용/운영 구분을 하려면 `새 태그 추가` 버튼을 눌러 아래처럼 넣는다.

```text
Project = S14P31E103
Service = storage
Access = private
Owner = infra
```

넣지 않아도 버킷 생성은 가능하다. 프리 티어 테스트만 빠르게 할 거면 생략해도 된다.

### 4.7 Default encryption

`기본 암호화` 영역에서 아래를 선택한다.

| 화면 항목 | 선택 |
| --- | --- |
| 암호화 유형 | `Amazon S3 관리형 키(SSE-S3)를 사용한 서버 측 암호화` |
| 버킷 키 | 기본값 유지 |

선택하지 않는 항목:

- `AWS Key Management Service 키를 사용한 서버 측 암호화(SSE-KMS)`
- `AWS Key Management Service 키를 사용한 이중 계층 서버 측 암호화(DSSE-KMS)`

이유:

- SSE-S3는 S3 기본 관리형 암호화라 추가 KMS 설정이 필요 없다.
- SSE-KMS는 KMS 권한과 비용 확인이 추가로 필요하다.

### 4.8 Advanced settings

`고급 설정` 영역에서 아래를 유지한다.

```text
객체 잠금: 비활성화
```

객체 잠금은 WORM(Write-Once-Read-Many, 한 번 쓰면 정해진 기간 동안 삭제/덮어쓰기 방지) 기능이다. 지금 프로젝트는 업로드 파일 교체/삭제가 필요하므로 켜지 않는다.

### 4.9 생성

1. 설정을 다시 확인한다.
2. 오른쪽 아래 `버킷 만들기` 클릭
3. 생성된 버킷 상세 화면으로 이동한다.

생성 후 메모할 값:

```text
Private bucket full name = e103-comong-private-storage-123456789012-ap-northeast-2-an
Region = ap-northeast-2
```

위 이름은 예시다. 실제로는 본인 화면의 `전체 버킷 이름`을 쓴다.

## 5. Private 버킷 prefix 만들기

S3의 "폴더"는 실제 폴더가 아니라 prefix(객체 key 앞부분)다. 콘솔에서 보기 편하게 빈 폴더를 만들어도 되고, 애플리케이션이 처음 업로드할 때 자동으로 생겨도 된다.

콘솔에서 미리 만들려면:

1. private 버킷 클릭
2. `Objects` 탭
3. `Create folder`
4. 아래 이름으로 생성

```text
local/
dev/
prod/
```

지금은 개발자별 폴더를 만들지 않았으므로 local 테스트는 `local/` 아래를 공통으로 사용한다.

예:

```text
local/artworks/
local/exercise/thumbnails/
local/exercise/videos/
```

팀원이 많아져서 서로의 테스트 파일을 분리해야 하면 그때 local 아래 개발자별 prefix를 추가한다. 이 작업은 필수가 아니다.

```text
local/<developer-name>/
```

## 6. Public assets 버킷 만들기

public assets 버킷은 2순위 작업이다. 지금 당장 백엔드 업로드 S3 테스트만 할 거면 private 버킷만 먼저 만들어도 된다.

### 6.1 일반 구성

private 버킷을 만들 때와 거의 같다. 이름만 다르게 입력한다.

| 화면 항목 | 선택/입력 |
| --- | --- |
| AWS 리전 | `아시아 태평양(서울) ap-northeast-2` |
| 버킷 네임스페이스 | `계정 리전 네임스페이스(권장)` 선택 |
| 버킷 이름 접두사 | `e103-comong-public-assets` 입력 |
| 기존 버킷에서 설정 복사 | 아무것도 선택하지 않음 |

생성 화면의 `전체 버킷 이름`을 메모한다.

예:

```text
Public assets bucket full name =
e103-comong-public-assets-123456789012-ap-northeast-2-an
```

### 6.2 Object Ownership

아래 카드를 선택한다.

```text
ACLs disabled (recommended)
```

한국어 콘솔:

```text
ACL 비활성화됨(권장)
```

public assets 버킷도 ACL은 쓰지 않는다. 공개 읽기는 ACL이 아니라 bucket policy로 처리한다.

### 6.3 Block Public Access

public assets 버킷은 브라우저가 파일을 직접 읽어야 하므로 public read 정책이 필요하다.

따라서 private 버킷과 다르게 아래처럼 설정한다.

```text
모든 퍼블릭 액세스 차단: 체크 해제
```

체크를 해제하면 AWS가 경고 영역을 보여준다. 아래와 비슷한 확인 체크박스가 나오면 체크한다.

```text
현재 설정으로 인해 이 버킷과 그 안의 객체가 퍼블릭 상태가 될 수 있음을 확인합니다.
```

중요:

- public assets 버킷에서만 이 체크를 해제한다.
- private 업로드 버킷에서는 절대 해제하지 않는다.

주의:

- 이 버킷에는 절대 사용자 업로드 파일, secret, 환경변수, DB dump를 넣지 않는다.
- public read는 `GetObject`만 허용한다.
- `ListBucket`은 공개하지 않는다. 즉, 사용자가 버킷 목록을 훑어볼 수 없게 한다.

만약 account-level Block Public Access(계정 단위 공개 차단)가 켜져 있으면 bucket policy 저장이 거부될 수 있다. 그 경우 S3 콘솔의 `Block Public Access settings for this account`도 확인한다.

### 6.4 Bucket Versioning

아래를 선택한다.

```text
비활성화
```

프론트 에셋은 S3 버전 관리 기능 대신 prefix로 버전을 나눈다.

```text
frontend/game/v1/assets/...
frontend/game/v2/assets/...
```

### 6.5 Tags

선택 사항이다. 넣는다면 `새 태그 추가`를 눌러 아래처럼 입력한다.

```text
Project = S14P31E103
Service = frontend-assets
Access = public-read
Owner = infra
```

### 6.6 Default encryption

private 버킷과 동일하게 둔다.

| 화면 항목 | 선택 |
| --- | --- |
| 암호화 유형 | `Amazon S3 관리형 키(SSE-S3)를 사용한 서버 측 암호화` |
| 버킷 키 | 기본값 유지 |

SSE-KMS, DSSE-KMS는 선택하지 않는다.

### 6.7 Advanced settings

```text
객체 잠금: 비활성화
```

### 6.8 생성

1. 설정을 다시 확인한다.
2. 오른쪽 아래 `버킷 만들기` 클릭
3. 생성된 버킷 상세 화면으로 이동한다.

생성 직후에는 public assets 버킷도 아직 파일을 공개할 정책이 없다. 다음 단계에서 bucket policy를 추가해야 실제 객체 URL 접근이 가능하다.

## 7. Public assets 버킷 정책 추가

1. S3 버킷 목록에서 public assets 버킷 클릭
2. 상단 탭에서 `권한` 또는 `Permissions` 클릭
3. `버킷 정책` 또는 `Bucket policy` 영역으로 이동
4. `편집` 또는 `Edit` 클릭
5. 아래 JSON 입력
6. `변경 사항 저장` 또는 `Save changes` 클릭

`BUCKET_NAME`은 실제 버킷 이름으로 바꾼다.

여기서도 짧은 접두사가 아니라 `전체 버킷 이름`을 넣는다.

예:

```text
BUCKET_NAME =
e103-comong-public-assets-123456789012-ap-northeast-2-an
```

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowPublicReadForFrontendAssets",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": [
        "arn:aws:s3:::BUCKET_NAME/frontend/game/*",
        "arn:aws:s3:::BUCKET_NAME/mediapipe/*"
      ]
    }
  ]
}
```

이 정책의 의미:

- 누구나 객체 파일은 읽을 수 있다.
- 객체 목록 조회는 허용하지 않는다.
- 업로드/삭제는 허용하지 않는다.

`Principal: "*"`에 대한 `s3:ListBucket` 명시 Deny는 기본으로 넣지 않는다. 명시 Deny는 IAM User의 Allow보다 우선하므로, 나중에 public assets 배포 user가 `aws s3 sync`처럼 목록 조회가 필요한 작업을 할 때 막힐 수 있다. public read 정책은 `s3:GetObject`만 허용하고, 목록 조회 권한은 배포용 IAM User 정책에서만 필요한 경우 부여한다.

정책 저장이 실패할 때 확인할 것:

- public assets 버킷의 `모든 퍼블릭 액세스 차단`을 해제했는지 확인한다.
- 계정 단위 Block Public Access가 켜져 있으면 계정 설정도 확인한다.
- JSON 안의 `BUCKET_NAME`을 실제 전체 버킷 이름으로 바꿨는지 확인한다.

## 8. CORS 설정

### 8.1 Private 버킷

현재 구조처럼 브라우저가 백엔드에 업로드하고, 백엔드가 S3에 업로드한다면 private 버킷 CORS는 필수가 아니다.

나중에 presigned URL(일정 시간만 유효한 임시 URL)로 브라우저가 S3에 직접 업로드한다면 CORS가 필요하다.

그 경우에도 설정 위치는 public assets와 같다. private 버킷을 클릭한 뒤 `권한` 탭의 CORS 영역에서 입력한다.

직접 업로드까지 고려한 예시는 아래와 같다.

```json
[
  {
    "AllowedOrigins": [
      "https://k14e103.p.ssafy.io",
      "http://localhost:3001",
      "http://localhost:3002",
      "http://localhost:3003",
      "http://127.0.0.1:3001",
      "http://127.0.0.1:3002",
      "http://127.0.0.1:3003"
    ],
    "AllowedMethods": ["GET", "HEAD", "PUT", "POST"],
    "AllowedHeaders": [
      "Content-Type",
      "Authorization",
      "x-amz-content-sha256",
      "x-amz-date",
      "x-amz-security-token"
    ],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

### 8.2 Public assets 버킷

게임 에셋, 폰트, MediaPipe 모델을 브라우저에서 직접 읽을 수 있게 한다.

public assets 버킷은 브라우저가 직접 S3 URL을 읽는 구조라 CORS를 넣는 것이 맞다. private 버킷은 현재 백엔드가 중간에서 S3를 호출하므로 필수는 아니지만, 나중에 presigned URL 직접 업로드를 할 계획이면 같은 `권한` 탭에서 추가한다.

1. public assets 버킷 클릭
2. 상단 탭에서 `권한` 또는 `Permissions` 클릭
3. `CORS(Cross-origin resource sharing)` 또는 `Cross-origin resource sharing (CORS)` 영역으로 이동
4. `편집` 또는 `Edit` 클릭
5. 아래 JSON 입력
6. `변경 사항 저장` 또는 `Save changes` 클릭

```json
[
  {
    "AllowedOrigins": [
      "https://k14e103.p.ssafy.io",
      "http://localhost:3001",
      "http://localhost:3002",
      "http://localhost:3003",
      "http://127.0.0.1:3001",
      "http://127.0.0.1:3002",
      "http://127.0.0.1:3003"
    ],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["Content-Type", "Range"],
    "ExposeHeaders": ["ETag", "Content-Length", "Content-Range"],
    "MaxAgeSeconds": 3000
  }
]
```

## 9. IAM 정책 만들기

IAM(Identity and Access Management, AWS 권한 관리)은 백엔드나 배포 서버가 S3에 접근할 수 있게 해주는 권한이다.

이번 프로젝트에서는 지급받은 EC2에 SSH 접속은 가능하지만 AWS 계정 권한은 없다고 본다. 그래서 EC2 Role(EC2에 붙이는 AWS 권한)을 직접 설정할 수 없다. 현재 기준으로는 local/dev/prod 모두 IAM User access key(고정 키)를 사용한다.

| 환경 | 사용할 방식 | 이유 |
| --- | --- | --- |
| local | IAM User access key | 로컬 PC는 EC2가 아니므로 Role을 붙일 수 없다. |
| dev | IAM User access key | 지급받은 dev EC2에 AWS 계정 권한이 없으므로 Role을 직접 붙일 수 없다. |
| prod | IAM User access key | 지급받은 prod EC2에 AWS 계정 권한이 없으므로 Role을 직접 붙일 수 없다. |

중요한 점은 access key 하나를 local/dev/prod에 같이 쓰지 않는 것이다. IAM User를 환경별로 나누고, 각 user는 자기 prefix만 접근하게 제한한다.

먼저 policy(권한 묶음)를 만들고, 그 다음 IAM User에 policy를 붙인다.

### 9.1 IAM 정책 생성 화면 공통 경로

콘솔 경로:

1. AWS Console 상단 검색창에서 `IAM` 검색
2. `IAM` 서비스 클릭
3. 왼쪽 메뉴에서 `정책` 또는 `Policies` 클릭
4. 오른쪽 위 `정책 생성` 또는 `Create policy` 클릭
5. `시각적` 탭이 열려 있으면 `JSON` 탭 클릭
6. 기존 내용을 모두 지우고 아래 JSON 입력
7. `다음` 또는 `Next` 클릭
8. 정책 이름 입력
9. `정책 생성` 또는 `Create policy` 클릭

아래 정책 JSON의 `PRIVATE_BUCKET_NAME`은 실제 private 버킷 이름으로 바꾼다.

예:

```text
PRIVATE_BUCKET_NAME =
e103-comong-private-storage-123456789012-ap-northeast-2-an
```

### 9.2 Private dev IAM User용 정책

정책 이름 예시:

```text
E103DevPrivateStoragePolicy
```

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowBucketLocation",
      "Effect": "Allow",
      "Action": "s3:GetBucketLocation",
      "Resource": "arn:aws:s3:::PRIVATE_BUCKET_NAME"
    },
    {
      "Sid": "AllowDevObjectAccess",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::PRIVATE_BUCKET_NAME/dev/*"
    }
  ]
}
```

이 정책은 dev IAM User에 붙인다. local/prod IAM User에는 붙이지 않는다.

### 9.3 Private prod IAM User용 정책

정책 이름 예시:

```text
E103ProdPrivateStoragePolicy
```

prod 서버는 `prod/*` prefix만 접근하게 제한한다.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowBucketLocation",
      "Effect": "Allow",
      "Action": "s3:GetBucketLocation",
      "Resource": "arn:aws:s3:::PRIVATE_BUCKET_NAME"
    },
    {
      "Sid": "AllowProdObjectAccess",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::PRIVATE_BUCKET_NAME/prod/*"
    }
  ]
}
```

이 정책은 prod IAM User에 붙인다. dev/local IAM User에는 붙이지 않는다.

### 9.4 Local 개발자용 IAM User 정책

로컬 PC는 EC2가 아니므로 Role을 붙일 수 없다. 그래서 local 테스트용 IAM User를 만들고 access key를 발급한다.

현재 private 버킷에는 개발자별 폴더를 만들지 않았으므로 local 정책은 `local/*` 전체에 접근하게 둔다. S3의 폴더는 실제 디렉터리가 아니라 prefix(객체 이름 앞부분)이므로 `local/` 폴더를 미리 만들지 않아도 업로드하면 자동으로 보인다.

정책 이름 예시:

```text
E103LocalPrivateStoragePolicy
```

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowBucketLocation",
      "Effect": "Allow",
      "Action": "s3:GetBucketLocation",
      "Resource": "arn:aws:s3:::PRIVATE_BUCKET_NAME"
    },
    {
      "Sid": "AllowLocalObjectAccess",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::PRIVATE_BUCKET_NAME/local/*"
    }
  ]
}
```

바꿔야 하는 부분은 하나다.

```text
PRIVATE_BUCKET_NAME -> 실제 private 버킷 전체 이름
```

나중에 개발자별 격리가 필요하면 그때만 `local/*`를 `local/youngcheol/*`처럼 좁힌다. 이 경우 백엔드 local 환경변수 `AWS_S3_PRIVATE_PREFIX`도 같은 값으로 맞춘다.

```text
정책 Resource: arn:aws:s3:::PRIVATE_BUCKET_NAME/local/youngcheol/*
환경변수: AWS_S3_PRIVATE_PREFIX=local/youngcheol
```

위 local/dev/prod private 정책은 기본적으로 `s3:ListBucket`을 부여하지 않는다. 백엔드가 객체 key를 알고 업로드/조회/삭제만 하는 구조라면 목록 조회 권한은 필요 없다. 나중에 관리자 기능이나 배치 작업에서 목록 조회가 필요해지면 별도 이슈에서 해당 prefix에 한해 `s3:ListBucket`을 추가한다.

### 9.5 Public assets 배포용 정책

프론트 에셋을 업로드할 배포 서버 또는 작업자용 정책이다.

정책 이름 예시:

```text
E103PublicAssetsDeployPolicy
```

`PUBLIC_ASSETS_BUCKET_NAME`은 실제 public assets 버킷 전체 이름으로 바꾼다.

예:

```text
PUBLIC_ASSETS_BUCKET_NAME =
e103-comong-public-assets-123456789012-ap-northeast-2-an
```

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowBucketLocation",
      "Effect": "Allow",
      "Action": "s3:GetBucketLocation",
      "Resource": "arn:aws:s3:::PUBLIC_ASSETS_BUCKET_NAME"
    },
    {
      "Sid": "AllowListFrontendAssets",
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::PUBLIC_ASSETS_BUCKET_NAME",
      "Condition": {
        "StringLike": {
          "s3:prefix": [
            "frontend/game/*",
            "mediapipe/*"
          ]
        }
      }
    },
    {
      "Sid": "AllowWriteFrontendAssets",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject"
      ],
      "Resource": [
        "arn:aws:s3:::PUBLIC_ASSETS_BUCKET_NAME/frontend/game/*",
        "arn:aws:s3:::PUBLIC_ASSETS_BUCKET_NAME/mediapipe/*"
      ]
    }
  ]
}
```

## 10. IAM User access key 연결

이번 작업 기준은 아래처럼 고정한다.

| 대상 | 만들 IAM User | 붙일 정책 | 접근 prefix |
| --- | --- | --- | --- |
| local PC | `e103-local-s3-user` | `E103LocalPrivateStoragePolicy` | `local/*` |
| dev EC2 | `e103-dev-s3-user` | `E103DevPrivateStoragePolicy` | `dev/*` |
| prod EC2 | `e103-prod-s3-user` | `E103ProdPrivateStoragePolicy` | `prod/*` |
| public assets 배포 | `e103-public-assets-deploy-user` | `E103PublicAssetsDeployPolicy` | `frontend/game/*`, `mediapipe/*` |

access key 하나를 모든 환경에서 같이 쓰지 않는다. 키가 노출되거나 잘못 설정됐을 때 영향 범위를 줄이기 위해 환경별로 IAM User를 분리한다.

### 10.1 IAM User 생성

아래 과정을 필요한 IAM User마다 반복한다.

1. IAM 콘솔 진입
2. 왼쪽 메뉴 `사용자` 또는 `Users` 클릭
3. `사용자 생성` 또는 `Create user` 클릭
4. User name 입력
   - 로컬 테스트용 예: `e103-local-s3-user`
   - dev 서버용 예: `e103-dev-s3-user`
   - prod 서버용 예: `e103-prod-s3-user`
   - public assets 배포용 예: `e103-public-assets-deploy-user`
5. `AWS Management Console 액세스 제공`은 체크하지 않음
   - 이 사용자는 콘솔 로그인용이 아니라 API 접근용이다.
6. `다음` 또는 `Next` 클릭
7. 권한 옵션에서 `직접 정책 연결` 또는 `Attach policies directly` 선택
8. 환경에 맞는 policy 검색 후 체크
   - local: `E103LocalPrivateStoragePolicy`
   - dev: `E103DevPrivateStoragePolicy`
   - prod: `E103ProdPrivateStoragePolicy`
   - public assets 배포: `E103PublicAssetsDeployPolicy`
9. `다음` 또는 `Next` 클릭
10. 검토 후 `사용자 생성` 또는 `Create user` 클릭

### 10.2 Access key 생성

1. 생성된 user 상세 화면으로 이동
2. `보안 자격 증명` 또는 `Security credentials` 탭 클릭
3. `액세스 키 만들기` 또는 `Create access key` 클릭
4. Use case 선택 화면이 나오면 실제 사용처에 맞게 선택
   - 로컬 테스트: `Local code`
   - dev/prod EC2: `Application running outside AWS`
   - Jenkins 같은 배포 도구: `Application running outside AWS`
5. 경고가 나오면 내용을 확인하고 계속 진행
6. `Access key ID`, `Secret access key`를 안전한 secret 저장소에 보관
7. CSV 다운로드가 가능하면 한 번만 저장하고, 저장 후 파일 접근 권한을 주의한다.

주의:

- access key는 Jira, Git, Slack 평문에 남기지 않는다.
- `.env.example`에는 값이 아니라 변수명만 둔다.
- 실제 값은 로컬 `.env`, 서버 `.env`, Jenkins credential(젠킨스 비밀값 저장소), 또는 팀 secret 저장소에 둔다.
- local access key를 dev/prod EC2에 넣지 않는다.
- dev access key를 prod EC2에 넣지 않는다.
- prod access key는 운영 서버 외부에 두지 않는다.

### 10.3 나중에 EC2 Role로 바꾸는 경우

지금은 AWS 계정 권한이 없으므로 IAM User access key로 진행한다. 나중에 EC2를 가진 AWS 계정 담당자가 협조할 수 있으면 dev/prod는 EC2 Role로 바꾸는 것이 더 안전하다.

그때는 EC2 담당자에게 아래를 요청한다.

```text
dev EC2에는 E103DevPrivateStoragePolicy가 붙은 IAM Role 연결
prod EC2에는 E103ProdPrivateStoragePolicy가 붙은 IAM Role 연결
```

Role 전환 후에는 dev/prod 서버에서 `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`를 제거한다.

## 11. 프로필별 환경변수

백엔드 구현자가 실제 변수명을 확정해야 한다. 인프라는 아래 값을 준비한다.

중요:

- bucket 값에는 접두사가 아니라 **전체 버킷 이름**을 넣는다.
- `{고유값}` 문자를 그대로 넣으면 안 된다.
- 현재 AWS 화면에서 `전체 버킷 이름`으로 표시된 값을 복사한다.
- private bucket 값은 업로드/조회/삭제 권한이 필요한 백엔드 저장소 설정이다.
- public bucket 값은 공개 정적 자원의 위치를 만들기 위한 설정이다. public bucket에 업로드까지 하려면 `E103PublicAssetsDeployPolicy`가 붙은 별도 IAM User가 필요하다.

권장 변수명:

| 변수 | 의미 |
| --- | --- |
| `STORAGE_TYPE` | 저장소 종류. S3 구현체를 쓸 때 `s3` |
| `AWS_REGION` | S3 리전. 서울이면 `ap-northeast-2` |
| `AWS_S3_PRIVATE_BUCKET` | 사용자 업로드 파일이 들어가는 private bucket 전체 이름 |
| `AWS_S3_PRIVATE_PREFIX` | private bucket 안에서 환경을 나누는 prefix |
| `AWS_S3_PUBLIC_BUCKET` | 프론트 정적 자원이 들어가는 public assets bucket 전체 이름 |
| `AWS_S3_PUBLIC_BASE_URL` | public assets bucket의 브라우저 접근 기본 URL |
| `AWS_S3_PUBLIC_GAME_ASSET_PREFIX` | 게임 이미지/음원/폰트 prefix |
| `AWS_S3_PUBLIC_MEDIAPIPE_PREFIX` | MediaPipe wasm/model prefix |
| `AWS_ACCESS_KEY_ID` | 해당 환경 IAM User의 access key id |
| `AWS_SECRET_ACCESS_KEY` | 해당 환경 IAM User의 secret access key |

기존처럼 단일 변수명 `AWS_S3_BUCKET`, `AWS_S3_PREFIX`를 쓰면 private/public 구분이 흐려진다. S3 구현 시에는 위처럼 private/public을 분리한 변수명을 권장한다.

### 11.1 local S3 테스트

local은 local 전용 IAM User access key를 사용한다. 현재 개발자별 prefix를 만들지 않았으므로 private prefix는 `local`로 둔다.

```env
STORAGE_TYPE=s3
AWS_REGION=ap-northeast-2

AWS_S3_PRIVATE_BUCKET=e103-comong-private-storage-123456789012-ap-northeast-2-an
AWS_S3_PRIVATE_PREFIX=local

AWS_S3_PUBLIC_BUCKET=e103-comong-public-assets-123456789012-ap-northeast-2-an
AWS_S3_PUBLIC_BASE_URL=https://e103-comong-public-assets-123456789012-ap-northeast-2-an.s3.ap-northeast-2.amazonaws.com
AWS_S3_PUBLIC_GAME_ASSET_PREFIX=frontend/game/v1/assets
AWS_S3_PUBLIC_MEDIAPIPE_PREFIX=mediapipe/0.10.21

AWS_ACCESS_KEY_ID=<LOCAL_AWS_ACCESS_KEY_ID>
AWS_SECRET_ACCESS_KEY=<LOCAL_AWS_SECRET_ACCESS_KEY>
```

### 11.2 dev 서버

dev 서버는 dev 전용 IAM User access key를 사용한다. local/prod 키를 넣지 않는다. Jenkins의 `env-dev-file` credential에는 아래 값이 들어가야 한다.

```env
STORAGE_TYPE=s3
AWS_REGION=ap-northeast-2

AWS_S3_PRIVATE_BUCKET=e103-comong-private-storage-123456789012-ap-northeast-2-an
AWS_S3_PRIVATE_PREFIX=dev

AWS_S3_PUBLIC_BUCKET=e103-comong-public-assets-123456789012-ap-northeast-2-an
AWS_S3_PUBLIC_BASE_URL=https://e103-comong-public-assets-123456789012-ap-northeast-2-an.s3.ap-northeast-2.amazonaws.com
AWS_S3_PUBLIC_GAME_ASSET_PREFIX=frontend/game/v1/assets
AWS_S3_PUBLIC_MEDIAPIPE_PREFIX=mediapipe/0.10.21

AWS_ACCESS_KEY_ID=<DEV_AWS_ACCESS_KEY_ID>
AWS_SECRET_ACCESS_KEY=<DEV_AWS_SECRET_ACCESS_KEY>
```

주의:

- 위 dev access key는 private bucket의 `dev/*` 접근용이다.
- Jenkins가 public assets를 S3에 업로드하는 job을 따로 가진다면, 그 job에는 `e103-public-assets-deploy-user` access key를 별도 credential로 넣는다.
- 단순히 public assets URL을 백엔드나 프론트가 읽기만 한다면 public bucket용 access key는 필요 없다.

### 11.3 prod 서버

prod 서버는 prod 전용 IAM User access key를 사용한다. dev/local 키를 넣지 않는다.

```env
STORAGE_TYPE=s3
AWS_REGION=ap-northeast-2

AWS_S3_PRIVATE_BUCKET=e103-comong-private-storage-123456789012-ap-northeast-2-an
AWS_S3_PRIVATE_PREFIX=prod

AWS_S3_PUBLIC_BUCKET=e103-comong-public-assets-123456789012-ap-northeast-2-an
AWS_S3_PUBLIC_BASE_URL=https://e103-comong-public-assets-123456789012-ap-northeast-2-an.s3.ap-northeast-2.amazonaws.com
AWS_S3_PUBLIC_GAME_ASSET_PREFIX=frontend/game/v1/assets
AWS_S3_PUBLIC_MEDIAPIPE_PREFIX=mediapipe/0.10.21

AWS_ACCESS_KEY_ID=<PROD_AWS_ACCESS_KEY_ID>
AWS_SECRET_ACCESS_KEY=<PROD_AWS_SECRET_ACCESS_KEY>
```

위 버킷 이름과 URL은 예시다. 실제로는 본인 AWS 화면의 private bucket/public assets bucket 전체 이름을 사용한다.

지금 설계 기준에서는 local/dev/prod 모두 IAM User access key를 사용한다. 단, 각 환경의 IAM User와 access key는 분리한다.

private bucket을 유지하려면 백엔드가 다음 중 하나로 구현되어야 한다.

1. presigned URL(일정 시간만 유효한 임시 URL)을 발급한다.
2. 백엔드 다운로드 API가 S3 객체를 읽어 응답한다.
3. public 파일만 별도 public prefix 또는 public bucket으로 저장한다.

현재 프로젝트에는 `Artwork.isPublic` 값이 있으므로, 작품 이미지까지 무조건 public URL로 저장하는 방식은 주의한다.

## 12. 프론트 public assets 환경변수 후보

프론트 게임 에셋을 S3로 옮기려면 프론트 코드도 변경이 필요하다. 현재는 `/assets/...` 기준으로 로딩한다.

프론트 런타임에는 access key를 넣지 않는다. 브라우저에서 읽을 public URL만 넣는다.

```env
VITE_GAME_ASSET_BASE_URL=https://e103-comong-public-assets-123456789012-ap-northeast-2-an.s3.ap-northeast-2.amazonaws.com/frontend/game/v1/assets
VITE_MEDIAPIPE_BASE_URL=https://e103-comong-public-assets-123456789012-ap-northeast-2-an.s3.ap-northeast-2.amazonaws.com/mediapipe/0.10.21
```

위 URL의 버킷 이름도 예시다. 실제 public assets bucket 전체 이름으로 바꾼다.

이 작업은 S3 bucket 생성과 별도 FE 작업으로 분리하는 것이 좋다.

## 13. Public assets 업로드 규칙

프론트 에셋은 버전 prefix를 사용한다.

```text
frontend/game/v1/assets/...
frontend/game/v2/assets/...
```

권장 규칙:

- 같은 경로에 덮어쓰지 않는다.
- 새 배포 버전은 새 prefix를 만든다.
- 최근 1~2개 버전만 유지한다.
- 프리 티어를 위해 오래된 버전은 삭제한다.

캐시 헤더 권장값:

```text
Cache-Control: public, max-age=31536000, immutable
```

이 값은 `v1`, `v2`처럼 경로가 바뀌는 정적 파일에만 사용한다. 같은 URL의 파일을 덮어쓰는 방식에는 쓰지 않는다.

## 14. 프리 티어 비용 방어

프리 티어 조건에서는 아래를 지킨다.

### 14.1 하지 말 것

- S3 Versioning 켜기
- S3 Transfer Acceleration 켜기
- Server access logging 켜기
- 불필요한 CloudTrail data event 켜기
- 대용량 원본 파일을 public assets에 무제한 보관
- 사용자 업로드 파일을 public assets 버킷에 저장

### 14.2 정리 기준

| prefix | 정리 기준 |
| --- | --- |
| `local/*` | 7~14일 후 삭제 |
| `dev/*` | 30일 후 삭제 |
| `prod/*` | 자동 삭제하지 않음 |
| `frontend/game/v*` | 최근 1~2개 버전만 유지 |

### 14.3 Billing 알림

S3 작업 전에 AWS Budgets(예산 알림)를 설정한다.

권장:

```text
월 예산: 1 USD
알림: 50%, 80%, 100%
```

프리 티어라도 초과 사용하면 과금될 수 있다.

## 15. 테스트 체크리스트

### 15.1 Private 버킷

- [ ] private 버킷 URL을 브라우저에서 직접 열면 AccessDenied가 나온다.
- [ ] dev IAM User 권한으로 `dev/*`에 업로드 가능하다.
- [ ] dev IAM User 권한으로 `prod/*`에 업로드가 거부된다.
- [ ] prod IAM User 권한으로 `prod/*`에 업로드 가능하다.
- [ ] prod IAM User 권한으로 `dev/*`에 업로드가 거부된다.
- [ ] local IAM User 권한으로 `local/*`에 업로드 가능하다.
- [ ] local IAM User 권한으로 `dev/*`, `prod/*` 접근이 거부된다.
- [ ] 파일 삭제 시 S3 객체가 삭제된다.

### 15.2 Public assets 버킷

- [ ] `frontend/game/v1/assets/...` 객체 URL을 브라우저에서 열 수 있다.
- [ ] 버킷 객체 목록은 공개되지 않는다.
- [ ] public 사용자는 `PutObject`, `DeleteObject`를 할 수 없다.
- [ ] CORS 허용 origin에서 이미지/음원 로딩이 된다.
- [ ] 허용하지 않은 origin에서 필요한 요청이 차단되는지 확인한다.

### 15.3 프로젝트 연동

- [ ] 작품 이미지 업로드 후 S3에 객체가 생긴다.
- [ ] 작품 이미지 조회/수정/삭제 흐름이 유지된다.
- [ ] 운동 썸네일 업로드 후 S3에 객체가 생긴다.
- [ ] 운동 데모 영상 업로드 후 S3에 객체가 생긴다.
- [ ] 로컬 profile은 원하면 기존 local storage로도 실행 가능하다.
- [ ] S3 profile은 로컬에서도 `local` prefix로 테스트 가능하다.

## 16. 권장 작업 순서

1. private 버킷 생성
2. public assets 버킷 생성
3. private 버킷 IAM policy 생성
4. local 테스트용 IAM User 생성 후 access key 발급
5. dev 서버용 IAM User 생성 후 access key 발급
6. prod 서버용 IAM User 생성 후 access key 발급
7. public assets bucket policy 추가
8. public assets CORS 추가
9. 백엔드 환경변수 준비
10. 백엔드 S3 구현 작업 진행
11. local S3 업로드 테스트
12. dev 배포 테스트
13. prod 배포 전 prod prefix 권한 테스트
14. public assets 이전은 별도 FE 작업으로 진행
