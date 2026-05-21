# 마을 광장 실시간 동기화 (Village Realtime)

이 문서는 **구현 계획(RFC)** 이다. 결정이 확정되면 ADR 스타일로 갱신한다. 현 상태: **초안, 팀 합의 대기**.

## 1. 한 줄 요약

마을 씬에 동시 접속한 다른 환자의 아바타를 실시간으로 보여준다. **릴레이 모델**, 룸당 동접 **30명 캡**, 마을 1개에서 시작.

## 2. 스코프

**포함 (MVP)**:
- 마을 씬에서 다른 플레이어 아바타 표시·이동 동기화
- 입장 / 이탈 / 재접속 처리
- 다른 플레이어 닉네임 표시
- 다른 플레이어 캐릭터 외형 (태권도 띠 색 등) 반영

**제외 (포스트 MVP)**:
- 상호작용 (채팅, 이모티콘, 인사 모션)
- 테마 씬 (체조 / 태권도장 / 색칠 등) 멀티플레이
- 같이 미니게임 — 별도 권위 서버 룸에서 다룬다

## 3. 아키텍처 결정

### 3.1 릴레이 모델 (서버 권위 X)

서버는 위치 패킷을 **검증·판정하지 않고** 같은 룸에 단순 브로드캐스트한다.

- 근거: 협동형 광장이고 보상·점수 시스템과 무관. 치팅 위험은 사실상 없음.
- 대결형 미니게임은 별도 룸에서 권위 모델로 분기 (포스트 MVP).

### 3.2 전송 계층: STOMP over WebSocket (신규 도입)

BE 에 WS/STOMP 인프라가 아직 없다. 다음 두 옵션 중 STOMP 선택:

| 옵션 | 장점 | 단점 |
|---|---|---|
| **STOMP** | 표준 Spring 모듈, 토픽/구독 모델 자연스러움, 비용 0 | BE에 WS 스택 신규 도입 |
| LiveKit data channel | 이미 통합돼 있음, presence 자동 | "30명 위치 동기화"는 미디어 인프라엔 과한 비용. 룸 개념을 보호자↔환자 1:1 모델과 분리 설계해야 함. |

**결정 근거**: STOMP 가 더 작은 추가 노력. LiveKit 은 미디어용으로 점유, 게임 상태 동기화엔 분리가 자연스럽다.

라이브러리:
- BE: `org.springframework.boot:spring-boot-starter-websocket` 추가
- FE: `@stomp/stompjs` 추가 (현재 미설치)

### 3.3 룸 (Room) 분리

- MVP: 단일 룸 `village.default`
- 동접 30명 캡, 초과 시 connect 거부
- 향후: `village.{shardId}` 로 다중 룸 확장 (코드 구조는 처음부터 shardId 파라미터화)

### 3.4 상태 저장: in-memory (MVP)

- MVP: `ConcurrentHashMap<String roomId, ConcurrentHashMap<String userId, PlayerState>>` — 메모리만
- Redis 도입 보류 (현재 프로젝트 미사용). 단일 인스턴스 운영 전제.
- 영속화 X — 서버 재시작 시 깨끗하게 비움. 위치 정보는 영속할 가치 없음.
- 확장 시점: 멀티 인스턴스 운영이 결정되면 Redis hash + pub/sub 추가. 현 구조에서 `PresenceStore` 인터페이스만 분리해두면 교체 한 줄.

### 3.5 인증

- WS connect 단계에서 JWT 검증 (`HandshakeInterceptor`). 기존 `JwtAuthenticationFilter` 와 동일한 토큰 사용.
- `Principal.getName()` 에 userId 주입. 클라이언트가 보낸 userId 는 신뢰 X.

## 4. 프로토콜

### 4.1 STOMP 엔드포인트 / 토픽

| 방향 | 경로 | 설명 |
|---|---|---|
| Connect | `/ws/village` | WS 엔드포인트 (JWT 핸드셰이크) |
| 구독 | `/topic/village.default` | 룸 내 모든 이벤트 수신 |
| 발행 | `/app/village/position` | 자기 위치 보고 |
| 발행 | `/app/village/leave` | 명시적 이탈 (옵션) |
| 1회 응답 | `/user/queue/village.snapshot` | 입장 시 현재 룸 스냅샷 (신규 클라에만) |

### 4.2 메시지 스키마

**클라 → 서버: `PositionPacket`**

```json
{
  "x": 0.512,
  "y": 0.387,
  "dir": "down",
  "moving": true
}
```

좌표는 ratio (0~1). 절대 픽셀 X (해상도 독립).

**서버 → 클라 (브로드캐스트): `VillageEvent` (3종)**

```json
// join
{ "type": "join", "userId": "...", "nickname": "꼬마곰", "textureKey": "character-yellow",
  "x": 0.5, "y": 0.3, "dir": "down" }

// move
{ "type": "move", "userId": "...", "x": 0.51, "y": 0.31, "dir": "down", "moving": true }

// leave
{ "type": "leave", "userId": "..." }
```

**서버 → 클라 (1회 스냅샷): `VillageSnapshot`**

```json
{
  "members": [
    { "userId": "u1", "nickname": "...", "textureKey": "...", "x": 0.5, "y": 0.3, "dir": "down" },
    ...
  ]
}
```

### 4.3 빈도 제어

- 클라 → 서버: **최대 5Hz** (200ms). 정지 상태(키/타깃 없음)면 즉시 0Hz, 마지막 위치만 유지.
- 휴리스틱: 마지막 publish 대비 위치 변화 < 0.001 (ratio) 이면 스킵.
- 서버 → 클라: 받은 그대로 즉시 릴레이 (배칭은 미래 최적화).

## 5. BE 구현

### 5.1 신규 패키지: `com.comong.backend.domain.village.realtime`

```
domain/village/realtime/
├── config/
│   ├── VillageWebSocketConfig.java     # @EnableWebSocketMessageBroker
│   └── VillageRealtimeProperties.java  # @ConfigurationProperties
├── controller/
│   └── VillageRelayController.java     # @MessageMapping
├── service/
│   ├── VillagePresenceService.java     # 멤버 추가/이동/제거, 스냅샷
│   └── VillageBroadcastService.java    # SimpMessagingTemplate wrapper
├── handler/
│   └── VillageHandshakeInterceptor.java # JWT 검증, 룸 캡 체크
├── dto/
│   ├── PositionPacket.java
│   ├── VillageEvent.java               # sealed (Join/Move/Leave)
│   └── VillageSnapshot.java
└── exception/
    ├── VillageRoomFullException.java
    └── ...
```

### 5.2 설정 (yaml)

```yaml
app:
  realtime:
    village:
      enabled: false                # 시연 안정성 폴백용. 운영 활성화는 명시적으로 true.
      tick-rate-hz: 5
      room-capacity: 30
      idle-disconnect-seconds: 60   # ping 무응답 시 강제 종료
```

- 외부화 기준: **동적 변경 필요 없음**. yaml 고정으로 충분.
- 운영 중 조정이 필요해지면 그때 환경변수 분리.

### 5.3 WebSocket 인증

- `HandshakeInterceptor` 가 `Sec-WebSocket-Protocol` 또는 query param 으로 JWT 받음
- `JwtAuthenticationFilter` 와 동일한 `JwtTokenProvider` 재사용
- 인증 실패 시 핸드셰이크 거부 (401)

### 5.4 룸 캡 / 좀비 정리

- connect 단계에서 현재 멤버 수 ≥ 30 이면 거부
- WS disconnect 이벤트 → 즉시 leave 브로드캐스트
- 백업: `idle-disconnect-seconds` 내 어떤 메시지도 없으면 강제 종료 (`@Scheduled` 5초 주기 스캔)

### 5.5 에러 코드

| 코드 | 상황 |
|---|---|
| `V-001` | 룸 정원 초과 |
| `V-002` | 인증 실패 (핸드셰이크) |

(BE 컨벤션에 따라 접두사 V 사용 — `backend/docs/conventions.md` 의 에러 prefix 정책 참고)

## 6. FE 구현

### 6.1 신규 모듈: `apps/game/src/features/village-realtime/`

```
features/village-realtime/
├── villageRealtimeClient.ts    # @stomp/stompjs wrapper
├── RemotePlayersGroup.ts       # Phaser 씬에 부착되는 매니저
├── types.ts                    # 패킷 타입 (BE와 동기 필요)
└── index.ts
```

### 6.2 VillageScene 통합 (최소 변경)

`VillageScene.create()` 에 3~4줄 추가, `update()` 에 1줄, `SHUTDOWN` 에 1줄:

```typescript
// create()
this.remotePlayers = new RemotePlayersGroup(this, {
  roomKey: 'village.default',
  localUserId: useAuthStore.getState().userId,
  localTextureKey: PLAYER_TEXTURE_KEY,
})
this.remotePlayers.connect()

// update()
this.remotePlayers.publishLocal(this.player, this.lastDirection, movement.moving)

// SHUTDOWN hook
this.remotePlayers.destroy()
```

VillageScene 본체에 들어가는 변경은 위 5~6줄. 그 외 로직은 모듈 내부에 격리.

### 6.3 RemotePlayersGroup 책임

- STOMP connect / subscribe / publish
- `Map<userId, PlayerSprite>` 로 원격 플레이어 관리
- `join` → `createPlayer()` 호출 + 닉네임 텍스트 추가
- `move` → 진행 중 tween 취소 + 새 tween 200ms duration. moving 이면 walk anim 재생, false 면 stop.
- `leave` → sprite + 닉네임 destroy
- `snapshot` → 일괄 join 처리
- 자기 위치 publish: 마지막 publish 대비 변화 임계값 이하면 스킵 + 정지 상태에선 1회만

### 6.4 보간 (Interpolation)

- 단순 tween 만 사용. 예측 (prediction) X.
- 패킷 간 평균 간격 200ms 기준 tween duration 도 200ms.
- 패킷 손실 / 지연 시 다음 패킷 도착할 때까지 마지막 위치에 머묾.
- "텔레포트 후 부드러운 이동" 보다 "약간 끊겨도 정확한 위치" 우선 — 소아 사용자에겐 환각 없는 게 중요.

### 6.5 닉네임 표시

- 각 원격 플레이어 sprite 위에 Phaser.Text (16px, 검정 외곽선)
- sprite 와 함께 이동 (tween 시 같이)
- 자기 자신은 표시 X (시야 가림)

## 7. 데이터 흐름

### 7.1 입장 시퀀스

```
Client                     BE                       Other Clients
  │                         │                            │
  ├──CONNECT (JWT)─────────►│                            │
  │                         │ Handshake auth OK          │
  ◄──CONNECTED──────────────┤                            │
  │                         │                            │
  ├──SUBSCRIBE              │                            │
  │  /topic/village.default►│                            │
  │  /user/queue/...        │                            │
  │                         │ presence.add(userId)       │
  ◄──SNAPSHOT───────────────┤ (현재 멤버 전원)            │
  │                         ├──BROADCAST join──────────►│
  │                         │                            │
```

### 7.2 이동 시퀀스

```
Client A                   BE                       Client B
  ├──/app/village/position─►│                            │
  │  {x,y,dir,moving}       │ presence.update            │
  │                         ├──BROADCAST move──────────►│
  │                         │                            │ tween sprite
```

### 7.3 이탈 시퀀스

**A. 정상 (씬 전환 / 로그아웃)**:
```
Client                     BE                       Others
  ├──/app/village/leave────►│                            │
  ├──DISCONNECT             │ presence.remove            │
  │                         ├──BROADCAST leave─────────►│
```

**B. 비정상 (탭 닫기 / 네트워크 끊김)**:
```
Client X (gone)            BE                       Others
                            │ SessionDisconnectEvent     │
                            │ presence.remove            │
                            ├──BROADCAST leave─────────►│
```

**C. 백업 (Disconnect 이벤트 유실)**:
- `@Scheduled` 5초 주기로 `idle-disconnect-seconds` 초과 멤버 강제 정리

## 8. Jira 분할

| # | 제목 | 영역 | 추정 |
|---|---|---|---|
| 1 | [Village] BE/feat: WebSocket/STOMP 인프라 + JWT 핸드셰이크 | BE | 1.5일 |
| 2 | [Village] BE/feat: VillagePresenceService + 룸 캡 + 좀비 정리 | BE | 1.5일 |
| 3 | [Village] BE/feat: VillageRelayController + 브로드캐스트 + 스냅샷 | BE | 1일 |
| 4 | [Village] FE/feat: @stomp/stompjs 통합 + villageRealtimeClient | FE | 1.5일 |
| 5 | [Village] FE/feat: RemotePlayersGroup + VillageScene 통합 | FE | 2일 |
| 6 | [Village] FE/feat: 닉네임 표시 + 보간 튜닝 | FE | 0.5일 |
| 7 | [Village] BE+FE/test: 다중 클라 통합 검증 + 안정화 | 통합 | 2일 |

**총 10일 (≈ 2주)**

브랜치 네이밍: `feat/S14P31E103-<N>-village-realtime-<short>` (메모리 브랜치 규칙 준수).

## 9. 브랜치 / PR 전략

- 1~3 (BE) 는 순차 브랜치, 각각 develop 머지
- 4 는 BE 1~3 머지 후 시작 (가능하면 BE 1 머지만 되어도 mock 으로 진행 가능)
- 5, 6 는 4 머지 후
- 7 은 별도 통합 브랜치에서 양쪽 머지 후 검증

각 PR 에 메모리의 [MR template](C:/Users/SSAFY/.claude/projects/C--projects-S14P31E103/memory/reference_mr_template.md) 그대로 적용.

## 10. 마일스톤

| 시점 | 도달 상태 |
|---|---|
| Day 4 (BE 완료) | 로컬에서 wscat 으로 위치 패킷 보내면 다른 wscat 세션에 브로드캐스트 확인 |
| Day 6 (FE 단위) | 단일 브라우저 탭 2개로 두 캐릭터가 서로의 움직임 확인 |
| Day 8 (통합 1차) | 노트북 + 폰 동시 접속, 끊김 시 좀비 없음 확인 |
| Day 10 (폴리싱) | 발표 시연 시나리오 통과 |

## 11. 백오프 플랜

진행 중 막히면 단계별 후퇴 (모듈 내 상수만 바꾸면 되도록 설계):

| Tier | 동작 | 후퇴 조건 |
|---|---|---|
| **T1 (목표)** | 5Hz 실시간 + 보간 | — |
| T2 | 1Hz 정적 표시, 즉시 텔레포트 | 보간 디버깅이 3일 이상 늘어지면 |
| T3 | 5초 주기 스냅샷만, 위치 새로고침 | T2 도 불안정하면 |
| 폴백 | 멀티플레이 비활성 (현재 동작) | 통합 데드라인 직전까지 안정화 안 되면 |

`RemotePlayersGroup` 의 `publishIntervalMs`, `tweenDurationMs` 만 yaml/상수로 빼두면 환경변수 교체로 Tier 이동 가능.

## 12. 테스트 전략

### 12.1 단위 / 통합 (BE)
- `VillagePresenceService` 동시성 테스트: 30 스레드 join → 30 멤버 확인
- 캡 초과 거부 테스트
- `@SpringBootTest` + STOMP test client (Spring 제공) 로 핸드셰이크 + 메시지 라운드트립

### 12.2 멀티 클라 수동 검증
- 노트북 (Chrome) + 폰 (Safari) + 태블릿 동시 접속
- 검증 체크리스트:
  - [ ] 보간이 끊김 없는가
  - [ ] 30명 동접 시 Phaser FPS 유지되는가 (목표 50 이상)
  - [ ] 새로 들어온 사람이 기존 사람을 즉시 보는가
  - [ ] 네트워크 끊김 후 재접속 시 좀비 아바타 없는가
  - [ ] VillageScene → ThemeScene → VillageScene 시 cleanup 되는가
  - [ ] 자기 자신은 원격 sprite 로 안 보이는가
  - [ ] 캐릭터 외형 (벨트 색) 이 정확히 전달되는가

### 12.3 부하 (Optional)
- Gatling 또는 K6 의 STOMP 시나리오로 30 가상 클라 + 5Hz publish 부하 테스트

## 13. 환경변수 / 비밀

| 항목 | 위치 | 사유 |
|---|---|---|
| tick-rate-hz, room-capacity, idle-disconnect-seconds | `application.yml` | 동적 변경 필요성 낮음 — 메모리 환경변수 분리 기준에 따라 yaml 고정 |
| STOMP 엔드포인트 prefix | yaml | 운영 변경 없음 |
| JWT secret | 기존 환경변수 재사용 | — |

신규 비밀 / 외부 의존성 **없음**.

## 14. 결정된 사항

| # | 항목 | 결정 | 근거 |
|---|---|---|---|
| 1 | WS 인증 토큰 전달 | **STOMP CONNECT 프레임 헤더에 JWT** | 표준 Spring 패턴. query param 은 로그에 토큰 잔존, Sec-WebSocket-Protocol 은 프로토콜 헤더 오용. CONNECT 헤더 검증은 `ChannelInterceptor` 한 곳에 집중. |
| 2 | 같은 userId 재접속 정책 | **latest wins (기존 세션 강제 종료)** | 사용자 입장에서 "막힘" 경험 방지. 동접 카운트도 깔끔. |
| 3 | 닉네임 출처 | **`PatientProfile.nickname`** | 마을에서 움직이는 건 환자(아이). [guardian-patient ADR](./guardian-patient.md) 분리 원칙과 일관. |
| 4 | Feature flag | **`app.realtime.village.enabled` 추가, 기본 false** | 시연 안정성 + 백오프 플랜 폴백 수단. yaml 한 줄. |

## 15. 참고

- [VillageScene](../../frontend/apps/game/src/scenes/village/VillageScene.ts)
- [player.ts (createPlayer / animations)](../../frontend/apps/game/src/game/entities/player.ts)
- [LiveKit publisher (기존 실시간 인프라)](../../frontend/apps/game/src/features/realtime/useRealtimePublisher.ts)
- [BE 컨벤션](./conventions.md)
- [보호자/환자 구조 ADR](./guardian-patient.md)
