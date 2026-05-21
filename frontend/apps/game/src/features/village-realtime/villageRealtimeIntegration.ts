import Phaser from 'phaser'
import { ensureFreshAccessToken } from '@wish/api-client'

import { useAuthStore } from '@/features/auth/store'
import { PLAYER_TEXTURE_KEY, type PlayerDirection, type PlayerSprite } from '@/game/entities/player'

import { extractUserIdFromToken } from './jwtUserId'
import { RemotePlayersGroup } from './RemotePlayersGroup'
import { VillageRealtimeClient } from './villageRealtimeClient'

/** publishPosition 최대 빈도. 200ms = 5Hz (계획서 4.3). */
const PUBLISH_INTERVAL_MS = 200
/** ratio 좌표 변화 임계값. 이 이하의 변화는 publish 스킵 (유휴 트래픽 절감). */
const POSITION_CHANGE_THRESHOLD = 0.001
/**
 * 정지 상태에서도 강제 publish 하는 간격 — BE idle-disconnect (기본 60s) 안 쪽으로 안전 마진. 사용자가 한 자리에 가만히 있어도
 * lastSeen 이 갱신되어 좀비 정리에 걸리지 않게 한다 (S14P31E103-767).
 *
 * <p>setInterval 로 발화 (S14P31E103-791): Phaser 가 백그라운드 탭에서 게임 루프를 일시정지해도 setInterval 은 계속 발화한다 —
 * 브라우저가 ≥1s 로 clamp 하지만 30s 간격 + BE 60s threshold 면 충분히 안전 마진. publishLocal 의 in-loop heartbeat 가 아니라
 * 게임 루프 무관한 wall-clock timer 가 필요한 이유.
 */
const HEARTBEAT_INTERVAL_MS = 30_000
/** publishEmote 최대 빈도 (클라). 서버측 2s throttle 의 절반 — UX 용. */
const EMOTE_INTERVAL_MS = 1_000

export interface VillageRealtimeIntegration {
  /** local player 의 현재 상태를 5Hz 로 throttling 해 BE 에 보낸다. update() 매 tick 에 안전하게 호출 가능. */
  publishLocal(player: PlayerSprite, dir: PlayerDirection, moving: boolean): void
  /**
   * 이모티콘 발신. 클라 throttle (1s) 통과하면 BE 에 보내고 true 반환 — 호출자가 로컬 sprite 위에 즉시 버블 렌더해 latency 가림.
   * throttle 차단 시 false. 화이트리스트 검증은 호출자가 미리.
   */
  publishEmote(emoji: string): boolean
  /** Phaser 씬 SHUTDOWN 시 호출. WS deactivate + 원격 sprite 정리. 멱등. */
  destroy(): void
}

interface AttachOptions {
  scene: Phaser.Scene
  worldWidth: number
  worldHeight: number
  /** 룸 ID — BE 의 STOMP destination / topic 구성 (예: {@code village.default}, {@code gymnastics.select}, S14P31E103-793). */
  roomId: string
  /** WS broker URL — 미지정 시 same-origin {@code /api/v1/ws/village}. */
  brokerUrl?: string
}

/**
 * VillageScene 에서 호출하는 통합 진입점. 토큰/userId 가 없으면 null 을 돌려준다 (멀티플레이 비활성). 반환된 통합은
 * 시작 시점에 이미 WS connect 가 호출된 상태.
 */
export function attachVillageRealtime(opts: AttachOptions): VillageRealtimeIntegration | null {
  const token = useAuthStore.getState().token
  if (!token) return null
  const localUserId = extractUserIdFromToken(token)
  if (localUserId === null) return null

  const remotePlayers = new RemotePlayersGroup({
    scene: opts.scene,
    localUserId,
    worldWidth: opts.worldWidth,
    worldHeight: opts.worldHeight,
  })

  const client = new VillageRealtimeClient({
    roomId: opts.roomId,
    url: opts.brokerUrl,
    // 매 (재)접속마다 최신 토큰. refresh 인터셉터가 갱신한 토큰이 자동 반영되도록 store 보다 ensureFreshAccessToken
    // 우선 — store 는 메모리 캐시이고 만료 임박 시 자동 갱신은 ensureFresh 가 담당 (S14P31E103-782).
    getAccessToken: () => ensureFreshAccessToken(),
    onEvent: event => remotePlayers.applyEvent(event),
    onSnapshot: snapshot => remotePlayers.applySnapshot(snapshot),
    onError: error => {
      // WS / STOMP 에러는 콘솔에 기록만 — Phaser 씬 흐름은 막지 않는다. enabled=false 시연 폴백,
      // 룸 정원 초과 등 사용자 가시화 가치가 낮은 케이스가 대부분.
      console.warn('Village realtime error', error.message)
    },
  })
  client.connect()

  // publishLocal throttling 상태
  let lastPublishMs = 0
  /** Wall-clock 기준 마지막 publish 시각. Phaser 가 백그라운드에서 멈춰도 setInterval 이 이 값을 보고 heartbeat 결정. */
  let lastPublishWallMs = 0
  let lastX = Number.NaN
  let lastY = Number.NaN
  let lastDir: PlayerDirection | null = null
  let lastMoving = false
  let lastTextureKey: string | null = null
  // publishEmote throttling
  let lastEmoteMs = 0

  // S14P31E103-791: Phaser 가 백그라운드 탭에서 update() 를 멈춰도 setInterval 은 계속 발화 (브라우저가 ≥1s clamp). 마지막 publish
  // 이후 HEARTBEAT_INTERVAL_MS 가 지났으면 마지막 위치/방향 그대로 강제 publish — BE idle eviction (60s) 차단.
  const heartbeatTimer = setInterval(() => {
    if (Number.isNaN(lastX)) return // 첫 publish 는 publishLocal 이 담당
    if (Date.now() - lastPublishWallMs < HEARTBEAT_INTERVAL_MS) return
    if (
      !client.publishPosition({
        x: lastX,
        y: lastY,
        dir: lastDir ?? 'down',
        moving: lastMoving,
        textureKey: lastTextureKey ?? PLAYER_TEXTURE_KEY,
      })
    ) {
      return
    }
    lastPublishWallMs = Date.now()
  }, HEARTBEAT_INTERVAL_MS)

  return {
    publishLocal(player, dir, moving) {
      const now = opts.scene.time.now
      if (now - lastPublishMs < PUBLISH_INTERVAL_MS) return

      const xRatio = player.x / opts.worldWidth
      const yRatio = player.y / opts.worldHeight
      const positionChanged =
        Math.abs(xRatio - lastX) > POSITION_CHANGE_THRESHOLD ||
        Math.abs(yRatio - lastY) > POSITION_CHANGE_THRESHOLD
      const stateChanged = moving !== lastMoving || dir !== lastDir
      const textureKey = player.texture.key
      const textureChanged = textureKey !== lastTextureKey

      // heartbeat 는 setInterval 이 wall-clock 으로 별도 처리 (S14P31E103-791) — 게임 루프 안에서 중복 발화 불필요.
      if (!positionChanged && !stateChanged && !textureChanged) return

      // 연결 전이면 publishPosition 이 false 반환 → throttle state 유지해야 onReady 후 첫 publish 가
      // skip 되지 않는다 (S14P31E103-763).
      if (!client.publishPosition({ x: xRatio, y: yRatio, dir, moving, textureKey })) return
      lastPublishMs = now
      lastPublishWallMs = Date.now()
      lastX = xRatio
      lastY = yRatio
      lastDir = dir
      lastMoving = moving
      lastTextureKey = textureKey
    },

    publishEmote(emoji) {
      const now = opts.scene.time.now
      if (now - lastEmoteMs < EMOTE_INTERVAL_MS) return false
      // client.publishEmote 가 미연결이면 false — 로컬 버블 안 띄우게 그대로 전파 (S14P31E103-763).
      if (!client.publishEmote({ emoji })) return false
      lastEmoteMs = now
      return true
    },

    destroy() {
      clearInterval(heartbeatTimer)
      void client.disconnect()
      remotePlayers.destroy()
    },
  }
}
