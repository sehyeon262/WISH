# WISH Frontend

소아암 환아를 위한 행동 기반 감정 회복 마을 플랫폼.

## 사전 준비

| 항목 | 버전                    |
| ---- | ----------------------- |
| Node | 24.12.0 (`.nvmrc` 기준) |
| pnpm | 10.33.0 이상            |

pnpm이 없다면:

```bash
npm install -g pnpm
```

## 설치 및 실행

```bash
cd frontend
pnpm install

# 개발 서버 (앱별 포트)
pnpm dev             # 모든 앱 동시 실행
pnpm --filter @wish/game dev        # 게임만 (http://localhost:3001)
pnpm --filter @wish/admin dev       # 관리자 (http://localhost:3002)
```

## 폴더 구조

```
frontend/
├── apps/
│   ├── game/           # 환아용 게임 (React + Phaser + MediaPipe)
│   └── admin/          # 관리자 앱 (React + Recharts)
├── packages/
│   ├── domain/         # 공통 타입, enum
│   ├── ui/             # 공통 컴포넌트
│   └── api-client/     # axios 래퍼, auth interceptor
├── tsconfig.base.json  # TS 공통 설정
├── eslint.config.js    # ESLint flat config
└── turbo.json          # 빌드 파이프라인
```

### 앱 내부 구조 (feature-based)

```
apps/<app>/src/
├── main.tsx
├── App.tsx
├── routes/             # 라우터 설정
├── pages/              # 라우트별 페이지
├── features/           # 도메인별 기능
│   └── auth/
│       ├── api/        # react-query 훅
│       ├── components/
│       └── hooks/
├── shared/             # 앱 내 공통
│   ├── components/     # Layout, ErrorBoundary 등
│   ├── hooks/
│   └── lib/            # query client, utils
└── stores/             # 전역 zustand 스토어
```

새 feature 추가 시 `features/<name>/` 안에 `api`, `components`, `hooks` 하위 폴더를 필요에 따라 생성.

## 기술 스택

| 영역      | 선택                            |
| --------- | ------------------------------- |
| 빌드      | Vite + TypeScript               |
| 서버 상태 | @tanstack/react-query           |
| UI 상태   | zustand                         |
| 폼        | react-hook-form + zod           |
| 테스트    | vitest + @testing-library/react |
| HTTP      | axios                           |

## 경로 alias

각 앱에서 `@/*`는 해당 앱의 `src/*`를 가리킨다.

```ts
import { Button } from '@/shared/components/Button'
// = apps/<app>/src/shared/components/Button
```

## 주요 명령어

```bash
pnpm lint        # 전체 ESLint
pnpm typecheck   # 전체 TS 타입 검사
pnpm test        # 전체 vitest 실행
pnpm build       # 전체 프로덕션 빌드
pnpm format      # Prettier로 전체 포맷
```

특정 앱/패키지만:

```bash
pnpm --filter @wish/game lint
pnpm --filter @wish/admin build
```

## Git 훅 (husky + lint-staged)

| 시점         | 동작                                                           |
| ------------ | -------------------------------------------------------------- |
| `git commit` | 스테이지된 `*.{ts,tsx}`에 eslint + prettier 자동 실행          |
| `git push`   | `lint → typecheck → test → build` 전체 검증, 실패 시 push 차단 |

### 팀 규칙

- **`git push --no-verify` 금지.** 불가피할 경우 팀 채널에 사유 공유.
- 새 팀원 또는 환경 변경 시 반드시 `pnpm install`부터. (husky 훅 등록)
- 커밋 메시지는 `[S14P31E103-XX] FE/<type>: <내용>` 형식.

## 브랜치 전략

- `main` — 직접 건드리지 않음.
- `develop` — 통합 브랜치. PR(MR)로만 머지.
- 개인 작업 — `feat/S14P31E103-XX-xxx`, `fix/...`, `refactor/...` 등으로 분기 후 develop으로 MR.

## 트러블슈팅

**Q. `pnpm install`은 했는데 훅이 안 돈다**
A. `git config core.hooksPath` 결과가 `frontend/.husky/_`인지 확인. 아니면 `frontend/`에서 `pnpm install` 재실행.

**Q. VS Code 터미널이 멈춘다**
A. `Ctrl + Shift + P` → "Reload Window". 또는 외부 Git Bash 사용.

**Q. 빌드 속도가 느리다**
A. `.turbo/` 캐시가 쌓이면 빨라진다. 첫 빌드는 원래 느림.
