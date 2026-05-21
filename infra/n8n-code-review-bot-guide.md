# n8n GitLab MR AI Code Review Bot 운영 및 구축 가이드

이 문서는 `GitLab Merge Request(MR)`가 생성되거나 업데이트될 때 `n8n`이 자동으로 AI 코드리뷰를 수행하고, 결과를 GitLab MR 댓글로 남기는 자동화의 최종 운영 문서다.

이 문서는 단순 예제가 아니라, 실제 구축 과정에서 겪었던 오류와 최종 동작 기준을 반영해서 다시 정리한 문서다.

## 1. 문서 목적

이 문서는 아래 두 목적을 동시에 만족하도록 작성했다.

1. 처음부터 다시 만들 때 따라할 수 있는 구축 가이드
2. 지금 운영 중인 구조를 이해하고 유지보수할 수 있는 운영 문서

즉 아래를 한 문서에서 본다.

- 어떤 버튼을 눌러야 하는지
- 어떤 Credential을 만들어야 하는지
- 어떤 노드를 어떤 순서로 추가해야 하는지
- 노드가 각각 무슨 역할을 하는지
- 어디서 자주 틀리는지
- 지금 실제로 무엇이 돌아가고 있는지

## 2. 현재 운영 상태

현재 워크플로우는 아래까지 동작하는 상태를 기준으로 정리한다.

- GitLab MR 이벤트를 `n8n`이 `Webhook`으로 수신
- `open`, `update`, `reopen` 상태의 MR만 필터링
- GitLab API로 MR diff 조회
- AI 리뷰 프롬프트 생성
- `GMS Claude` 호출
- AI 응답을 GitLab 댓글 형식으로 변환
- GitLab MR 일반 댓글(root note, MR 전체 댓글) 등록

현재 문서 기준 기본 구조:

```text
GitLab MR 이벤트
-> GitLab Webhook
-> n8n Webhook
-> Filter MR Event
-> Get MR Diffs
-> Build Review Prompt
-> AI Review (GMS Claude)
-> Build GitLab Comment
-> Create MR Note
```

현재 정책:

- 줄 단위 댓글(diff note, 특정 줄에 다는 댓글)은 아직 하지 않음
- MR 전체 댓글 1개만 작성
- 스타일 지적은 최소화
- 버그, 보안, 성능, 예외 처리, 테스트 누락 중심으로 리뷰

## 3. 전체 인프라 구조

운영 서버 기준 구조는 아래와 같다.

```text
GitLab
-> HTTPS Webhook
-> nginx
-> /n8n 경로 reverse proxy(앞단 웹서버가 내부 서비스로 요청을 전달하는 방식)
-> n8n
-> GitLab API / GMS Claude API 호출
```

핵심 포인트:

- `n8n`은 별도 서브도메인 대신 `https://k14e103.p.ssafy.io/n8n/` 경로로 운영
- `nginx`가 HTTPS를 받음
- `n8n`은 내부적으로 `HTTP 5678` 포트 사용
- 외부는 HTTPS, 내부 컨테이너 통신은 HTTP 구조

실제 사용 URL:

- n8n 편집기: `https://k14e103.p.ssafy.io/n8n/`
- 운영 Webhook URL: `https://k14e103.p.ssafy.io/n8n/webhook/gitlab/mr-review`
- GitLab: `https://lab.ssafy.com`
- GMS Claude endpoint: `https://gms.ssafy.io/gmsapi/api.anthropic.com/v1/messages`

## 4. HTTPS와 nginx 운영 시 주의점

실제 구축하면서 가장 많이 틀렸던 부분이다.

### 4.1 `/n8n` 경로 운영

이번 구성은 `n8n.도메인` 서브도메인 방식이 아니라 `도메인/n8n` 경로 방식이다.

예:

- `https://k14e103.p.ssafy.io/n8n/`

이 방식은 가능하지만 `n8n`이 기본적으로 루트(`/`) 배포를 더 자연스럽게 가정하기 때문에 아래 값을 꼭 맞춰야 한다.

- `N8N_PATH=/n8n/`
- `N8N_EDITOR_BASE_URL=https://k14e103.p.ssafy.io/n8n/`
- `WEBHOOK_URL=https://k14e103.p.ssafy.io/n8n/`
- `N8N_PROXY_HOPS=1`

### 4.2 `n8n.conf`를 별도로 두지 않음

처음에는 `dev.conf`와 `n8n.conf`를 따로 두려고 했지만 실제로는 `n8n.conf`에 placeholder(치환되지 않은 템플릿 문자열)와 문법 오류가 있어 `nginx -t`가 실패했다.

최종적으로는:

- `n8n.conf`는 제거
- `dev.conf` 하나에서 `/jenkins`, `/dev/api/v1`, `/n8n` 모두 처리

### 4.3 인증서 경로

실제 인증서 경로는 `k14e103.p.ssafy.io`가 아니라 wildcard(와일드카드, 여러 하위 도메인을 한 번에 커버하는 인증서) 도메인인 `p.ssafy.io` 경로였다.

실제 확인 결과:

- `/etc/letsencrypt/live/p.ssafy.io/fullchain.pem`
- `/etc/letsencrypt/live/p.ssafy.io/privkey.pem`

그리고 인증서 SAN(허용 도메인 목록)에는 `DNS:*.p.ssafy.io`가 들어 있어 `k14e103.p.ssafy.io`를 커버했다.

### 4.4 nginx 컨테이너에서 인증서가 보여야 함

`dev.conf`만 바꾸면 안 되고 `docker-compose.platform.yml`에서 `nginx` 컨테이너에 인증서 디렉터리를 마운트해야 한다.

예:

```yaml
- /etc/letsencrypt:/etc/letsencrypt:ro
```

이걸 안 하면 `cannot load certificate` 에러가 난다.

## 5. 토큰 전략

이 자동화에는 크게 3종류의 비밀값이 필요하다.

### 5.1 GitLab API 토큰

용도:

- MR 메타 정보 읽기
- MR diff 읽기
- MR 댓글 작성

선택지는 두 가지다.

#### A. Project Access Token

장점:

- 프로젝트 단위로 권한 관리 가능
- 개인 계정 노출이 적음

단점:

- 댓글 작성자가 `project_xxx_bot_xxx` 형태의 봇 계정으로 보임

#### B. Personal Access Token

장점:

- 댓글 작성자가 본인 GitLab 계정으로 보임

단점:

- 개인 계정 권한을 자동화가 사용
- 토큰 관리가 더 민감함

둘 다 권한(scope, 권한 범위)은 `api`가 가장 단순하다.

### 5.2 GitLab Webhook Secret

이건 GitLab이 n8n으로 보낸 요청이 진짜 GitLab에서 온 것인지 검증하기 위한 비밀 문자열이다.

이 값은 누가 발급해주는 것이 아니라 직접 정한다.

예:

```text
wish-gitlab-webhook-secret-2026
```

이 값을:

- GitLab Webhook의 `Secret token`
- n8n `Header Auth` credential의 `X-Gitlab-Token` 값

둘 다 동일하게 넣어야 한다.

### 5.3 GMS KEY

이 프로젝트는 OpenAI나 Anthropic 공식 SDK credential을 직접 쓰지 않고 `GMS` 프록시 URL을 통해 Claude를 호출한다.

즉:

- `Anthropic credential` 사용 안 함
- `Header Auth` credential에 `x-api-key`로 `GMS KEY` 저장

## 6. 구축 순서 한눈에 보기

처음부터 다시 만들 때는 아래 순서로 진행하면 된다.

1. n8n 접속
2. GitLab API 토큰 준비
3. Webhook Secret 문자열 정하기
4. GMS KEY 준비
5. n8n Credentials 3개 생성
6. 새 Workflow 생성
7. `Webhook` 노드 생성
8. GitLab 프로젝트에 Webhook 등록
9. `Filter MR Event` 노드 추가
10. `Get MR Diffs` 노드 추가
11. `Merge MR Meta And Diffs` 노드 추가
12. `Build Review Prompt` 노드 추가
13. `AI Review (GMS Claude)` 노드 추가
14. `Merge Prompt And AI Result` 노드 추가
15. `Build GitLab Comment` 노드 추가
16. `Create MR Note` 노드 추가
17. 워크플로우 Publish
18. 실제 MR 생성 또는 update로 테스트

## 7. n8n에서 Credential 만들기

### 7.1 Credential 1: GitLab Webhook Secret용 Header Auth

버튼 순서:

1. n8n 왼쪽 사이드바에서 `Credentials`
2. `Create Credential`
3. 검색창에 `Header Auth`
4. `Header Auth` 선택

입력값:

- Name: `gitlab-webhook-secret`
- Header Name: `X-Gitlab-Token`
- Value: `wish-gitlab-webhook-secret-2026`

마지막:

1. `Save`

이 Credential이 하는 일:

- GitLab이 보낸 webhook 요청의 `X-Gitlab-Token` 헤더를 검증

### 7.2 Credential 2: GitLab API

버튼 순서:

1. `Credentials`
2. `Create Credential`
3. 검색창에 `GitLab`
4. `GitLab API` 선택

입력값:

- Name: `gitlab-ssafy-api`
- GitLab Server URL: `https://lab.ssafy.com`
- Access Token: `<Project Access Token 또는 Personal Access Token>`

마지막:

1. `Save`

이 Credential이 하는 일:

- GitLab API를 호출할 때 인증 담당

### 7.3 Credential 3: GMS KEY용 Header Auth

버튼 순서:

1. `Credentials`
2. `Create Credential`
3. 검색창에 `Header Auth`
4. `Header Auth` 선택

입력값:

- Name: `gms-anthropic-key`
- Header Name: `x-api-key`
- Value: `<GMS KEY>`

마지막:

1. `Save`

이 Credential이 하는 일:

- GMS Claude 호출 시 API 키 전달

## 8. GitLab Webhook 등록

GitLab 프로젝트의 `Settings -> Webhooks`에서 설정한다.

버튼 순서:

1. 프로젝트 열기
2. `Settings`
3. `Webhooks`
4. `Add new webhook`

입력값:

- Name: `n8n mr review bot`
- Description: `Send merge request events to n8n AI review workflow`
- URL: `https://k14e103.p.ssafy.io/n8n/webhook/gitlab/mr-review`
- Secret token: `wish-gitlab-webhook-secret-2026`
- Trigger: `Merge request events`만 체크
- SSL verification: 활성화 유지

마지막:

1. `Add webhook`

주의:

- `webhook-test` URL은 사용하지 않음
- 운영용 URL만 사용
- `Merge request events` 외 나머지 트리거는 일단 체크하지 않음

## 9. 워크플로우 생성

버튼 순서:

1. n8n 홈 또는 워크스페이스 화면에서 `Create Workflow`
2. 이름을 `gitlab-mr-ai-review`로 지정

이후 아래 순서대로 노드를 추가한다.

## 10. 전체 노드 연결 구조

최종 연결 구조는 아래와 같다.

```text
Webhook
-> Filter MR Event
-> Get MR Diffs
-> Merge MR Meta And Diffs
-> Build Review Prompt
-> AI Review (GMS Claude)
-> Merge Prompt And AI Result
-> Build GitLab Comment
-> Create MR Note
```

정확한 입력 연결은 중간에 갈라지는 부분이 있다.

```text
Webhook
-> Filter MR Event

Filter MR Event -> Get MR Diffs
Filter MR Event -> Merge MR Meta And Diffs (Input 1)

Get MR Diffs -> Merge MR Meta And Diffs (Input 2)

Merge MR Meta And Diffs -> Build Review Prompt

Build Review Prompt -> AI Review (GMS Claude)
Build Review Prompt -> Merge Prompt And AI Result (Input 1)

AI Review (GMS Claude) -> Merge Prompt And AI Result (Input 2)

Merge Prompt And AI Result -> Build GitLab Comment
Build GitLab Comment -> Create MR Note
```

중요:

- `Filter MR Event` 출력은 한 군데만 가는 것이 아니라 두 갈래로 나간다
- `Build Review Prompt` 출력도 두 갈래로 나간다

## 11. 노드별 상세 설정

### 11.1 Node 1: Webhook

노드 역할:

- GitLab Webhook 요청을 처음 받는 진입점

추가 순서:

1. 캔버스에서 `Add first step`
2. 검색창에 `Webhook`
3. `Webhook` 선택

입력값:

- HTTP Method: `POST`
- Path: `gitlab/mr-review`
- Authentication: `Header Auth`
- Credential: `gitlab-webhook-secret`
- Respond: `Immediately`
- Response Code: `200`

운영 URL:

```text
https://k14e103.p.ssafy.io/n8n/webhook/gitlab/mr-review
```

### 11.2 Node 2: Filter MR Event

노드 역할:

- GitLab 이벤트 중 실제 리뷰 대상 MR만 통과시킴
- draft MR이나 필요 없는 action은 버림
- 이후 노드에서 쓸 메타 정보만 정리

추가 순서:

1. `Webhook` 노드 오른쪽 `+`
2. 검색창에 `Code`
3. `Code` 선택
4. 노드 이름을 `Filter MR Event`로 변경

설정:

- Mode: `Run Once for All Items`
- Language: `JavaScript`

최종 코드 예시:

```javascript
const payload = $input.first().json.body ?? $input.first().json;

if (payload.object_kind !== 'merge_request') {
  return [];
}

const attr = payload.object_attributes ?? {};
const action = attr.action ?? '';
const allowedActions = new Set(['open', 'update', 'reopen']);

if (!allowedActions.has(action)) {
  return [];
}

if (attr.draft === true) {
  return [];
}

if (!payload.project?.id || !attr.iid) {
  throw new Error('project.id 또는 merge request iid가 없습니다.');
}

return [
  {
    json: {
      projectId: payload.project.id,
      projectPath: payload.project.path_with_namespace ?? 's14-final/S14P31E103',
      mrIid: attr.iid,
      action,
      mrTitle: attr.title ?? '',
      mrDescription: attr.description ?? '',
      mrUrl: attr.url ?? '',
      sourceBranch: attr.source_branch ?? '',
      targetBranch: attr.target_branch ?? '',
      authorName: payload.user?.name ?? '',
      authorUsername: payload.user?.username ?? '',
    },
  },
];
```

주의:

- `payload`는 `$input.first().json.body`를 우선 사용
- 이 부분을 잘못 읽으면 `GitLab Test`도 `실제 MR 이벤트`도 계속 필터에서 비어버린다

### 11.3 Node 3: Get MR Diffs

노드 역할:

- GitLab API로 MR 변경 파일과 diff를 조회

추가 순서:

1. `Filter MR Event` 노드 오른쪽 `+`
2. 검색창에 `HTTP Request`
3. `HTTP Request` 선택
4. 노드 이름을 `Get MR Diffs`로 변경

설정:

- Method: `GET`
- URL:

```text
https://lab.ssafy.com/api/v4/projects/{{$json.projectId}}/merge_requests/{{$json.mrIid}}/diffs
```

- Authentication: `Predefined Credential Type`
- Credential Type: `GitLab API`
- Credential: `gitlab-ssafy-api`
- Send Query Parameters: `On`
- Query:
  - `per_page = 100`
  - `page = 1`

주의:

- binary diff도 들어옴
- `collapsed`, `too_large`, 빈 diff가 섞일 수 있음
- 노드에 빨간 느낌표가 남아도 실제 실행이 성공하면 현재 런타임에 즉시 치명적이지 않을 수 있음

### 11.4 Node 4: Merge MR Meta And Diffs

노드 역할:

- MR 메타 정보와 diff 결과를 한 흐름으로 합침

추가 순서:

1. `Get MR Diffs` 노드 오른쪽 `+`
2. 검색창에 `Merge`
3. `Merge` 선택
4. 이름을 `Merge MR Meta And Diffs`로 변경

설정:

- Mode: `Append`
- Number of Inputs: `2`

연결:

- `Filter MR Event` 출력 -> `Merge MR Meta And Diffs`의 `Input 1`
- `Get MR Diffs` 출력 -> `Merge MR Meta And Diffs`의 `Input 2`

주의:

- `Filter MR Event`의 출력 포트에서 선을 하나 더 뽑아 `Input 1`으로 연결해야 한다
- 한 출력에서 여러 갈래로 나갈 수 있다

### 11.5 Node 5: Build Review Prompt

노드 역할:

- 메타 정보와 diff를 기반으로 AI 입력용 prompt 생성
- 리뷰 제외 파일 필터링
- 최종적으로 `systemPrompt`, `userPrompt`, `diffCount` 생성

추가 순서:

1. `Merge MR Meta And Diffs` 노드 오른쪽 `+`
2. 검색창에 `Code`
3. `Code` 선택
4. 이름을 `Build Review Prompt`로 변경

설정:

- Mode: `Run Once for All Items`
- Language: `JavaScript`

핵심 포인트:

- 이미지, 음원, 바이너리 파일 제외
- 너무 많은 diff는 자르기
- AI에게 JSON만 반환하라고 강제

### 11.6 Node 6: AI Review (GMS Claude)

노드 역할:

- GMS Claude에 실제 리뷰 요청을 보내는 노드

추가 순서:

1. `Build Review Prompt` 노드 오른쪽 `+`
2. 검색창에 `HTTP Request`
3. `HTTP Request` 선택
4. 이름을 `AI Review (GMS Claude)`로 변경

설정:

- Method: `POST`
- URL: `https://gms.ssafy.io/gmsapi/api.anthropic.com/v1/messages`
- Authentication: `Generic Credential Type`
- Generic Auth Type: `Header Auth`
- Credential: `gms-anthropic-key`

Headers:

- Send Headers: `On`
- `Content-Type = application/json`
- `anthropic-version = 2023-06-01`

Body:

- Send Body: `On`
- Body Content Type: `JSON`
- Specify Body: `Using JSON`
- JSON 입력칸은 `fx` 모드로 전환

권장 입력:

```javascript
{{ JSON.stringify({
  model: "claude-sonnet-4-5-20250929",
  max_tokens: 2048,
  system: $json.systemPrompt,
  messages: [
    {
      role: "user",
      content: $json.userPrompt
    }
  ]
}) }}
```

자주 틀린 예:

- `={{ ... }}` 를 일반 JSON 칸에 넣음
- JS object를 그대로 반환해서 `[object Object]`가 됨
- `"system": "={{ $json.systemPrompt }}"` 처럼 긴 문자열을 직접 JSON 문자열 안에 박아 넣음

### 11.7 Node 7: Merge Prompt And AI Result

노드 역할:

- AI 응답과 원래 prompt 메타 정보를 다시 묶음

추가 순서:

1. `AI Review (GMS Claude)` 노드 오른쪽 `+`
2. 검색창에 `Merge`
3. `Merge` 선택
4. 이름을 `Merge Prompt And AI Result`로 변경

설정:

- Mode: `Combine`
- Combine By: `Position`

연결:

- `Build Review Prompt` 출력 -> `Input 1`
- `AI Review (GMS Claude)` 출력 -> `Input 2`

주의:

- `Build Review Prompt` 출력도 한 갈래는 `AI Review`, 다른 한 갈래는 `Merge Prompt And AI Result`로 연결해야 한다

### 11.8 Node 8: Build GitLab Comment

노드 역할:

- AI 응답에서 텍스트 추출
- 코드블록 제거
- JSON 파싱
- GitLab MR 댓글 Markdown 생성

추가 순서:

1. `Merge Prompt And AI Result` 노드 오른쪽 `+`
2. 검색창에 `Code`
3. `Code` 선택
4. 이름을 `Build GitLab Comment`로 변경

설정:

- Mode: `Run Once for Each Item`
- Language: `JavaScript`

핵심 주의:

- AI 응답이 JSON처럼 보여도 끝이 잘려 있을 수 있음
- `JSON.parse()` 전에 공백과 fenced code block 제거 필요
- `max_tokens`가 부족하면 여기서 파싱 실패가 날 수 있음

### 11.9 Node 9: Create MR Note

노드 역할:

- 최종 댓글을 GitLab MR에 등록

추가 순서:

1. `Build GitLab Comment` 노드 오른쪽 `+`
2. 검색창에 `HTTP Request`
3. `HTTP Request` 선택
4. 이름을 `Create MR Note`로 변경

설정:

- Method: `POST`
- URL:

```text
https://lab.ssafy.com/api/v4/projects/{{$json.projectId}}/merge_requests/{{$json.mrIid}}/notes
```

- Authentication: `Predefined Credential Type`
- Credential Type: `GitLab API`
- Credential: `gitlab-ssafy-api`

Body 권장 설정:

- Send Body: `On`
- Body Content Type: `JSON`
- Specify Body: `Using Fields Below`
- Parameter 추가
  - Name: `body`
  - Value: `{{ $json.body }}`

왜 이렇게 하냐:

- `$json.body` 안에는 줄바꿈이 많은 긴 댓글 문자열이 들어감
- 이를 `Using JSON`에 직접 넣으면 `Bad control character` 에러가 나기 쉬움

## 12. Publish와 실행 확인

현재 n8n UI에서는 예전 `Active` 토글 대신 `Publish` 중심 UI를 사용한다.

즉 운영용 Webhook을 살리려면:

1. 오른쪽 위 `Publish` 클릭
2. 다시 `Publish` 확인

완료되면 우측 상단에 `Published` 상태가 보인다.

그 다음 검증은:

1. GitLab에서 MR 생성 또는 기존 MR에 commit push
2. n8n 상단 `Executions` 탭으로 이동
3. 실행 기록 열기
4. 어느 노드까지 초록 체크가 갔는지 확인

## 13. 실제 구축 과정에서 자주 틀린 점

### 13.1 GitLab Test 버튼과 실제 MR 이벤트는 다를 수 있음

GitLab Webhook의 `Test` 버튼은 payload 예시를 보내는 용도에 가깝다.

문제:

- `action` 값이 실제 MR 이벤트와 다르거나 비어 있을 수 있음
- 그래서 `Filter MR Event`가 `return []`로 끝날 수 있음

실제 검증은:

- MR 생성
- 기존 MR에 commit push

로 하는 것이 더 정확하다.

### 13.2 `payload` 위치를 잘못 읽기 쉬움

잘못된 예:

```javascript
const payload = $input.first().json;
```

더 안전한 예:

```javascript
const payload = $input.first().json.body ?? $input.first().json;
```

### 13.3 HTTP Request JSON body 입력 방식이 헷갈림

`n8n`의 `HTTP Request` 노드에서는 아래를 자주 혼동한다.

- 일반 JSON 텍스트 입력
- `fx` expression 모드
- `Using JSON`
- `Using Fields Below`

운영 경험상:

- 복잡한 객체를 만들 때는 `Using JSON + fx + JSON.stringify(...)`
- 단순한 한 필드 댓글 작성은 `Using Fields Below`

가 더 안정적이었다.

### 13.4 `Secure cookie` 문제

HTTP로 `/n8n`을 열었을 때 `secure cookie` 경고가 났다.

이 문제는 임시로 `N8N_SECURE_COOKIE=false`로 우회할 수 있지만 최종적으로는 HTTPS로 정리하는 것이 맞다.

### 13.5 인증서 경로 오판

처음엔 `k14e103.p.ssafy.io` 경로를 찾았지만 실제 인증서는 `p.ssafy.io` wildcard였다.

즉:

- 경로 이름
- SAN 포함 여부

를 실제 서버에서 확인해야 한다.

### 13.6 기존 컨테이너 이름 충돌

`docker compose up -d`로 무조건 재생성하려 하면:

- `e103-nginx`
- `e103-jenkins`

같은 고정 `container_name` 때문에 충돌할 수 있다.

실제로는:

- 특정 서비스만 `--no-deps`로 올리거나
- 필요 시 기존 컨테이너를 stop/remove 하고 재생성

하는 것이 필요했다.

## 14. 현재 워크플로우의 동작 특성

### 14.1 현재 잘 되는 것

- MR 이벤트 수신
- diff 조회
- AI 리뷰 생성
- GitLab MR 댓글 작성

### 14.2 현재 의도적으로 하지 않는 것

- 줄 단위 댓글
- inline suggestion
- 파일별 개별 discussion 생성

즉 현재는 MR 전체 요약 댓글 1개를 남기는 방식이다.

### 14.3 현재 남아 있을 수 있는 표시

노드에 빨간 느낌표가 남아 있어도:

- 실제 실행이 성공하고
- GitLab 댓글이 정상 생성되면

현재 런타임에는 큰 영향이 없을 수 있다.

즉:

- 성공 여부는 실제 실행 결과와 GitLab 댓글 생성으로 판단
- 노드 배지는 나중에 정리 가능

## 15. 운영 체크리스트

실제 운영 전 최소 체크:

1. n8n 워크플로우가 `Published` 상태인지 확인
2. GitLab Webhook URL이 운영용 URL인지 확인
3. GitLab Webhook Secret과 n8n Header Auth 값이 같은지 확인
4. GitLab API credential 토큰이 유효한지 확인
5. GMS KEY credential이 유효한지 확인
6. 실제 MR 생성 또는 update 이벤트로 테스트했는지 확인
7. GitLab에 댓글이 실제로 생성되는지 확인

## 16. 후속 개선 아이디어

### 16.1 줄 단위 댓글

현재는 MR 전체 댓글만 남긴다.

확장하려면:

- GitLab Discussions API 사용
- file path, line number, diff position 관리

가 추가로 필요하다.

### 16.2 프롬프트 품질 개선

- 최대 findings 개수 조정
- findings 본문 길이 제한
- 경로별 규칙 분기
  - backend
  - frontend
  - game

### 16.3 diff 전처리 강화

- binary diff 완전 제거
- collapsed / empty diff 제외
- 너무 긴 diff truncate(잘라내기)

### 16.4 알림과 실패 대응

- 실패 시 Slack 또는 Mattermost 알림
- 재시도 정책
- 실행 로그 태깅

## 17. 요약

이 자동화는 최종적으로 아래 상태까지 완성되었다.

- `GitLab MR -> n8n -> GMS Claude -> GitLab MR 댓글`
- HTTPS `/n8n` 경로 기반 운영
- `Webhook`, `diff 조회`, `AI 리뷰`, `댓글 작성` 성공

가장 많이 틀린 부분은 아래였다.

- `Filter MR Event`에서 payload 위치 잘못 읽기
- `HTTP Request` 노드 JSON body 입력 방식 혼동
- `Create MR Note`에서 긴 문자열을 직접 JSON에 넣기
- GitLab Test 버튼 payload와 실제 MR 이벤트 차이

현재 이 문서만 보면:

- 어떻게 구성했는지
- 어디서 자주 실패하는지
- 지금 무엇이 실제로 돌아가는지

를 한 번에 파악할 수 있어야 한다.

## 18. 참고 문서

- n8n Webhook node: [docs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/)
- n8n HTTP Request node: [docs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.httprequest/)
- n8n Code node: [docs](https://docs.n8n.io/code/code-node/)
- n8n Dirty nodes: [docs](https://docs.n8n.io/workflows/executions/dirty-nodes/)
- GitLab Webhooks: [docs](https://docs.gitlab.com/user/project/integrations/webhook_events/)
- GitLab Merge Requests API: [docs](https://docs.gitlab.com/api/merge_requests/)
- GitLab Notes API: [docs](https://docs.gitlab.com/api/notes/)
- GitLab Personal access tokens: [docs](https://docs.gitlab.com/user/profile/personal_access_tokens/)
