import Phaser from 'phaser'

import {
  createPlayer,
  getPlayerOutfitTextureKey,
  getPlayerWalkAnimationKey,
  type PlayerDirection,
  type PlayerSprite,
} from '@/game/entities/player'
import { emitEmoteBubble } from '@/features/village-realtime/emoteBubble'
import {
  VILLAGE_PLAYER_NAME_TEXT_STYLE,
  VILLAGE_PLAYER_NAME_VERTICAL_GAP_PX,
} from '@/features/village-realtime/RemotePlayersGroup'
import { VILLAGE_BASE_EMOJIS } from '@/features/village-realtime/types'

const BOT_SPRITE_DEPTH = 5
const NAME_TEXT_DEPTH = 6
const EMOTE_DEPTH = 100
const OBSTACLE_FOOT_RADIUS_PX = 8
const BOT_ARRIVAL_DISTANCE_PX = 5
const BOT_IDLE_INTERVAL_MS = [400, 1_200] as const
const BOT_STUCK_RESET_MS = 550
const BOT_WALK_SPEED_PX_PER_SEC = 70
/**
 * 좌표 튜닝 중 path 노드/엣지 시각화. 마젠타 원 = 노드, 옅은 선 = 엣지. 옆에 id 라벨.
 * 좌표 확정되면 false 로 바꿔서 다음 빌드에 안 나오게.
 */
const DEBUG_DRAW_PATH_GRAPH = false

/**
 * 봇이 사용할 수 있는 부분만 추려낸 obstacle 인터페이스. VillageObstacleManager 와 결합도 낮춤 — 봇 feature 가 마을 모듈에
 * 직접 의존하지 않게.
 */
export interface ObstacleQuery {
  containsBlockedFoot(worldX: number, worldY: number, radius?: number): boolean
}

interface PathNode {
  id: string
  xRatio: number
  yRatio: number
}

/**
 * 봇별 전용 짧은 산책 루프/대기 지점. 봇끼리 노드 공유 안 함. 광장 장식물을 가로지르지 않도록 열린 타일 위주로 둔다.
 */
const PATH_NODES: readonly PathNode[] = [
  // 메시 — 분수 왼쪽 길을 따라 상하로 길게 왕복
  { id: 'mess-a', xRatio: 0.47, yRatio: 0.37 },
  { id: 'mess-b', xRatio: 0.47, yRatio: 0.47 },
  { id: 'mess-c', xRatio: 0.47, yRatio: 0.575 },
  // 원빈 — 분수 위쪽
  { id: 'won-a', xRatio: 0.555, yRatio: 0.335 },
  { id: 'won-b', xRatio: 0.565, yRatio: 0.345 },
  { id: 'won-c', xRatio: 0.56, yRatio: 0.365 },
  // 오목뜨실분 — 오목판 오른쪽 빈 타일
  { id: 'omok-a', xRatio: 0.34, yRatio: 0.47 },
  { id: 'omok-b', xRatio: 0.36, yRatio: 0.47 },
  { id: 'omok-c', xRatio: 0.34, yRatio: 0.49 },
  // 남친9함 — 오른쪽 광장
  { id: 'nine-a', xRatio: 0.64, yRatio: 0.45 },
  { id: 'nine-b', xRatio: 0.66, yRatio: 0.45 },
  { id: 'nine-c', xRatio: 0.65, yRatio: 0.48 },
  // 여고생 이석재 — 분수 위쪽 고정
  { id: 'sok-stand', xRatio: 0.515, yRatio: 0.335 },
  // 조은밤조은꿈 — 건빈 NPC (0.43, 0.31) 오른쪽 작은 산책 루프
  { id: 'joeun-a', xRatio: 0.505, yRatio: 0.315 },
  { id: 'joeun-b', xRatio: 0.535, yRatio: 0.315 },
  { id: 'joeun-c', xRatio: 0.52, yRatio: 0.345 },
]

/** 각 봇 루프 내부 edge — 다른 봇 영역과 절대 연결 안 됨. */
const PATH_EDGES: readonly (readonly [string, string])[] = [
  ['mess-a', 'mess-b'],
  ['mess-b', 'mess-c'],
  ['won-a', 'won-b'],
  ['won-b', 'won-c'],
  ['won-c', 'won-a'],
  ['omok-a', 'omok-b'],
  ['omok-c', 'omok-a'],
  ['nine-a', 'nine-b'],
  ['nine-b', 'nine-c'],
  ['nine-c', 'nine-a'],
  ['joeun-a', 'joeun-b'],
  ['joeun-b', 'joeun-c'],
  ['joeun-c', 'joeun-a'],
]

interface BotBehavior {
  /** hop 이동 속도 (px/sec). */
  walkSpeedPxPerSec: number
  emoteIntervalMs: readonly [number, number]
  emoteSet?: readonly string[]
}

interface BotConfig {
  name: string
  outfitId: Parameters<typeof getPlayerOutfitTextureKey>[0]
  /** 봇이 시작하는 노드. 여기서 BFS 로 maxHopsFromHome 만큼 떨어진 노드 안에서만 wander. */
  homeNodeId: string
  /** 홈에서 떨어질 수 있는 edge 갯수 한도. 클수록 마을 멀리 다님. */
  maxHopsFromHome: number
  /** true 면 해당 위치에 서 있고 이모티콘만 가끔 띄운다. */
  stationary?: boolean
  behavior: BotBehavior
}

/**
 * 봇별 전용 home loop. maxHopsFromHome=3 이면 4점 루프 전체만 허용한다.
 */
const BOT_CONFIGS: readonly BotConfig[] = [
  {
    name: '메시',
    outfitId: 'man3',
    homeNodeId: 'mess-a',
    maxHopsFromHome: 2,
    behavior: {
      walkSpeedPxPerSec: BOT_WALK_SPEED_PX_PER_SEC,
      emoteIntervalMs: [20_000, 35_000],
      emoteSet: ['👍', '😄'],
    },
  },
  {
    name: '원빈현빈건빈미스터빈',
    outfitId: 'man6',
    homeNodeId: 'won-a',
    maxHopsFromHome: 2,
    behavior: {
      walkSpeedPxPerSec: BOT_WALK_SPEED_PX_PER_SEC,
      emoteIntervalMs: [5_500, 10_000],
      emoteSet: ['❤️', '😄', '좋아'],
    },
  },
  {
    name: '오목뜨실분',
    outfitId: 'man8',
    homeNodeId: 'omok-a',
    maxHopsFromHome: 1,
    behavior: {
      walkSpeedPxPerSec: BOT_WALK_SPEED_PX_PER_SEC,
      emoteIntervalMs: [6_000, 11_000],
      emoteSet: ['❓', '좋아', '안녕', '따라와'],
    },
  },
  {
    name: '남친9함',
    outfitId: 'girl2',
    homeNodeId: 'nine-a',
    maxHopsFromHome: 2,
    behavior: {
      walkSpeedPxPerSec: BOT_WALK_SPEED_PX_PER_SEC,
      emoteIntervalMs: [5_000, 9_000],
      emoteSet: ['안녕', '따라와', '❤️', '😄', '👍'],
    },
  },
  {
    name: '여고생 이석재',
    outfitId: 'girl8',
    homeNodeId: 'sok-stand',
    maxHopsFromHome: 0,
    stationary: true,
    behavior: {
      walkSpeedPxPerSec: BOT_WALK_SPEED_PX_PER_SEC,
      emoteIntervalMs: [1_200, 2_200],
      emoteSet: ['❤️'],
    },
  },
  {
    name: '조은밤조은꿈',
    outfitId: 'girl7',
    homeNodeId: 'joeun-a',
    maxHopsFromHome: 2,
    behavior: {
      walkSpeedPxPerSec: BOT_WALK_SPEED_PX_PER_SEC,
      emoteIntervalMs: [3_500, 7_000],
      emoteSet: ['고마워', '안녕', '😄', '❤️'],
    },
  },
]

interface BotInstance {
  config: BotConfig
  sprite: PlayerSprite
  nameText: Phaser.GameObjects.Text
  textureKey: string
  /** 현재 위치한 path node id. */
  currentNodeId: string
  /** 직전 출발한 노드. 즉시 백트래킹 (왔다갔다) 회피용. */
  previousNodeId: string | null
  targetNodeId: string | null
  /** home 에서 BFS 로 maxHopsFromHome 이내 도달 가능한 노드들. */
  allowedNodes: Set<string>
  hopTimer: Phaser.Time.TimerEvent | null
  emoteTimer: Phaser.Time.TimerEvent | null
  lastDistanceToTarget: number
  stuckMs: number
}

export interface VillageBotsControllerOptions {
  scene: Phaser.Scene
  worldWidth: number
  worldHeight: number
  /** undefined 면 obstacle 체크 없이 모든 노드 사용 가능. */
  obstacleQuery?: ObstacleQuery | null
}

export class VillageBotsController {
  private readonly scene: Phaser.Scene
  private readonly worldWidth: number
  private readonly worldHeight: number
  private readonly obstacleQuery: ObstacleQuery | null
  /** id → node. */
  private readonly nodes: Map<string, PathNode>
  /** id → neighbor ids (양방향 펼친 결과; obstacle 막힌 노드는 양쪽에서 제거됨). */
  private readonly adjacency: Map<string, string[]>
  private readonly physicsGroup: Phaser.Physics.Arcade.Group
  private readonly bots: BotInstance[] = []
  private destroyed = false

  constructor(options: VillageBotsControllerOptions) {
    this.scene = options.scene
    this.worldWidth = options.worldWidth
    this.worldHeight = options.worldHeight
    this.obstacleQuery = options.obstacleQuery ?? null
    this.nodes = new Map(PATH_NODES.map(n => [n.id, n]))
    this.adjacency = this.buildAdjacency()
    this.physicsGroup = this.scene.physics.add.group({ allowGravity: false })
  }

  start(): void {
    if (DEBUG_DRAW_PATH_GRAPH) this.drawDebugGraph()
    BOT_CONFIGS.forEach(config => this.spawnBot(config))
  }

  getPhysicsGroup(): Phaser.Physics.Arcade.Group {
    return this.physicsGroup
  }

  update(delta: number): void {
    if (this.destroyed) return

    for (const bot of this.bots) {
      this.updateBotMovement(bot, delta)
      this.syncNameText(bot)
    }
  }

  /** 좌표 튜닝용 — 노드는 마젠타 원 + id 라벨, edge 는 옅은 선. depth 는 봇보다 낮게 깔되 배경보다는 위. */
  private drawDebugGraph(): void {
    const edgeGraphics = this.scene.add.graphics().setDepth(3)
    edgeGraphics.lineStyle(2, 0xff00ff, 0.55)
    for (const [aId, bId] of PATH_EDGES) {
      const a = this.nodes.get(aId)
      const b = this.nodes.get(bId)
      if (!a || !b) continue
      edgeGraphics.lineBetween(
        a.xRatio * this.worldWidth,
        a.yRatio * this.worldHeight,
        b.xRatio * this.worldWidth,
        b.yRatio * this.worldHeight,
      )
    }
    for (const node of PATH_NODES) {
      const x = node.xRatio * this.worldWidth
      const y = node.yRatio * this.worldHeight
      this.scene.add.circle(x, y, 10, 0xff00ff, 0.85).setStrokeStyle(2, 0xffffff, 0.9).setDepth(4)
      this.scene.add
        .text(x, y - 14, node.id, {
          fontSize: '11px',
          color: '#ffffff',
          backgroundColor: '#000000cc',
          padding: { left: 4, right: 4, top: 1, bottom: 1 },
          resolution: 2,
        })
        .setOrigin(0.5, 1)
        .setDepth(4)
    }
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    for (const bot of this.bots) {
      bot.hopTimer?.remove(false)
      bot.emoteTimer?.remove(false)

      if (bot.sprite.active && bot.sprite.body) {
        bot.sprite.body.setVelocity(0, 0)
        bot.sprite.anims.stop()
      }
      if (bot.nameText.active) {
        bot.nameText.destroy()
      }
      if (bot.sprite.active) {
        bot.sprite.destroy()
      }
    }
    if (this.physicsGroup.scene) {
      this.physicsGroup.clear(false, false)
    }
    this.bots.length = 0
  }

  // ---------- 내부 ----------

  private buildAdjacency(): Map<string, string[]> {
    const adj = new Map<string, string[]>()
    PATH_NODES.forEach(n => adj.set(n.id, []))
    for (const [a, b] of PATH_EDGES) {
      const from = this.nodes.get(a)
      const to = this.nodes.get(b)
      if (!from || !to || this.isPathBlocked(from, to)) continue

      adj.get(a)?.push(b)
      adj.get(b)?.push(a)
    }
    // obstacle 안에 든 노드는 양쪽에서 끊어 — 봇이 절대 거기로 hop 안 함.
    for (const node of PATH_NODES) {
      if (this.isNodeBlocked(node)) {
        const neighbors = adj.get(node.id) ?? []
        for (const nb of neighbors) {
          const nbList = adj.get(nb)
          if (nbList)
            adj.set(
              nb,
              nbList.filter(x => x !== node.id),
            )
        }
        adj.set(node.id, [])
      }
    }
    return adj
  }

  private isNodeBlocked(node: PathNode): boolean {
    if (!this.obstacleQuery) return false
    return this.obstacleQuery.containsBlockedFoot(
      node.xRatio * this.worldWidth,
      node.yRatio * this.worldHeight,
      OBSTACLE_FOOT_RADIUS_PX,
    )
  }

  private isPathBlocked(from: PathNode, to: PathNode): boolean {
    if (!this.obstacleQuery) return false

    const fromX = from.xRatio * this.worldWidth
    const fromY = from.yRatio * this.worldHeight
    const toX = to.xRatio * this.worldWidth
    const toY = to.yRatio * this.worldHeight
    const distance = Math.hypot(toX - fromX, toY - fromY)
    const steps = Math.max(2, Math.ceil(distance / 12))

    for (let index = 0; index <= steps; index += 1) {
      const t = index / steps
      const x = Phaser.Math.Linear(fromX, toX, t)
      const y = Phaser.Math.Linear(fromY, toY, t)
      if (this.obstacleQuery.containsBlockedFoot(x, y, OBSTACLE_FOOT_RADIUS_PX)) {
        return true
      }
    }

    return false
  }

  private spawnBot(config: BotConfig): void {
    const homeNode = this.nodes.get(config.homeNodeId)
    if (!homeNode) {
      console.warn(`[VillageBots] "${config.name}": unknown homeNodeId "${config.homeNodeId}"`)
      return
    }
    const allowed = this.bfsWithinHops(config.homeNodeId, config.maxHopsFromHome)
    if (allowed.size === 0) {
      console.warn(
        `[VillageBots] "${config.name}": home node "${config.homeNodeId}" blocked or isolated`,
      )
      return
    }

    const textureKey = getPlayerOutfitTextureKey(config.outfitId)
    const x = homeNode.xRatio * this.worldWidth
    const y = homeNode.yRatio * this.worldHeight
    const sprite = createPlayer(this.scene, x, y, { textureKey, depth: BOT_SPRITE_DEPTH })
    sprite.setCollideWorldBounds(true)
    sprite.setPushable(false)
    sprite.body.setAllowGravity(false)
    sprite.body.setMaxVelocity(config.behavior.walkSpeedPxPerSec, config.behavior.walkSpeedPxPerSec)
    this.physicsGroup.add(sprite)

    const nameText = this.scene.add
      .text(
        x,
        y - sprite.displayHeight / 2 - VILLAGE_PLAYER_NAME_VERTICAL_GAP_PX,
        config.name,
        VILLAGE_PLAYER_NAME_TEXT_STYLE,
      )
      .setOrigin(0.5, 1)
      .setDepth(NAME_TEXT_DEPTH)

    const bot: BotInstance = {
      config,
      sprite,
      nameText,
      textureKey,
      currentNodeId: config.homeNodeId,
      previousNodeId: null,
      targetNodeId: null,
      allowedNodes: allowed,
      hopTimer: null,
      emoteTimer: null,
      lastDistanceToTarget: Number.POSITIVE_INFINITY,
      stuckMs: 0,
    }
    this.bots.push(bot)

    if (!config.stationary) {
      this.scheduleNextHop(bot, randomInRange(BOT_IDLE_INTERVAL_MS))
    }
    this.scheduleNextEmote(bot)
  }

  /** BFS — home 노드부터 maxHops edge 까지 도달 가능한 (또 obstacle 막히지 않은) 노드 id 집합. */
  private bfsWithinHops(startId: string, maxHops: number): Set<string> {
    const visited = new Set<string>()
    const startNode = this.nodes.get(startId)
    if (!startNode || this.isNodeBlocked(startNode)) return visited
    const queue: [string, number][] = [[startId, 0]]
    while (queue.length > 0) {
      const [id, hops] = queue.shift()!
      if (visited.has(id)) continue
      visited.add(id)
      if (hops >= maxHops) continue
      const neighbors = this.adjacency.get(id) ?? []
      for (const nb of neighbors) {
        if (!visited.has(nb)) queue.push([nb, hops + 1])
      }
    }
    return visited
  }

  private scheduleNextHop(bot: BotInstance, delayMs = 0): void {
    if (this.destroyed) return
    bot.hopTimer?.remove(false)
    bot.hopTimer = this.scene.time.delayedCall(delayMs, () => this.startNextHop(bot))
  }

  private startNextHop(bot: BotInstance): void {
    if (this.destroyed || !bot.sprite.active) return
    const neighbors = (this.adjacency.get(bot.currentNodeId) ?? []).filter(id =>
      bot.allowedNodes.has(id),
    )
    if (neighbors.length === 0) {
      // 막다른 곳 — 잠깐 후 재시도. (실제로는 발생하지 않을 것: BFS 결과로 home·이웃은 항상 다 들어가 있음.)
      this.scheduleNextHop(bot, 300)
      return
    }
    // 대부분은 한 방향으로 산책하되, 가끔 되돌아서 작은 루프도 덜 기계적으로 보이게 한다.
    const nonBacktrack = neighbors.filter(id => id !== bot.previousNodeId)
    const shouldAvoidBacktrack = nonBacktrack.length > 0 && Math.random() < 0.7
    const choices = shouldAvoidBacktrack ? nonBacktrack : neighbors
    const nextId = choices[Math.floor(Math.random() * choices.length)]
    bot.targetNodeId = nextId
    bot.lastDistanceToTarget = Number.POSITIVE_INFINITY
    bot.stuckMs = 0
  }

  private updateBotMovement(bot: BotInstance, delta: number): void {
    if (!bot.targetNodeId) {
      bot.sprite.setVelocity(0, 0)
      return
    }

    const targetNode = this.nodes.get(bot.targetNodeId)
    if (!targetNode) {
      bot.targetNodeId = null
      bot.sprite.setVelocity(0, 0)
      return
    }

    const targetX = targetNode.xRatio * this.worldWidth
    const targetY = targetNode.yRatio * this.worldHeight
    const dx = targetX - bot.sprite.x
    const dy = targetY - bot.sprite.y
    const distance = Math.hypot(dx, dy)

    if (distance <= BOT_ARRIVAL_DISTANCE_PX) {
      this.arriveAtTarget(bot, targetX, targetY)
      return
    }

    if (distance >= bot.lastDistanceToTarget - 0.5) {
      bot.stuckMs += delta
    } else {
      bot.stuckMs = 0
    }
    bot.lastDistanceToTarget = distance

    if (bot.stuckMs >= BOT_STUCK_RESET_MS) {
      bot.targetNodeId = null
      bot.sprite.setVelocity(0, 0)
      bot.sprite.anims.stop()
      bot.stuckMs = 0
      this.scheduleNextHop(bot, randomInRange(BOT_IDLE_INTERVAL_MS))
      return
    }

    const speed = bot.config.behavior.walkSpeedPxPerSec
    bot.sprite.setVelocity((dx / distance) * speed, (dy / distance) * speed)
    this.playWalkAnim(bot, pickDirection(dx, dy))
  }

  private arriveAtTarget(bot: BotInstance, targetX: number, targetY: number): void {
    const arrivedNodeId = bot.targetNodeId
    if (!arrivedNodeId) return

    bot.sprite.setPosition(targetX, targetY)
    bot.sprite.setVelocity(0, 0)
    bot.sprite.anims.stop()
    bot.previousNodeId = bot.currentNodeId
    bot.currentNodeId = arrivedNodeId
    bot.targetNodeId = null
    bot.lastDistanceToTarget = Number.POSITIVE_INFINITY
    bot.stuckMs = 0
    this.scheduleNextHop(bot, randomInRange(BOT_IDLE_INTERVAL_MS))
  }

  private scheduleNextEmote(bot: BotInstance): void {
    if (this.destroyed) return
    const delay = randomInRange(bot.config.behavior.emoteIntervalMs)
    bot.emoteTimer = this.scene.time.delayedCall(delay, () => {
      if (this.destroyed || !bot.sprite.active) return
      const pool = bot.config.behavior.emoteSet ?? VILLAGE_BASE_EMOJIS
      const emoji = pool[Math.floor(Math.random() * pool.length)]
      emitEmoteBubble(this.scene, bot.sprite, emoji, EMOTE_DEPTH)
      this.scheduleNextEmote(bot)
    })
  }

  private playWalkAnim(bot: BotInstance, dir: PlayerDirection): void {
    const animKey = getPlayerWalkAnimationKey(dir, bot.textureKey)
    if (bot.sprite.anims.currentAnim?.key !== animKey || !bot.sprite.anims.isPlaying) {
      bot.sprite.anims.play(animKey)
    }
  }

  private syncNameText(bot: BotInstance): void {
    bot.nameText.setPosition(
      bot.sprite.x,
      bot.sprite.y - bot.sprite.displayHeight / 2 - VILLAGE_PLAYER_NAME_VERTICAL_GAP_PX,
    )
  }
}

function pickDirection(dx: number, dy: number): PlayerDirection {
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? 'right' : 'left'
  }
  return dy > 0 ? 'down' : 'up'
}

function randomInRange(range: readonly [number, number]): number {
  return Phaser.Math.Between(range[0], range[1])
}
