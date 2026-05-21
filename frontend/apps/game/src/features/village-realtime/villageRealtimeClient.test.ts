import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { VillageEvent, VillageSnapshot } from './types'
import { VillageRealtimeClient } from './villageRealtimeClient'

type Handler = (frame: { body: string; headers?: Record<string, string> }) => void

interface FakeSubscription {
  unsubscribe: () => void
  destination: string
}

interface FakeClientConfig {
  brokerURL?: string
  connectHeaders?: Record<string, string>
  reconnectDelay?: number
  beforeConnect?: () => void | Promise<void>
  onConnect?: () => void
  onStompError?: (frame: { headers: Record<string, string> }) => void
  onWebSocketError?: (e: unknown) => void
  onDisconnect?: () => void
}

/**
 * @stomp/stompjs Client mock. 실 lib 의 라이프사이클을 흉내내 client.activate() 호출 후
 * `triggerConnect()` 를 부르면 beforeConnect → onConnect 콜백이 발화되는 식.
 * S14P31E103-782 부터 beforeConnect 단계에서 token fetcher 가 connectHeaders 를 결정한다.
 */
class FakeStompClient {
  config: FakeClientConfig
  connectHeaders: Record<string, string> = {}
  connected = false
  activated = false
  subscriptions: FakeSubscription[] = []
  subscriptionHandlers = new Map<string, Handler>()
  published: { destination: string; body: string }[] = []

  constructor(config: FakeClientConfig) {
    this.config = config
  }

  activate() {
    this.activated = true
  }

  async deactivate() {
    this.activated = false
    this.connected = false
    this.config.onDisconnect?.()
  }

  subscribe(destination: string, handler: Handler): FakeSubscription {
    this.subscriptionHandlers.set(destination, handler)
    const sub: FakeSubscription = {
      destination,
      unsubscribe: () => {
        this.subscriptions = this.subscriptions.filter(s => s !== sub)
        this.subscriptionHandlers.delete(destination)
      },
    }
    this.subscriptions.push(sub)
    return sub
  }

  publish(frame: { destination: string; body: string }) {
    this.published.push(frame)
  }

  /** beforeConnect → onConnect. 실 lib 의 CONNECT 시점 시퀀스를 재현. */
  async triggerConnect() {
    await this.config.beforeConnect?.()
    if (!this.activated) return // beforeConnect 에서 deactivate 했으면 onConnect 안 침
    this.connected = true
    this.config.onConnect?.()
  }

  deliverTo(destination: string, body: unknown) {
    const handler = this.subscriptionHandlers.get(destination)
    if (!handler) throw new Error(`no subscription for ${destination}`)
    handler({ body: typeof body === 'string' ? body : JSON.stringify(body) })
  }

  triggerStompError(message: string) {
    this.config.onStompError?.({ headers: { message } })
  }
}

let fakeClient: FakeStompClient | undefined

vi.mock('@stomp/stompjs', () => ({
  Client: vi.fn().mockImplementation((config: FakeClientConfig) => {
    fakeClient = new FakeStompClient(config)
    return fakeClient
  }),
}))

beforeEach(() => {
  fakeClient = undefined
})

afterEach(() => {
  vi.clearAllMocks()
})

function createClient(getAccessToken: () => Promise<string | null> = async () => 'jwt-here') {
  const events: VillageEvent[] = []
  const snapshots: VillageSnapshot[] = []
  const errors: Error[] = []
  let ready = false
  let disconnected = false

  const client = new VillageRealtimeClient({
    roomId: 'village.default',
    url: 'ws://test/api/v1/ws/village',
    getAccessToken,
    onEvent: e => events.push(e),
    onSnapshot: s => snapshots.push(s),
    onReady: () => {
      ready = true
    },
    onDisconnect: () => {
      disconnected = true
    },
    onError: e => errors.push(e),
  })
  return {
    client,
    fake: () => {
      if (!fakeClient) throw new Error('fake client not instantiated')
      return fakeClient
    },
    events,
    snapshots,
    errors,
    isReady: () => ready,
    isDisconnected: () => disconnected,
  }
}

describe('VillageRealtimeClient', () => {
  it('configures broker URL and auto-reconnect on construction', () => {
    const { fake } = createClient()

    expect(fake().config.brokerURL).toBe('ws://test/api/v1/ws/village')
    // S14P31E103-782: 자동 재접속 활성화 — 0 이 아니라야 한다.
    expect(fake().config.reconnectDelay).toBeGreaterThan(0)
  })

  it('beforeConnect resolves access token into Bearer header for each CONNECT', async () => {
    const { client, fake } = createClient()

    client.connect()
    await fake().triggerConnect()

    // 실 lib 처럼 client.connectHeaders 가 beforeConnect 단계에서 갱신된다 — config 스냅샷이 아님.
    // Room 헤더로 BE 에 룸 ID 전달 (S14P31E103-793).
    expect(fake().connectHeaders).toEqual({
      Authorization: 'Bearer jwt-here',
      Room: 'village.default',
    })
  })

  it('deactivates client + fires onError when token fetcher returns null', async () => {
    const tokens: (string | null)[] = [null]
    const { client, fake, errors } = createClient(async () => tokens.shift() ?? null)

    client.connect()
    await fake().triggerConnect()

    // beforeConnect 가 null 받으면 client.deactivate() 호출 → activated false + onConnect 미발화.
    expect(fake().activated).toBe(false)
    expect(fake().connected).toBe(false)
    expect(errors.map(e => e.message)).toContain(
      'No access token available for village WS connect.',
    )
  })

  it('connect activates the underlying client', () => {
    const { client, fake } = createClient()

    client.connect()

    expect(fake().activated).toBe(true)
  })

  it('on CONNECT, subscribes to snapshot queue and topic, then publishes ready and fires onReady', async () => {
    const { client, fake, isReady } = createClient()

    client.connect()
    await fake().triggerConnect()

    expect(fake().subscriptionHandlers.has('/user/queue/village.snapshot')).toBe(true)
    expect(fake().subscriptionHandlers.has('/topic/village.default')).toBe(true)
    expect(fake().published).toContainEqual({ destination: '/app/village.default/ready', body: '' })
    expect(isReady()).toBe(true)
  })

  it('forwards snapshot frame to onSnapshot', async () => {
    const { client, fake, snapshots } = createClient()
    client.connect()
    await fake().triggerConnect()

    fake().deliverTo('/user/queue/village.snapshot', {
      members: [{ userId: 1, nickname: 'a', textureKey: 'character', x: 0.5, y: 0.3, dir: 'down' }],
    })

    expect(snapshots).toHaveLength(1)
    expect(snapshots[0].members[0].userId).toBe(1)
  })

  it('forwards topic frames (join/move/leave) to onEvent', async () => {
    const { client, fake, events } = createClient()
    client.connect()
    await fake().triggerConnect()

    fake().deliverTo('/topic/village.default', {
      type: 'move',
      userId: 7,
      x: 0.1,
      y: 0.2,
      dir: 'left',
      moving: true,
    })

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ type: 'move', userId: 7, dir: 'left', moving: true })
  })

  it('publishPosition serializes packet to JSON body', async () => {
    const { client, fake } = createClient()
    client.connect()
    await fake().triggerConnect()

    client.publishPosition({
      x: 0.42,
      y: 0.78,
      dir: 'left',
      moving: true,
      textureKey: 'character-outfit-man1',
    })

    expect(fake().published).toContainEqual({
      destination: '/app/village.default/position',
      body: JSON.stringify({
        x: 0.42,
        y: 0.78,
        dir: 'left',
        moving: true,
        textureKey: 'character-outfit-man1',
      }),
    })
  })

  it('publishEmote serializes packet and sends to /app/village/emote, returns true', async () => {
    const { client, fake } = createClient()
    client.connect()
    await fake().triggerConnect()

    const sent = client.publishEmote({ emoji: '😄' })

    expect(sent).toBe(true)
    expect(fake().published).toContainEqual({
      destination: '/app/village.default/emote',
      body: JSON.stringify({ emoji: '😄' }),
    })
  })

  it('publishEmote returns false before connection completes', () => {
    const { client, fake } = createClient()

    const sent = client.publishEmote({ emoji: '😄' })

    expect(sent).toBe(false)
    expect(fake().published).toEqual([])
  })

  it('publishPosition returns true on success and false before connection', async () => {
    const { client, fake } = createClient()

    // 미연결 — false 반환 + 송신 없음
    expect(
      client.publishPosition({
        x: 0.1,
        y: 0.1,
        dir: 'down',
        moving: false,
        textureKey: 'character',
      }),
    ).toBe(false)
    expect(fake().published).toEqual([])

    // 연결 후 — true 반환 + 송신
    client.connect()
    await fake().triggerConnect()
    expect(
      client.publishPosition({
        x: 0.2,
        y: 0.3,
        dir: 'up',
        moving: true,
        textureKey: 'character',
      }),
    ).toBe(true)
    expect(fake().published).toContainEqual({
      destination: '/app/village.default/position',
      body: JSON.stringify({ x: 0.2, y: 0.3, dir: 'up', moving: true, textureKey: 'character' }),
    })
  })

  it('disconnect unsubscribes both destinations and deactivates the client', async () => {
    const { client, fake, isDisconnected } = createClient()
    client.connect()
    await fake().triggerConnect()

    await client.disconnect()

    expect(fake().subscriptionHandlers.size).toBe(0)
    expect(fake().activated).toBe(false)
    expect(isDisconnected()).toBe(true)
  })

  it('translates STOMP ERROR frame message into onError', () => {
    const { client, fake, errors } = createClient()
    client.connect()

    fake().triggerStompError('village room full (capacity=30)')

    expect(errors).toHaveLength(1)
    expect(errors[0].message).toBe('village room full (capacity=30)')
  })
})
