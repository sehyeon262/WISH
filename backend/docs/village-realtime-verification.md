# 마을 광장 멀티플레이 통합 검증 체크리스트 (S14P31E103-722)

전체 스택 (714 ~ 721) 머지 후 시연/배포 전에 사람이 직접 돌려보고 채울 항목.

## 자동화 커버 (CI 가 매번 검증)

- [x] 단일 클라 CONNECT 인증 (토큰 누락 / 위조 거부) — `VillageStompIntegrationTest`
- [x] PatientProfile 없는 사용자 입장 거부 — `VillageStompIntegrationTest`
- [x] disconnect → presence 즉시 제거 — `VillageStompIntegrationTest`
- [x] ready → snapshot 전송 + join broadcast — `VillageStompIntegrationTest`
- [x] position publish → move broadcast — `VillageStompIntegrationTest`
- [x] disconnect → leave broadcast — `VillageStompIntegrationTest`
- [x] 신규 입장자의 snapshot 에 기존 멤버 포함 — `VillageMultiClientIntegrationTest`
- [x] 룸 정원 초과 시 connect 거부 — `VillageMultiClientIntegrationTest`
- [x] 멤버 떠난 후 자리 회수 — `VillageMultiClientIntegrationTest`
- [x] presence latest-wins / cap / idle eviction 단위 — `VillagePresenceServiceTest`
- [x] FE STOMP 클라 라이프사이클 / 직렬화 — `villageRealtimeClient.test.ts`
- [x] FE RemotePlayersGroup 시나리오 (snapshot/join/move/leave/lazy/local 필터/destroy) — `RemotePlayersGroup.test.ts`

## 수동 검증

### 환경

- [ ] **노트북** Chrome
- [ ] **모바일** Safari (가능하면 다른 네트워크)
- [ ] **태블릿** Chrome
- [ ] 같은 환자 계정 ❌ — 서로 다른 계정으로 로그인할 것

### 운영 활성화

- [ ] `app.realtime.village.enabled=true` 환경 (기본 false 라 명시 override 필요)
- [ ] `app.realtime.village.room-capacity` 운영값 확인 (30 권장)

### 핵심 흐름

- [ ] 새 입장자가 기존 멤버를 즉시 본다 (snapshot 정상 도착)
- [ ] 기존 멤버가 신규 입장을 본다 (join broadcast 정상)
- [ ] 한쪽이 움직이면 다른 쪽에서 보간이 끊김 없이 매끄럽다
- [ ] 정지/이동 전환 시 walk anim 이 즉시 멈춘다
- [ ] 닉네임이 sprite 위에 따라붙어 같이 움직인다
- [ ] 자기 자신은 원격 sprite 로 보이지 않는다 (중복 캐릭터 X)

### 라이프사이클

- [ ] `VillageScene → ThemeScene → VillageScene` 전환 시 원격 멤버 cleanup + 재구독 OK
- [ ] 탭 닫기 → 다른 클라가 leave 이벤트 즉시 수신
- [ ] 네트워크 끊기 (Wi-Fi off) 후 다시 켜면 좀비 아바타 없음 (idle TTL 60s 내 자동 정리)
- [ ] 같은 환자로 두 탭 동시 로그인 → 새 탭이 활성, 기존 탭의 위치 publish 가 broadcast 되지 않음 (latest-wins)

### 한계 / 결함 시나리오

- [ ] 룸 정원 초과 시 connect 거부 후 토스트/메시지로 사용자에 안내 (필요 시 FE 메시지 보완)
- [ ] BE 재시작 시 모든 클라 disconnect → 재접속 시 새 룸으로 자연스럽게 복귀
- [ ] enabled=false 환경에서 마을 진입해도 일반 게임이 정상 동작 (멀티플레이만 비활성)

### 성능 (선택)

- [ ] 동접 30명 시 Phaser FPS 50 이상 유지 (메뉴 → FPS 표시 또는 dev tool 확인)
- [ ] BE 메모리 사용량 안정 (5분 이상 운영 시 leak 없음)
- [ ] (선택) Gatling/K6 로 30 가상 클라 + 5Hz publish 부하 테스트 → 응답 지연 100ms 이하

## 발견 결함

| # | 영역 | 증상 | 후속 처리 (이슈/PR) |
|---|---|---|---|
| | | | |

## 검증 일자 / 검증자

- 일자: ____ / 검증자: ____
- 발표 시연 통과 여부: ☐ 통과 ☐ 부분 통과 (사유: ____) ☐ 미통과

## 참고

- 상세 설계: [`village-realtime.md`](./village-realtime.md)
- 자동 테스트:
  - BE: `backend/src/test/.../village/realtime/`
  - FE: `frontend/apps/game/src/features/village-realtime/*.test.ts`
- 부모 에픽: [S14P31E103-716 멀티플레이](https://ssafy.atlassian.net/browse/S14P31E103-716)
