import { Client, type IFrame, type StompSubscription } from '@stomp/stompjs'

import type { EmotePacket, PositionPacket, VillageEvent, VillageSnapshot } from './types'

// BE 라우팅 규약 (S14P31E103-714 / 718 / 728 / 793). 변경 시 BE 와 함께 손본다.
// roomId 별로 destination 파라미터화 — 같은 클라이언트 코드를 마을 / 테마 select 씬이 공용 사용.
const QUEUE_SNAPSHOT = '/user/queue/village.snapshot'
const TOPIC_PREFIX = '/topic/'
const APP_PREFIX = '/app/'

/** 재접속 대기 시간 (ms). 너무 짧으면 BE 가 받는 부담 — 5s 면 사용자 체감/서버 부담 균형 (S14P31E103-782). */
const RECONNECT_DELAY_MS = 5_000

export interface VillageRealtimeClientOptions {
  /** 룸 ID (예: {@code village.default}, {@code gymnastics.select}). BE 의 STOMP destination / topic 구성 (S14P31E103-793). */
  roomId: string
  /** WS broker URL — 미지정 시 동일 origin 의 {@code /api/v1/ws/village} 사용. */
  url?: string
  /**
   * 매 CONNECT 시 호출되는 token fetcher. 만료 임박이면 refresh 후 새 토큰을 돌려주고, 인증 불가면 null. null 일 땐 클라이언트를
   * deactivate 해서 무한 재접속 루프를 끊는다 (S14P31E103-782).
   */
  getAccessToken: () => Promise<string | null>
  /** join/move/leave 이벤트 콜백. */
  onEvent: (event: VillageEvent) => void
  /** ready 직후 1회 도착하는 룸 스냅샷 콜백. */
  onSnapshot: (snapshot: VillageSnapshot) => void
  /** CONNECT + 구독 + ready 발행이 끝난 직후. 재접속할 때마다 호출된다. */
  onReady?: () => void
  /** WebSocket 연결이 종료된 후 (정상/비정상 공통). 재접속이 켜져 있으면 곧 다음 onConnect 가 따라온다. */
  onDisconnect?: () => void
  /** STOMP ERROR 프레임 또는 WS 에러. */
  onError?: (error: Error) => void
}

/**
 * 마을 광장 + 테마 select 씬 STOMP 클라이언트 wrapper.
 *
 * <p>흐름: connect() → CONNECT (Room 헤더에 roomId) → 구독 ({@code /topic/{roomId}} + snapshot 큐) → ready 발행 →
 * 서버로부터 snapshot + 자기 join 수신.
 *
 * <p>S14P31E103-782: 자동 재접속 (5s) + 매 연결 시 fresh token. S14P31E103-793: roomId 옵션으로 destination 파라미터화.
 */
export class VillageRealtimeClient {
  private readonly client: Client
  private readonly roomId: string
  private readonly topic: string
  private readonly appReady: string
  private readonly appPosition: string
  private readonly appEmote: string
  private topicSubscription: StompSubscription | null = null
  private snapshotSubscription: StompSubscription | null = null

  constructor(private readonly options: VillageRealtimeClientOptions) {
    this.roomId = options.roomId
    this.topic = `${TOPIC_PREFIX}${this.roomId}`
    this.appReady = `${APP_PREFIX}${this.roomId}/ready`
    this.appPosition = `${APP_PREFIX}${this.roomId}/position`
    this.appEmote = `${APP_PREFIX}${this.roomId}/emote`

    this.client = new Client({
      brokerURL: options.url ?? defaultBrokerUrl(),
      reconnectDelay: RECONNECT_DELAY_MS,
      beforeConnect: () => this.refreshConnectHeaders(),
      onConnect: () => this.handleConnect(),
      onStompError: frame => this.handleStompError(frame),
      onWebSocketError: e => this.options.onError?.(coerceError(e)),
      onDisconnect: () => this.options.onDisconnect?.(),
    })
  }

  connect(): void {
    this.client.activate()
  }

  /** WS 종료. 진행 중인 구독 cleanup + deactivate. 멱등. */
  async disconnect(): Promise<void> {
    this.topicSubscription?.unsubscribe()
    this.snapshotSubscription?.unsubscribe()
    this.topicSubscription = null
    this.snapshotSubscription = null
    await this.client.deactivate()
  }

  /**
   * 위치 발행. 실제 전송 여부를 boolean 으로 반환 — 호출자가 throttle/state 갱신을 송신 성공 시에만 적용할 수 있게
   * (S14P31E103-763).
   */
  publishPosition(packet: PositionPacket): boolean {
    if (!this.client.connected) return false
    this.client.publish({
      destination: this.appPosition,
      body: JSON.stringify(packet),
    })
    return true
  }

  /** 이모티콘 발신. 실제 전송 여부를 boolean 으로 반환. 서버측 throttle / 화이트리스트 검증은 BE 가 담당. */
  publishEmote(packet: EmotePacket): boolean {
    if (!this.client.connected) return false
    this.client.publish({
      destination: this.appEmote,
      body: JSON.stringify(packet),
    })
    return true
  }

  private async refreshConnectHeaders(): Promise<void> {
    const token = await this.options.getAccessToken()
    if (!token) {
      // 인증 복구 불가 — 재접속 폭주 방지 위해 클라이언트 자체를 정지. 사용자 재로그인 시 새 인스턴스가 생성된다.
      void this.client.deactivate()
      this.options.onError?.(new Error('No access token available for village WS connect.'))
      return
    }
    // Room 헤더로 BE 에 룸 ID 전달 (S14P31E103-793). VillagePresenceInterceptor 가 읽어 join 시 사용.
    this.client.connectHeaders = {
      Authorization: `Bearer ${token}`,
      Room: this.roomId,
    }
  }

  private handleConnect(): void {
    this.snapshotSubscription = this.client.subscribe(QUEUE_SNAPSHOT, frame => {
      this.options.onSnapshot(JSON.parse(frame.body) as VillageSnapshot)
    })
    this.topicSubscription = this.client.subscribe(this.topic, frame => {
      this.options.onEvent(JSON.parse(frame.body) as VillageEvent)
    })
    // 구독 SUBSCRIBE 프레임은 같은 inbound 채널에 직렬 처리되므로 곧바로 ready 를 보내도
    // 서버 처리 순서상 구독 등록이 먼저 끝난다. SimpleBroker 는 RECEIPT 가 없어 클라가 따로 동기화 불가능.
    this.client.publish({ destination: this.appReady, body: '' })
    this.options.onReady?.()
  }

  private handleStompError(frame: IFrame): void {
    const message = frame.headers['message'] ?? 'stomp error'
    this.options.onError?.(new Error(message))
  }
}

function defaultBrokerUrl(): string {
  // dev 환경에선 FE (Vite 3001) 와 BE (8080) 가 별도 origin 이므로 REST 호출에 쓰는 base URL 을 그대로 활용.
  // VITE_API_BASE_URL 예: "http://localhost:8080/api/v1" → "ws://localhost:8080/api/v1/ws/village".
  // 운영처럼 같은 origin 에서 리버스 프록시가 BE 를 마운트하는 경우엔 env 미설정 → window.location 폴백.
  const apiBase = import.meta.env.VITE_API_BASE_URL as string | undefined
  if (apiBase) {
    return apiBase.replace(/^http/, 'ws') + '/ws/village'
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/api/v1/ws/village`
}

function coerceError(e: unknown): Error {
  if (e instanceof Error) return e
  return new Error('websocket error')
}
