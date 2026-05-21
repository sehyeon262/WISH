import Phaser from 'phaser'
import { getFuelInbox } from '@wish/api-client'
import { playSceneBgm } from '@/game/systems/sceneBgm'
import { useAuthStore } from '@/features/auth/store'
import { assetPath } from '@/game/assets/assetPath'
import {
  createClickTargetMarker,
  createPlayer,
  ensurePlayerWalkAnimations,
  loadPlayerSpritesheets,
  type PlayerDirection,
  type PlayerSprite,
  type RatioPoint,
  updatePlayerMovement,
} from '@/game/entities/player'
import { fadeToScene } from '@/game/systems/sceneTransition'
import { getPlayerMoveSpeed } from '@/game/settings/gameSettings'
import { createSceneWeatherLayer } from '@/features/weather/phaserWeatherLayer'
import {
  NPC_DIALOG_FRAME_LAYOUT,
  createSimpleDialogUi,
  fadeSimpleDialog,
  setCenteredDialogText,
  type SimpleDialogUi,
} from '@/game/ui/simpleDialog'
import { createSettingsMenu } from '@/game/ui/settingsMenu'
import { NpcInteractionHintUi } from '@/game/ui/npcInteractionHint'
import { getRectangleEntryState } from '@/game/world/portal'
import type { VillagerNpcId } from '@/features/village-dialogue/types'
import {
  VILLAGER_FIRST_GREETING,
  villageDialogues,
} from '@/features/village-dialogue/villageDialogues'
import {
  attachVillageRealtime,
  createVillageEmojiPalette,
  emitEmoteBubble,
  isWhiteBeltBoastEmoji,
  syncCurrentBeltEmojiToPalette,
  VILLAGE_EMOJI_SLOT_COUNT,
  WHITE_BELT_PROMOTION_GUIDE_MESSAGE,
  type VillageEmojiPaletteHandle,
  type VillageRealtimeIntegration,
} from '@/features/village-realtime'
import {
  createInitialVillagePortalState,
  createVillagePortalRectangles,
  VILLAGE_THEME_PORTALS,
  type VillagePortalKey,
} from './villagePortals'
import { VillageObstacleManager } from './villageObstacles'
import { VillageBotsController } from '@/features/village-bots/VillageBotsController'

const NPC_DIALOG_DISTANCE = 28
const PHOTO_BOOTH_INTERACT_DISTANCE = 40
const PHOTO_GALLERY_INTERACT_DISTANCE = 40
const GOMOKU_BOARD_INTERACT_DISTANCE = 56
const WORLD_INTERACTION_REOPEN_COOLDOWN_MS = 350
const EMOJI_HINT_TEXT = '[Q] 이모티콘'
const EMOJI_HINT_OPEN_TEXT = '[Q] 닫기'
const EMOJI_HINT_OPEN_OFFSET_Y = 66
const SETTINGS_HINT_TEXT = '\u2699 [ESC] 설정'
const LEGACY_INTERACTION_TUTORIAL_KEY = 'tutorial_interaction_seen'
const VILLAGE_CONTROL_TUTORIAL_DURATION_MS = 10000
const VILLAGE_SHIP_KEY = 'village-ship'
const VILLAGE_SHIP_PATH = 'images/themes/ferry/ui/ship.png'
const VILLAGE_SHIP = {
  xRatio: 0.5,
  yRatio: 0.92,
  scale: 0.22,
} as const
const VILLAGE_PHOTO_BOOTH_KEY = 'village-photo-booth'
const VILLAGE_PHOTO_BOOTH_PATH = 'images/village/objects/photo.png'
const VILLAGE_PHOTO_BOOTH = {
  xRatio: 0.515,
  yRatio: 0.31,
  scale: 0.145,
} as const
const VILLAGE_PHOTO_GALLERY_KEY = 'village-photo-gallery'
const VILLAGE_PHOTO_GALLERY_PATH = 'images/village/objects/gallery.png'
// 포토부스 우측 가로등 위에 덮어쓰는 위치. 같은 원점(0.5, 1) 사용.
const VILLAGE_PHOTO_GALLERY = {
  xRatio: 0.5461,
  yRatio: 0.3285,
  scale: 0.14,
} as const
const SEHYUN_NPC_WORLD = {
  xRatio: 0.38,
  yRatio: 0.3,
  scale: 0.38,
} as const
const NURSE_BUNNY_WORLD = {
  xRatio: 0.49,
  yRatio: 0.455,
  scale: 0.09,
} as const
const VILLAGE_GOMOKU_BOARD_KEY = 'village-gomoku-board'
const VILLAGE_GOMOKU_BOARD_PATH = 'images/village/objects/gomoku-board.png'
const VILLAGE_GOMOKU_BOARD = {
  xRatio: SEHYUN_NPC_WORLD.xRatio,
  yRatio: NURSE_BUNNY_WORLD.yRatio - 0.02,
  scale: 0.187,
} as const
const GOMOKU_BOARD_POSITION_OFFSET = {
  xBoardWidthRatio: -0.56,
} as const
const GOMOKU_BOARD_INTERACT_RECT = {
  left: 0.72,
  top: 1.08,
  width: 1.36,
  height: 0.9,
} as const
const DEFAULT_PLAYER_SPAWN = { xRatio: 0.5, yRatio: 0.3 }
const JEONGHO_NPC_ID: VillagerNpcId = 'gardener_bear'
const JEONGHO_NORMAL_KEY = 'village-character-jungho'
const JEONGHO_ANGRY_KEY = 'village-character-jungho-angry'
const JEONGHO_ANGRY_PATH = 'images/village/background/character/jungho-angry.png'
const JEONGHO_FIELD_WARNING_HOLD_MS = 3_000
const JEONGHO_FIELD_WARNING_FOOT_SAMPLE_RADIUS = 28
const JEONGHO_FIELD_WARNING_TEXT = '\uAF43\uC744 \uBC1F\uC73C\uBA74 \uC548\uB3FC..'
const JEONGHO_FIELD_WARNING_ANGRY_TEXT = '\uBC1F\uC9C0 \uB9D0\uB77C\uB2C8\uAE4C!!'
const JEONGHO_FIELD_WARNING_ZONE_POINTS: RatioPoint[] = [
  { xRatio: 0.575, yRatio: 0.262 },
  { xRatio: 0.63, yRatio: 0.264 },
  { xRatio: 0.628, yRatio: 0.306 },
  { xRatio: 0.574, yRatio: 0.304 },
]
const MAP_TILE_ROWS = 3
const MAP_TILE_COLUMNS = 3
const MAP_TILE_KEYS = Array.from({ length: MAP_TILE_ROWS * MAP_TILE_COLUMNS }, (_, index) => {
  const tileNumber = index.toString().padStart(2, '0')
  return {
    key: `village-map-tile-${tileNumber}`,
    path: `images/village/background/tile_${tileNumber}.webp`,
    row: Math.floor(index / MAP_TILE_COLUMNS),
    column: index % MAP_TILE_COLUMNS,
  }
})

type VillageCharacterConfig = {
  id: VillagerNpcId
  key: string
  path: string
  dialogFrameKey: string
  dialogFramePath: string
  xRatio: number
  yRatio: number
  scale: number
}

const VILLAGE_CHARACTERS: VillageCharacterConfig[] = [
  {
    id: 'dain',
    key: 'village-character-dain',
    path: 'images/village/background/character/dain.png',
    dialogFrameKey: 'village-dain-dialog-frame',
    dialogFramePath: 'images/npcs/dain/dialog-frame.png',
    xRatio: 0.75,
    yRatio: 0.38,
    scale: 0.095,
  },
  {
    id: 'nurse_bunny',
    key: 'village-character-joeun',
    path: 'images/village/background/character/joeun.png',
    dialogFrameKey: 'village-joeun-dialog-frame',
    dialogFramePath: 'images/npcs/joeun/dialog-frame.png',
    xRatio: NURSE_BUNNY_WORLD.xRatio,
    yRatio: NURSE_BUNNY_WORLD.yRatio,
    scale: NURSE_BUNNY_WORLD.scale,
  },
  {
    id: 'sleepy_sheep',
    key: 'village-character-geonbin',
    path: 'images/village/background/character/geonbin.png',
    dialogFrameKey: 'village-geonbin-dialog-frame',
    dialogFramePath: 'images/npcs/geonbin/dialog-frame.png',
    xRatio: 0.43,
    yRatio: 0.31,
    scale: 0.095,
  },
  {
    id: 'gardener_bear',
    key: JEONGHO_NORMAL_KEY,
    path: 'images/village/background/character/jungho.png',
    dialogFrameKey: 'village-jeongho-dialog-frame',
    dialogFramePath: 'images/npcs/jeongho/dialog-frame.png',
    xRatio: 0.616,
    yRatio: 0.29,
    scale: 0.14,
  },
  {
    id: 'monkey_friend',
    key: 'village-character-komonge',
    path: 'images/village/background/character/komonge.png',
    dialogFrameKey: 'village-kongmong-dialog-frame',
    dialogFramePath: 'images/npcs/kongmong/dialog-frame.png',
    xRatio: 0.58,
    yRatio: 0.398,
    scale: 0.08,
  },
] as const

const SEHYUN_NPC = {
  id: 'squirrel_friend',
  portraitKey: 'village-character-sehyun',
  portraitPath: 'images/village/background/character/sehyun.png',
  dialogFrameKey: 'village-sehyun-dialog-frame',
  dialogFramePath: 'images/npcs/sehyun/dialog-frame.png',
} satisfies {
  id: VillagerNpcId
  portraitKey: string
  portraitPath: string
  dialogFrameKey: string
  dialogFramePath: string
}

type VillageNpcInstance = {
  id: VillagerNpcId
  object: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite
}

type JeonghoFieldWarningPhase = 'normal' | 'angry'

type JeonghoFieldWarningBubble = {
  container: Phaser.GameObjects.Container
  background: Phaser.GameObjects.Graphics
  text: Phaser.GameObjects.Text
  phase: JeonghoFieldWarningPhase | null
}

const VILLAGE_MINIMAP = {
  marginX: 16,
  marginY: 16,
  maxWidth: 274,
  minWidth: 198,
  widthRatio: 0.34,
  padding: 12,
  headerHeight: 38,
  depth: 96,
} as const

const VILLAGE_MINIMAP_ZOOM_LEVELS = [0.74, 1.08, 1.58] as const
const VILLAGE_FUEL_NOTICE_POLL_INTERVAL_MS = 3_000
const VILLAGE_NOTICE_FONT_FAMILY =
  '"Pretendard Variable", Pretendard, "Noto Sans KR", -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", sans-serif'
const VILLAGE_FUEL_NOTICE_POPUP = {
  designWidth: 360,
  designHeight: 268,
  marginX: 28,
  marginY: 24,
} as const
const VILLAGE_FUEL_NOTICE_COLORS = {
  shadow: 0x4a321e,
  panel: 0xfffdf7,
  panelBottom: 0xf8f0e4,
  panelBorder: 0xb99f71,
  innerBorder: 0xe8dcc8,
  message: 0xfffdf8,
  messageBorder: 0xeadfce,
  title: '#3b3026',
  text: '#4a3a2c',
  muted: '#8a7d70',
  primary: 0xf3a86f,
  primaryDark: 0xd4834f,
} as const

function drawVillageFuelNoticePanelSurface(
  graphics: Phaser.GameObjects.Graphics,
  width: number,
  height: number,
  ui: number,
) {
  const radius = 12 * ui
  graphics.clear()
  graphics.fillStyle(VILLAGE_FUEL_NOTICE_COLORS.shadow, 0.12)
  graphics.fillRoundedRect(4 * ui, 6 * ui, width, height, radius)
  graphics.fillStyle(VILLAGE_FUEL_NOTICE_COLORS.panel, 0.99)
  graphics.fillRoundedRect(0, 0, width, height, radius)
  graphics.fillStyle(VILLAGE_FUEL_NOTICE_COLORS.panelBottom, 0.34)
  graphics.fillRoundedRect(6 * ui, height * 0.58, width - 12 * ui, height * 0.36, radius - 3 * ui)
  graphics.lineStyle(1.5 * ui, VILLAGE_FUEL_NOTICE_COLORS.innerBorder, 0.62)
  graphics.strokeRoundedRect(4 * ui, 4 * ui, width - 8 * ui, height - 8 * ui, radius - 3 * ui)
  graphics.lineStyle(2.2 * ui, VILLAGE_FUEL_NOTICE_COLORS.panelBorder, 0.95)
  graphics.strokeRoundedRect(0, 0, width, height, radius)
}

function drawVillageFuelNoticeMessageBox(
  graphics: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  width: number,
  height: number,
  ui: number,
) {
  const radius = 8 * ui
  graphics.clear()
  graphics.fillStyle(VILLAGE_FUEL_NOTICE_COLORS.message, 0.96)
  graphics.fillRoundedRect(x, y, width, height, radius)
  graphics.lineStyle(1.2 * ui, VILLAGE_FUEL_NOTICE_COLORS.messageBorder, 0.92)
  graphics.strokeRoundedRect(x, y, width, height, radius)
}

function drawVillageFuelNoticeButton(
  graphics: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  width: number,
  height: number,
  ui: number,
) {
  const radius = 8 * ui
  const x = cx - width / 2
  const y = cy - height / 2
  graphics.clear()
  graphics.fillStyle(VILLAGE_FUEL_NOTICE_COLORS.primary, 1)
  graphics.fillRoundedRect(x, y, width, height, radius)
  graphics.fillStyle(0xffffff, 0.12)
  graphics.fillRoundedRect(x + 3 * ui, y + 3 * ui, width - 6 * ui, height * 0.34, radius - 2 * ui)
  graphics.lineStyle(1.5 * ui, VILLAGE_FUEL_NOTICE_COLORS.primaryDark, 0.92)
  graphics.strokeRoundedRect(x, y, width, height, radius)
}

const VILLAGE_MINIMAP_THEME_LABELS: Record<VillagePortalKey, string> = {
  art: '미술',
  taekwondo: '태권도',
  gymnastics: '체조',
  music: '음악',
  lighthouse: '등대',
  ferry: '별빛 항구',
}

type VillageMinimapMarkerKey = VillagePortalKey | 'photo' | 'gomoku' | 'ship'

const VILLAGE_MINIMAP_MARKER_OFFSETS: Record<VillageMinimapMarkerKey, RatioPoint> = {
  art: { xRatio: -0.004, yRatio: -0.012 },
  taekwondo: { xRatio: 0.006, yRatio: 0.012 },
  gymnastics: { xRatio: 0, yRatio: 0.006 },
  music: { xRatio: -0.004, yRatio: 0.006 },
  lighthouse: { xRatio: 0.01, yRatio: -0.01 },
  ferry: { xRatio: 0.006, yRatio: -0.018 },
  photo: { xRatio: -0.006, yRatio: -0.024 },
  gomoku: { xRatio: 0.008, yRatio: -0.018 },
  ship: { xRatio: 0, yRatio: -0.044 },
}

type VillageMinimapMarker = {
  key: VillageMinimapMarkerKey
  label: string
  xRatio: number
  yRatio: number
  targetXRatio: number
  targetYRatio: number
  color: number
  radius: number
}

type VillageMinimapBaseUi = {
  container: Phaser.GameObjects.Container
  worldWidth: number
  worldHeight: number
}

type VillageMinimapMarkerHit = {
  bounds: Phaser.Geom.Rectangle
  worldX: number
  worldY: number
  dot: Phaser.GameObjects.Arc
}

type VillageMinimapUi =
  | (VillageMinimapBaseUi & {
      collapsed: true
      mapIconBounds: Phaser.Geom.Rectangle
    })
  | (VillageMinimapBaseUi & {
      collapsed: false
      cameraRect: Phaser.GameObjects.Graphics
      playerDot: Phaser.GameObjects.Arc
      zoomOutBounds: Phaser.Geom.Rectangle
      zoomInBounds: Phaser.Geom.Rectangle
      markerHits: VillageMinimapMarkerHit[]
      mapX: number
      mapY: number
      mapWidth: number
      mapHeight: number
    })

type VillageFuelNoticeUi = {
  container: Phaser.GameObjects.Container
  iconBounds: Phaser.Geom.Rectangle
  popupBounds: Phaser.Geom.Rectangle
  confirmBounds: Phaser.Geom.Rectangle
  popup: Phaser.GameObjects.Container
}

type VillageSceneData = {
  spawn?: RatioPoint
  portalCooldownMs?: number
}

function setStoredFlag(key: string) {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(key, 'true')
  } catch {
    // localStorage can be unavailable in private mode; the hint still works for this session.
  }
}

function createRatioPolygon(points: RatioPoint[], worldWidth: number, worldHeight: number) {
  return new Phaser.Geom.Polygon(
    points.map(
      point => new Phaser.Geom.Point(point.xRatio * worldWidth, point.yRatio * worldHeight),
    ),
  )
}

export class VillageScene extends Phaser.Scene {
  private player!: PlayerSprite
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private wasdKeys!: Partial<Record<PlayerDirection, Phaser.Input.Keyboard.Key>>
  private obstacles!: Phaser.Physics.Arcade.StaticGroup
  private obstacleManager?: VillageObstacleManager
  private sehyunNpc!: Phaser.GameObjects.Sprite
  private photoBooth?: Phaser.GameObjects.Image
  private photoGallery?: Phaser.GameObjects.Image
  private gomokuBoard?: Phaser.GameObjects.Image
  private isPhotoBoothInRange = false
  private isPhotoGalleryInRange = false
  private isGomokuBoardInRange = false
  private dialogs = new Map<VillagerNpcId, SimpleDialogUi>()
  private villageNpcs: VillageNpcInstance[] = []
  private villageBots: VillageBotsController | null = null
  private portalCooldownUntil = 0
  private worldInteractionCooldownUntil = 0
  private portals = new Map<VillagePortalKey, Phaser.Geom.Rectangle>()
  private playerWasInPortal = createInitialVillagePortalState()
  private isTransitioning = false
  private target: Phaser.Math.Vector2 | null = null
  private lastDirection: PlayerDirection = 'down'
  private lastSafePlayerPosition?: Phaser.Math.Vector2
  private isVillagerDialogueOpen = false
  private isGomokuOpen = false
  private isPhotoGalleryOpen = false
  private dialogDismissed = false
  private nearestNpcId: VillagerNpcId | null = null
  private activeDialogNpcId: VillagerNpcId | null = null
  private jeonghoFieldWarningZone?: Phaser.Geom.Polygon
  private jeonghoFieldEnteredAt: number | null = null
  private jeonghoFieldWarningBubble: JeonghoFieldWarningBubble | null = null
  private settingsMenu!: ReturnType<typeof createSettingsMenu>
  private interactionHint!: NpcInteractionHintUi
  private villageRealtime: VillageRealtimeIntegration | null = null
  private emojiPalette: VillageEmojiPaletteHandle | null = null
  private minimap: VillageMinimapUi | null = null
  private fuelNotice: VillageFuelNoticeUi | null = null
  private minimapZoomIndex = 1
  private isMinimapCollapsed = false
  private hoveredMinimapMarkerIndex: number | null = null
  private hasPendingFuelNotice = false
  private isFuelNoticeOpen = false
  private isFuelInboxNoticeRequestPending = false
  private currentFuelNoticeSignature = ''
  private dismissedFuelNoticeSignature = ''
  private fuelNoticePoll?: Phaser.Time.TimerEvent
  private readonly handleFuelNoticeFocus = () => {
    void this.loadVillageFuelNoticeState()
  }
  private disposeEmojiBeltSync: (() => void) | null = null
  /** Q 키로 사용자가 의도적으로 팔레트를 켰는지. 다이얼로그/설정 패널 자동 숨김과 분리. */
  private emojiPaletteManuallyShown = false
  /** 팔레트 숨겨져 있을 때 우하단에 "[Q] 이모티콘" 으로 토글 단축키 안내 (S14P31E103-769). */
  private emojiHint: Phaser.GameObjects.Text | null = null
  private settingsHint: Phaser.GameObjects.Text | null = null
  private controlTutorial: Phaser.GameObjects.Container | null = null
  private controlTutorialTimer?: Phaser.Time.TimerEvent

  constructor() {
    super({ key: 'VillageScene' })
  }

  preload() {
    MAP_TILE_KEYS.forEach(tile => {
      this.load.image(tile.key, assetPath(tile.path))
    })
    VILLAGE_CHARACTERS.forEach(character => {
      this.load.image(character.key, assetPath(character.path))
      this.load.image(character.dialogFrameKey, assetPath(character.dialogFramePath))
    })
    this.load.image(SEHYUN_NPC.portraitKey, assetPath(SEHYUN_NPC.portraitPath))
    this.load.image(SEHYUN_NPC.dialogFrameKey, assetPath(SEHYUN_NPC.dialogFramePath))
    this.load.image(VILLAGE_SHIP_KEY, assetPath(VILLAGE_SHIP_PATH))
    this.load.image(VILLAGE_PHOTO_BOOTH_KEY, assetPath(VILLAGE_PHOTO_BOOTH_PATH))
    this.load.image(VILLAGE_PHOTO_GALLERY_KEY, assetPath(VILLAGE_PHOTO_GALLERY_PATH))
    this.load.image(VILLAGE_GOMOKU_BOARD_KEY, assetPath(VILLAGE_GOMOKU_BOARD_PATH))
    this.load.image(JEONGHO_ANGRY_KEY, assetPath(JEONGHO_ANGRY_PATH))
    this.load.spritesheet('sehyun', assetPath('images/npcs/sehyun/sprite.png'), {
      frameWidth: 313,
      frameHeight: 313,
      margin: 1,
      spacing: 0,
    })
    loadPlayerSpritesheets(this)
  }

  create(data: VillageSceneData = {}) {
    playSceneBgm(this)
    const { width: vw, height: vh } = this.scale
    this.isTransitioning = false
    this.target = null
    this.villageNpcs = []
    this.obstacleManager?.destroy()
    this.obstacleManager = undefined
    this.minimap?.container.destroy()
    this.minimap = null
    this.settingsHint?.destroy()
    this.settingsHint = null
    this.controlTutorialTimer?.remove(false)
    this.controlTutorialTimer = undefined
    this.controlTutorial?.destroy(true)
    this.controlTutorial = null
    this.fuelNotice?.container.destroy()
    this.fuelNotice = null
    this.isFuelNoticeOpen = false
    this.hasPendingFuelNotice = false
    this.isFuelInboxNoticeRequestPending = false
    this.currentFuelNoticeSignature = ''
    this.fuelNoticePoll?.remove(false)
    this.fuelNoticePoll = undefined
    this.dialogs.clear()
    this.isVillagerDialogueOpen = false
    this.isGomokuOpen = false
    this.isPhotoGalleryOpen = false
    this.activeDialogNpcId = null
    this.jeonghoFieldWarningBubble?.container.destroy(true)
    this.jeonghoFieldWarningBubble = null
    this.jeonghoFieldEnteredAt = null
    this.jeonghoFieldWarningZone = undefined
    this.nearestNpcId = null
    this.portalCooldownUntil = this.time.now + (data.portalCooldownMs ?? 0)
    this.worldInteractionCooldownUntil = this.time.now + (data.portalCooldownMs ?? 0)

    const firstTile = this.textures.get(MAP_TILE_KEYS[0].key).getSourceImage() as HTMLImageElement
    const rawTileW = firstTile.width
    const rawTileH = firstTile.height
    const rawW = rawTileW * MAP_TILE_COLUMNS
    const rawH = rawTileH * MAP_TILE_ROWS
    const mapScale = Math.max(vw / rawW, vh / rawH) * 3

    const W = rawW * mapScale
    const H = rawH * mapScale

    MAP_TILE_KEYS.forEach(tile => {
      this.add
        .image(
          (tile.column + 0.5) * rawTileW * mapScale,
          (tile.row + 0.5) * rawTileH * mapScale,
          tile.key,
        )
        .setScale(mapScale)
        .setDepth(0)
    })
    createSceneWeatherLayer(this)

    this.physics.world.setBounds(0, 0, W, H)
    this.cameras.main.setBounds(0, 0, W, H)
    this.playerWasInPortal = createInitialVillagePortalState()
    this.portals = createVillagePortalRectangles(W, H)
    this.jeonghoFieldWarningZone = createRatioPolygon(JEONGHO_FIELD_WARNING_ZONE_POINTS, W, H)

    this.obstacles = this.physics.add.staticGroup()
    this.obstacleManager = new VillageObstacleManager(this, this.obstacles, W, H)
    this.obstacleManager.addInitialObstacles()

    VILLAGE_CHARACTERS.forEach(character => {
      const x = character.xRatio * W
      const y = character.yRatio * H
      const npc = this.add
        .image(x, y, character.key)
        .setOrigin(0.5, 1)
        .setScale(character.scale)
        .setDepth(4)
        .setInteractive({ useHandCursor: true })
      npc.on(
        'pointerdown',
        (
          _pointer: Phaser.Input.Pointer,
          _localX: number,
          _localY: number,
          event: Phaser.Types.Input.EventData,
        ) => {
          if (this.settingsMenu.isOpen()) return
          event.stopPropagation()
          this.tryOpenNpcDialogue(character.id)
        },
      )
      this.villageNpcs.push({ id: character.id, object: npc })

      const box = this.add.rectangle(x, y - 18, 48, 36, 0xff0000, 0).setDepth(1)
      this.physics.add.existing(box, true)
      this.obstacles.add(box)
    })

    this.add
      .image(VILLAGE_SHIP.xRatio * W, VILLAGE_SHIP.yRatio * H, VILLAGE_SHIP_KEY)
      .setOrigin(0.5, 1)
      .setScale(VILLAGE_SHIP.scale)
      .setDepth(3)

    this.photoBooth = this.add
      .image(
        VILLAGE_PHOTO_BOOTH.xRatio * W,
        VILLAGE_PHOTO_BOOTH.yRatio * H,
        VILLAGE_PHOTO_BOOTH_KEY,
      )
      .setOrigin(0.5, 1)
      .setScale(VILLAGE_PHOTO_BOOTH.scale)
      .setDepth(3)
      .setInteractive({ useHandCursor: true })
    this.photoBooth.on(
      'pointerdown',
      (
        _pointer: Phaser.Input.Pointer,
        _localX: number,
        _localY: number,
        event: Phaser.Types.Input.EventData,
      ) => {
        if (this.settingsMenu.isOpen()) return
        event.stopPropagation()
        if (!this.canStartWorldInteraction()) return
        this.enterPhotoBoothScene()
      },
    )
    this.isPhotoBoothInRange = false
    this.photoGallery = this.createPhotoGallery(W, H)
    this.isPhotoGalleryInRange = false
    this.gomokuBoard = this.createGomokuBoard(W, H)
    this.isGomokuBoardInRange = false

    ensurePlayerWalkAnimations(this)

    this.anims.create({
      key: 'sehyun-loop',
      frames: this.anims.generateFrameNumbers('sehyun', { start: 0, end: 3 }),
      frameRate: 3,
      repeat: -1,
    })
    this.sehyunNpc = this.add
      .sprite(SEHYUN_NPC_WORLD.xRatio * W, SEHYUN_NPC_WORLD.yRatio * H, 'sehyun')
      .setDepth(4)
    this.sehyunNpc.setScale(SEHYUN_NPC_WORLD.scale)
    this.sehyunNpc.setInteractive({ useHandCursor: true })
    this.sehyunNpc.on(
      'pointerdown',
      (
        _pointer: Phaser.Input.Pointer,
        _localX: number,
        _localY: number,
        event: Phaser.Types.Input.EventData,
      ) => {
        if (this.settingsMenu.isOpen()) return
        event.stopPropagation()
        this.tryOpenNpcDialogue(SEHYUN_NPC.id)
      },
    )
    this.sehyunNpc.anims.play('sehyun-loop')
    this.villageNpcs.push({ id: SEHYUN_NPC.id, object: this.sehyunNpc })

    const sehyunBox = this.add
      .rectangle(this.sehyunNpc.x, this.sehyunNpc.y + 10, 40, 30, 0xff0000, 0)
      .setDepth(1)
    this.physics.add.existing(sehyunBox, true)
    this.obstacles.add(sehyunBox)

    VILLAGE_CHARACTERS.forEach(character => {
      this.dialogs.set(
        character.id,
        this.createVillageDialog(
          villageDialogues[character.id].displayName,
          character.dialogFrameKey,
        ),
      )
    })
    this.dialogs.set(
      SEHYUN_NPC.id,
      this.createVillageDialog(
        villageDialogues[SEHYUN_NPC.id].displayName,
        SEHYUN_NPC.dialogFrameKey,
      ),
    )

    const spawn = data.spawn ?? DEFAULT_PLAYER_SPAWN
    this.player = createPlayer(this, W * spawn.xRatio, H * spawn.yRatio, { depth: 5 })
    this.lastSafePlayerPosition = new Phaser.Math.Vector2(this.player.x, this.player.y)

    this.physics.add.collider(this.player, this.obstacles)

    this.cameras.main.centerOn(this.player.x, this.player.y)
    this.cameras.main.startFollow(this.player, true, 1, 1)

    this.cursors = this.input.keyboard!.createCursorKeys()
    this.wasdKeys = this.input.keyboard!.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    }) as Partial<Record<PlayerDirection, Phaser.Input.Keyboard.Key>>
    this.settingsMenu = createSettingsMenu(this, {
      onLogout: () => this.logout(),
      onClose: () => this.blockWorldInteractionBriefly(),
      getPlayer: () => this.player,
    })
    this.interactionHint = new NpcInteractionHintUi(this)
    this.createVillageMinimap(W, H)
    this.createVillageFuelNotice()
    this.refreshVillageFixedUiAfterFontReady(W, H)
    void this.loadVillageFuelNoticeState()
    this.fuelNoticePoll = this.time.addEvent({
      delay: VILLAGE_FUEL_NOTICE_POLL_INTERVAL_MS,
      loop: true,
      callback: () => void this.loadVillageFuelNoticeState(),
    })
    window.addEventListener('focus', this.handleFuelNoticeFocus)
    document.addEventListener('visibilitychange', this.handleFuelNoticeFocus)

    this.input.keyboard!.on('keydown-ESC', () => {
      if (this.isVillagerDialogueOpen) {
        this.hideDialog(true)
        return
      }
      if (this.isPhotoGalleryOpen) return
      this.settingsMenu.toggleButton()
    })

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.controlTutorial) {
        this.hideVillageControlTutorial()
        return
      }

      if (this.settingsMenu.isOpen()) {
        return
      }

      if (this.handleFuelNoticePointerDown(pointer)) {
        return
      }

      if (this.handleMinimapPointerDown(pointer)) {
        return
      }

      if (this.emojiPalette?.consumePointerDown(pointer)) {
        return
      }

      if (this.obstacleManager?.handlePointerDown(pointer)) {
        return
      }

      if (this.isVillagerDialogueOpen) {
        return
      }

      if (this.isPolygonObstacleTarget(pointer.worldX, pointer.worldY)) {
        return
      }

      this.target = new Phaser.Math.Vector2(pointer.worldX, pointer.worldY)
      createClickTargetMarker(this, pointer.worldX, pointer.worldY)
    })
    this.input.on('pointermove', this.handleObstacleEditorPointerMove, this)
    this.input.on('pointermove', this.handleMinimapPointerMove, this)
    this.input.on('pointerup', this.handleObstacleEditorPointerUp, this)
    this.input.mouse?.disableContextMenu()
    this.input.keyboard!.on('keydown-E', this.handleNpcInteract, this)
    this.input.keyboard!.on('keydown-ENTER', this.handleNpcInteract, this)
    this.input.keyboard!.on('keydown-R', this.clearEditedObstacleRects, this)
    this.input.keyboard!.on('keydown-BACKSPACE', this.undoObstaclePolygonPoint, this)

    this.cameras.main.fadeIn(400, 0, 0, 0)
    this.villageRealtime = attachVillageRealtime({
      scene: this,
      worldWidth: W,
      worldHeight: H,
      roomId: 'village.default',
    })
    this.villageBots = new VillageBotsController({
      scene: this,
      worldWidth: W,
      worldHeight: H,
      obstacleQuery: this.obstacleManager ?? null,
    })
    this.villageBots.start()
    const villageBotColliders = this.villageBots.getPhysicsGroup()
    // Bots are ambient crowd actors, so they should not block the local player.
    this.physics.add.collider(villageBotColliders, this.obstacles)
    this.emojiPalette = createVillageEmojiPalette(this, {
      onSelect: emoji => {
        if (this.isEmojiOverlayOpen()) return
        if (isWhiteBeltBoastEmoji(emoji)) {
          emitEmoteBubble(this, this.player, WHITE_BELT_PROMOTION_GUIDE_MESSAGE, 100)
          return
        }

        if (!this.villageRealtime?.publishEmote(emoji)) return
        // 로컬 즉시 렌더로 latency 가림. 서버 echo 는 RemotePlayersGroup 가 localUserId 필터링으로 무시.
        emitEmoteBubble(this, this.player, emoji, 100)
      },
    })
    this.disposeEmojiBeltSync = syncCurrentBeltEmojiToPalette(this.emojiPalette)
    this.emojiPaletteManuallyShown = false
    // 팔레트는 기본 숨김 → 단축키를 모른 사용자가 발견할 수 있도록 우하단 고정 힌트. 팔레트가 열리면 위로 띄워 닫기 버튼으로 유지.
    this.emojiHint = this.add
      .text(vw - 18, vh - 18, EMOJI_HINT_TEXT, {
        fontSize: '14px',
        fontFamily: "'Jua', 'Apple SD Gothic Neo', sans-serif",
        color: '#ffffff',
        backgroundColor: '#00000080',
        padding: { left: 8, right: 8, top: 4, bottom: 4 },
        resolution: 2,
      })
      .setOrigin(1, 1)
      .setScrollFactor(0)
      .setDepth(100)
      .setInteractive({ useHandCursor: true })
    this.emojiHint.on(
      'pointerdown',
      (
        _pointer: Phaser.Input.Pointer,
        _localX: number,
        _localY: number,
        event: Phaser.Types.Input.EventData,
      ) => {
        event.stopPropagation()
        if (this.isEmojiOverlayOpen()) return
        this.emojiPaletteManuallyShown = !this.emojiPaletteManuallyShown
      },
    )
    this.createVillageSettingsHint()
    this.showVillageControlTutorial(data.spawn === undefined)
    // 1\~9 + 0 단축키. 인덱스 0\~9 매핑. 팔레트가 숨겨져 있어도 발사 가능 (학습용 토글 vs 즉시 발사 분리).
    const emojiKeyNames = [
      'ONE',
      'TWO',
      'THREE',
      'FOUR',
      'FIVE',
      'SIX',
      'SEVEN',
      'EIGHT',
      'NINE',
      'ZERO',
    ] as const
    emojiKeyNames.forEach((name, index) => {
      if (index >= VILLAGE_EMOJI_SLOT_COUNT) return
      this.input.keyboard?.on(`keydown-${name}`, () => {
        if (this.isEmojiOverlayOpen()) return
        this.emojiPalette?.triggerByIndex(index)
      })
    })
    // Q 키 — 팔레트 토글. 다이얼로그/설정 패널 열려있으면 무시.
    this.input.keyboard?.on('keydown-Q', () => {
      if (this.isEmojiOverlayOpen()) return
      this.emojiPaletteManuallyShown = !this.emojiPaletteManuallyShown
    })
    this.game.events.on('villager-dialogue:closed', this.handleVillagerDialogueClosed, this)
    this.game.events.on('villager-dialogue:text', this.handleVillagerDialogueText, this)
    this.game.events.on('gomoku:closed', this.handleGomokuClosed, this)
    this.game.events.on('photo-gallery:closed', this.handlePhotoGalleryClosed, this)
    // photo-booth FrameSelect 가 pause 해뒀던 마을을 resume 시켜 돌아올 때 isTransitioning 해제.
    // 안 풀면 update 의 transitioning 가드에 걸려 입력이 죽음.
    this.events.on(Phaser.Scenes.Events.RESUME, () => {
      this.isTransitioning = false
      this.blockWorldInteractionBriefly()
    })
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off(Phaser.Scenes.Events.RESUME)
      this.game.events.off('villager-dialogue:closed', this.handleVillagerDialogueClosed, this)
      this.game.events.off('villager-dialogue:text', this.handleVillagerDialogueText, this)
      this.game.events.off('gomoku:closed', this.handleGomokuClosed, this)
      this.game.events.off('photo-gallery:closed', this.handlePhotoGalleryClosed, this)
      this.input.off('pointermove', this.handleObstacleEditorPointerMove, this)
      this.input.off('pointerup', this.handleObstacleEditorPointerUp, this)
      this.input.keyboard?.off('keydown-E', this.handleNpcInteract, this)
      this.input.keyboard?.off('keydown-ENTER', this.handleNpcInteract, this)
      this.input.keyboard?.off('keydown-R', this.clearEditedObstacleRects, this)
      this.input.keyboard?.off('keydown-BACKSPACE', this.undoObstaclePolygonPoint, this)
      this.villageRealtime?.destroy()
      this.villageRealtime = null
      this.villageBots?.destroy()
      this.villageBots = null
      this.disposeEmojiBeltSync?.()
      this.disposeEmojiBeltSync = null
      this.emojiPalette?.destroy()
      this.emojiPalette = null
      this.emojiHint?.destroy()
      this.emojiHint = null
      this.settingsHint?.destroy()
      this.settingsHint = null
      this.controlTutorialTimer?.remove(false)
      this.controlTutorialTimer = undefined
      this.controlTutorial?.destroy(true)
      this.controlTutorial = null
      this.minimap?.container.destroy()
      this.minimap = null
      this.fuelNoticePoll?.remove(false)
      this.fuelNoticePoll = undefined
      window.removeEventListener('focus', this.handleFuelNoticeFocus)
      document.removeEventListener('visibilitychange', this.handleFuelNoticeFocus)
      this.fuelNotice?.container.destroy()
      this.fuelNotice = null
      this.jeonghoFieldWarningBubble?.container.destroy(true)
      this.jeonghoFieldWarningBubble = null
      this.jeonghoFieldEnteredAt = null
      this.jeonghoFieldWarningZone = undefined
    })
  }

  private isEmojiOverlayOpen() {
    return (
      this.isVillagerDialogueOpen ||
      this.settingsMenu.isOpen() ||
      this.isGomokuOpen ||
      this.isPhotoGalleryOpen
    )
  }

  update(_time: number, delta: number) {
    const movement = updatePlayerMovement({
      player: this.player,
      cursors: this.cursors,
      alternativeKeys: this.wasdKeys,
      target: this.target,
      lastDirection: this.lastDirection,
      speed: getPlayerMoveSpeed(),
      blocked:
        this.isVillagerDialogueOpen ||
        Boolean(this.controlTutorial) ||
        this.settingsMenu.isOpen() ||
        this.isGomokuOpen ||
        this.isPhotoGalleryOpen,
    })
    this.target = movement.target
    this.lastDirection = movement.lastDirection
    this.updateJeonghoFieldWarning(delta)
    this.preventPolygonObstaclePenetration(delta)
    this.resolvePolygonObstacleCollision()
    this.villageBots?.update(delta)

    this.villageRealtime?.publishLocal(this.player, this.lastDirection, movement.moving)
    const overlaysOpen = this.isEmojiOverlayOpen()
    const paletteVisible = this.emojiPaletteManuallyShown && !overlaysOpen
    this.emojiPalette?.setVisible(paletteVisible)
    this.emojiHint
      ?.setText(paletteVisible ? EMOJI_HINT_OPEN_TEXT : EMOJI_HINT_TEXT)
      .setY(
        paletteVisible ? this.scale.height - 18 - EMOJI_HINT_OPEN_OFFSET_Y : this.scale.height - 18,
      )
      .setVisible(!overlaysOpen)
    this.settingsHint?.setVisible(!overlaysOpen)
    this.controlTutorial?.setVisible(!overlaysOpen)
    this.layoutVillageControlTutorial()
    this.minimap?.container.setVisible(!overlaysOpen)
    this.refreshVillageFuelNoticeUi(!overlaysOpen)
    this.updateVillageMinimap()

    const nearestNpc = this.getNearestNpcInTalkDistance()
    const photoBoothDistance = this.getPhotoBoothDistance()
    const photoGalleryDistance = this.getPhotoGalleryDistance()
    const gomokuBoardDistance = this.getGomokuBoardDistance()
    const npcDistance = nearestNpc
      ? Phaser.Math.Distance.Between(
          this.player.x,
          this.player.y,
          nearestNpc.object.x,
          nearestNpc.object.y,
        )
      : Number.POSITIVE_INFINITY
    const photoBoothInRange = photoBoothDistance < PHOTO_BOOTH_INTERACT_DISTANCE
    const photoGalleryInRange = photoGalleryDistance < PHOTO_GALLERY_INTERACT_DISTANCE
    const gomokuBoardInRange = gomokuBoardDistance < GOMOKU_BOARD_INTERACT_DISTANCE
    let nearestAction: 'npc' | 'photo' | 'gallery' | 'gomoku' | null = nearestNpc ? 'npc' : null
    let nearestActionDistance = npcDistance

    if (photoBoothInRange && photoBoothDistance < nearestActionDistance) {
      nearestAction = 'photo'
      nearestActionDistance = photoBoothDistance
    }

    if (photoGalleryInRange && photoGalleryDistance < nearestActionDistance) {
      nearestAction = 'gallery'
      nearestActionDistance = photoGalleryDistance
    }

    if (gomokuBoardInRange && gomokuBoardDistance < nearestActionDistance) {
      nearestAction = 'gomoku'
    }

    this.nearestNpcId = nearestAction === 'npc' ? (nearestNpc?.id ?? null) : null
    this.isPhotoBoothInRange = nearestAction === 'photo'
    this.isPhotoGalleryInRange = nearestAction === 'gallery'
    this.isGomokuBoardInRange = nearestAction === 'gomoku'
    this.updateInteractionHint(nearestAction === 'npc' ? nearestNpc : null)

    if (!nearestNpc) {
      this.dialogDismissed = false
      if (this.isVillagerDialogueOpen) {
        this.hideDialog(false)
      }
    }

    this.updateThemePortalTransitions()
  }

  private createVillageSettingsHint() {
    this.settingsHint?.destroy()
    this.settingsHint = this.add
      .text(18, 18, SETTINGS_HINT_TEXT, {
        fontSize: '14px',
        fontFamily: "'Jua', 'Apple SD Gothic Neo', sans-serif",
        color: '#ffffff',
        backgroundColor: '#00000080',
        padding: { left: 8, right: 8, top: 4, bottom: 4 },
        resolution: 2,
      })
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(100)
      .setInteractive({ useHandCursor: true })

    this.settingsHint.on(
      'pointerdown',
      (
        _pointer: Phaser.Input.Pointer,
        _localX: number,
        _localY: number,
        event: Phaser.Types.Input.EventData,
      ) => {
        event.stopPropagation()
        if (this.isEmojiOverlayOpen()) return
        this.settingsMenu.toggleButton()
      },
    )
  }

  private showVillageControlTutorial(shouldShow: boolean) {
    setStoredFlag(LEGACY_INTERACTION_TUTORIAL_KEY)
    if (!shouldShow) return

    const width = Phaser.Math.Clamp(this.scale.width - 44, 320, 456)
    const height = Phaser.Math.Clamp(this.scale.height - 44, 320, 342)
    const container = this.add
      .container(this.scale.width / 2 - width / 2, this.scale.height / 2 - height / 2)
      .setDepth(102)
      .setScrollFactor(0)
      .setSize(width, height)
      .setAlpha(0)
      .setInteractive(
        new Phaser.Geom.Rectangle(0, 0, width, height),
        Phaser.Geom.Rectangle.Contains,
      )

    const bg = this.add.graphics()
    this.drawVillageControlTutorialPanel(bg, width, height)

    const title = this.add
      .text(width / 2, 28, '조작법 안내', {
        fontFamily: "'Jua', 'Apple SD Gothic Neo', sans-serif",
        fontSize: '26px',
        color: '#fff8e7',
        align: 'center',
        resolution: 2,
      })
      .setOrigin(0.5)

    const subtitle = this.add
      .text(width / 2, 59, '마을에서 사용할 수 있는 기본 조작이에요', {
        fontFamily: 'Pretendard, "Noto Sans KR", sans-serif',
        fontSize: '15px',
        fontStyle: '800',
        color: '#d8c7ad',
        align: 'center',
        resolution: 2,
      })
      .setOrigin(0.5)

    const rows = [
      this.createVillageControlTutorialRow(width, 'WASD / 방향키', '이동', 106),
      this.createVillageControlTutorialRow(width, '마우스 클릭', '원하는 곳으로 이동', 146),
      this.createVillageControlTutorialRow(width, 'E', '상호작용', 186),
      this.createVillageControlTutorialRow(width, 'Q', '이모티콘', 226),
      this.createVillageControlTutorialRow(width, 'ESC', '설정과 의상 변경', 266),
    ].flat()

    const closeText = this.add
      .text(width / 2, height - 26, '클릭하면 닫혀요', {
        fontFamily: 'Pretendard, "Noto Sans KR", sans-serif',
        fontSize: '14px',
        fontStyle: '800',
        color: '#b8aa96',
        align: 'center',
        resolution: 2,
      })
      .setOrigin(0.5)

    container.add([bg, title, subtitle, ...rows, closeText])

    container.on(
      'pointerdown',
      (
        _pointer: Phaser.Input.Pointer,
        _localX: number,
        _localY: number,
        event: Phaser.Types.Input.EventData,
      ) => {
        event.stopPropagation()
        this.hideVillageControlTutorial()
      },
    )

    this.controlTutorial = container
    this.layoutVillageControlTutorial()
    this.tweens.add({
      targets: container,
      alpha: 1,
      duration: 180,
      ease: 'Sine.easeOut',
    })
    this.controlTutorialTimer = this.time.delayedCall(VILLAGE_CONTROL_TUTORIAL_DURATION_MS, () =>
      this.hideVillageControlTutorial(),
    )
  }

  private drawVillageControlTutorialPanel(
    bg: Phaser.GameObjects.Graphics,
    width: number,
    height: number,
  ) {
    bg.clear()
    bg.fillStyle(0x000000, 0.22)
    bg.fillRoundedRect(5, 7, width, height, 18)
    bg.fillStyle(0x241d19, 0.94)
    bg.fillRoundedRect(0, 0, width, height, 18)
    bg.lineStyle(2, 0xffefd0, 0.78)
    bg.strokeRoundedRect(1, 1, width - 2, height - 2, 17)
    bg.lineStyle(1, 0xffffff, 0.18)
    bg.strokeRoundedRect(8, 8, width - 16, height - 16, 13)
  }

  private createVillageControlTutorialRow(width: number, key: string, label: string, y: number) {
    const keyWidth = width < 380 ? 104 : 118
    const keyX = 28
    const keyCenterX = keyX + keyWidth / 2
    const labelX = keyX + keyWidth + 18
    const fontSize = width < 380 ? '16px' : '17px'
    const keyBg = this.add.graphics()
    keyBg.fillStyle(0x7b61ff, 1)
    keyBg.fillRoundedRect(keyX, y - 15, keyWidth, 30, 8)
    keyBg.lineStyle(1.4, 0xffffff, 0.38)
    keyBg.strokeRoundedRect(keyX + 0.5, y - 14.5, keyWidth - 1, 29, 7)

    const keyText = this.add
      .text(keyCenterX, y, key, {
        fontFamily: 'Pretendard, "Noto Sans KR", sans-serif',
        fontSize,
        fontStyle: '900',
        color: '#ffffff',
        resolution: 2,
      })
      .setOrigin(0.5)

    const labelText = this.add
      .text(labelX, y, label, {
        fontFamily: 'Pretendard, "Noto Sans KR", sans-serif',
        fontSize,
        fontStyle: '800',
        color: '#fff4dc',
        wordWrap: { width: width - labelX - 28 },
        resolution: 2,
      })
      .setOrigin(0, 0.5)

    return [keyBg, keyText, labelText] as const
  }

  private hideVillageControlTutorial() {
    if (!this.controlTutorial) return

    this.controlTutorialTimer?.remove(false)
    this.controlTutorialTimer = undefined

    const tutorial = this.controlTutorial
    this.controlTutorial = null
    this.tweens.add({
      targets: tutorial,
      alpha: 0,
      duration: 160,
      ease: 'Sine.easeIn',
      onComplete: () => tutorial.destroy(true),
    })
  }

  private layoutVillageControlTutorial() {
    if (!this.controlTutorial) return

    const width = this.controlTutorial.width || 456
    const height = this.controlTutorial.height || 342
    this.controlTutorial.setPosition(
      this.scale.width / 2 - width / 2,
      this.scale.height / 2 - height / 2,
    )
  }

  private createVillageMinimap(worldWidth: number, worldHeight: number) {
    this.setHoveredMinimapMarker(null)
    if (this.isMinimapCollapsed) {
      this.createCollapsedVillageMinimap(worldWidth, worldHeight)
      return
    }

    const basePanelWidth = Phaser.Math.Clamp(
      this.scale.width * VILLAGE_MINIMAP.widthRatio,
      VILLAGE_MINIMAP.minWidth,
      VILLAGE_MINIMAP.maxWidth,
    )
    const zoom = VILLAGE_MINIMAP_ZOOM_LEVELS[this.minimapZoomIndex] ?? 1
    const panelWidth = Math.min(
      this.scale.width - VILLAGE_MINIMAP.marginX * 2,
      basePanelWidth * zoom,
    )
    const mapWidth = panelWidth - VILLAGE_MINIMAP.padding * 2
    const mapHeight = mapWidth / (worldWidth / worldHeight)
    const panelHeight = VILLAGE_MINIMAP.headerHeight + mapHeight + VILLAGE_MINIMAP.padding + 12
    const mapX = VILLAGE_MINIMAP.padding
    const mapY = VILLAGE_MINIMAP.headerHeight

    const panelX = this.scale.width - panelWidth - VILLAGE_MINIMAP.marginX
    const container = this.add
      .container(panelX, VILLAGE_MINIMAP.marginY)
      .setDepth(VILLAGE_MINIMAP.depth)
      .setScrollFactor(0)
      .setSize(panelWidth, panelHeight)

    const background = this.add.graphics()
    background.fillStyle(0xfffcf3, 0.94)
    background.fillRoundedRect(0, 0, panelWidth, panelHeight, 14)
    background.lineStyle(3, 0xb8a36f, 0.9)
    background.strokeRoundedRect(1.5, 1.5, panelWidth - 3, panelHeight - 3, 13)
    background.lineStyle(1, 0xffffff, 0.85)
    background.strokeRoundedRect(6, 6, panelWidth - 12, panelHeight - 12, 10)
    background.fillStyle(0xfffbef, 0.9)
    background.fillRoundedRect(mapX, mapY, mapWidth, mapHeight, 10)

    const tileWidth = mapWidth / MAP_TILE_COLUMNS
    const tileHeight = mapHeight / MAP_TILE_ROWS
    const mapTiles = MAP_TILE_KEYS.map(tile =>
      this.add
        .image(mapX + tile.column * tileWidth, mapY + tile.row * tileHeight, tile.key)
        .setOrigin(0, 0)
        .setDisplaySize(tileWidth + 0.5, tileHeight + 0.5)
        .setAlpha(0.88),
    )

    const mapOverlay = this.add.graphics()
    mapOverlay.lineStyle(1, 0xffffff, 0.28)
    for (let index = 1; index < MAP_TILE_COLUMNS; index += 1) {
      const x = mapX + (mapWidth / MAP_TILE_COLUMNS) * index
      mapOverlay.lineBetween(x, mapY + 2, x, mapY + mapHeight - 2)
    }
    for (let index = 1; index < MAP_TILE_ROWS; index += 1) {
      const y = mapY + (mapHeight / MAP_TILE_ROWS) * index
      mapOverlay.lineBetween(mapX + 2, y, mapX + mapWidth - 2, y)
    }
    mapOverlay.lineStyle(2.2, 0xd7c79a, 0.95)
    mapOverlay.strokeRoundedRect(mapX, mapY, mapWidth, mapHeight, 10)
    mapOverlay.lineStyle(1, 0xffffff, 0.65)
    mapOverlay.strokeRoundedRect(mapX + 3, mapY + 3, mapWidth - 6, mapHeight - 6, 8)

    const title = this.add
      .text(panelWidth / 2, 10, '지도', {
        fontSize: '20px',
        fontFamily: "'Jua', 'Apple SD Gothic Neo', sans-serif",
        color: '#4f4431',
        align: 'center',
        resolution: 2,
      })
      .setOrigin(0.5, 0)

    const cameraRect = this.add.graphics()
    container.add([background, ...mapTiles, mapOverlay, title, cameraRect])
    const zoomOutBounds = this.createMinimapZoomButton(container, panelWidth - 57, 21, '-', -1)
    const zoomInBounds = this.createMinimapZoomButton(container, panelWidth - 27, 21, '+', 1)

    const themeMarkers: VillageMinimapMarker[] = VILLAGE_THEME_PORTALS.filter(
      portal => portal.key !== 'ferry',
    ).map(portal => ({
      key: portal.key,
      label: VILLAGE_MINIMAP_THEME_LABELS[portal.key],
      xRatio: portal.xRatio,
      yRatio: portal.yRatio,
      // 포털 사각형 내부 중앙 좌표. teleport 시 didEnter 가 다음 update 에서 true 가 되도록 보장.
      targetXRatio: portal.xRatio + portal.widthRatio / 2,
      targetYRatio: portal.yRatio + portal.heightRatio / 2,
      color: 0xf2b65a,
      radius: 5.5,
    }))
    const ferryPortal = VILLAGE_THEME_PORTALS.find(portal => portal.key === 'ferry')
    const photoXRatio = (VILLAGE_PHOTO_BOOTH.xRatio + VILLAGE_PHOTO_GALLERY.xRatio) / 2
    const photoYRatio = (VILLAGE_PHOTO_BOOTH.yRatio + VILLAGE_PHOTO_GALLERY.yRatio) / 2
    const gomokuXRatio = this.gomokuBoard
      ? this.gomokuBoard.x / worldWidth
      : VILLAGE_GOMOKU_BOARD.xRatio
    const gomokuYRatio = this.gomokuBoard
      ? this.gomokuBoard.y / worldHeight
      : VILLAGE_GOMOKU_BOARD.yRatio
    const facilityMarkers: VillageMinimapMarker[] = [
      {
        key: 'photo',
        label: '사진',
        xRatio: photoXRatio,
        yRatio: photoYRatio,
        targetXRatio: photoXRatio,
        targetYRatio: photoYRatio,
        color: 0x6fc6c7,
        radius: 5,
      },
      {
        key: 'gomoku',
        label: '오목',
        xRatio: gomokuXRatio,
        yRatio: gomokuYRatio,
        targetXRatio: gomokuXRatio,
        targetYRatio: gomokuYRatio,
        color: 0x7dc36b,
        radius: 5,
      },
      {
        key: 'ship',
        label: '별빛 항구',
        xRatio: VILLAGE_SHIP.xRatio,
        yRatio: VILLAGE_SHIP.yRatio,
        // 배 시각 위치는 ferry 포털 밖이라, 클릭 시엔 ferry 포털 중앙으로 텔레포트하여 즉시 항구로 진입.
        targetXRatio: ferryPortal
          ? ferryPortal.xRatio + ferryPortal.widthRatio / 2
          : VILLAGE_SHIP.xRatio,
        targetYRatio: ferryPortal
          ? ferryPortal.yRatio + ferryPortal.heightRatio / 2
          : VILLAGE_SHIP.yRatio,
        color: 0x9d8bd7,
        radius: 5,
      },
    ]

    const minimapMarkers = [...themeMarkers, ...facilityMarkers]
    const markerHits: VillageMinimapMarkerHit[] = []
    const hitSize = 30
    minimapMarkers.forEach(marker => {
      const offset = VILLAGE_MINIMAP_MARKER_OFFSETS[marker.key]
      const adjustedXRatio = Phaser.Math.Clamp(marker.xRatio + offset.xRatio, 0, 1)
      const adjustedYRatio = Phaser.Math.Clamp(marker.yRatio + offset.yRatio, 0, 1)
      const x = mapX + adjustedXRatio * mapWidth
      const y = mapY + adjustedYRatio * mapHeight
      const labelOnLeft = x > mapX + mapWidth * 0.76
      const labelX = labelOnLeft ? x - 10 : x + 10
      const labelY = Phaser.Math.Clamp(y, mapY + 13, mapY + mapHeight - 13)
      const dot = this.add
        .circle(x, y, marker.radius, marker.color, 0.96)
        .setStrokeStyle(2, 0xffffff, 0.98)
      const label = this.add
        .text(labelX, labelY, marker.label, {
          fontSize: '12px',
          fontFamily: "'Jua', 'Apple SD Gothic Neo', sans-serif",
          color: '#3f3526',
          stroke: '#fffaf0',
          strokeThickness: 5,
          resolution: 2,
        })
        .setOrigin(labelOnLeft ? 1 : 0, 0.5)
      container.add([dot, label])
      markerHits.push({
        bounds: new Phaser.Geom.Rectangle(x - hitSize / 2, y - hitSize / 2, hitSize, hitSize),
        worldX: marker.targetXRatio * worldWidth,
        worldY: marker.targetYRatio * worldHeight,
        dot,
      })
    })

    const playerDot = this.add.circle(0, 0, 7, 0xff6f76, 1).setStrokeStyle(2.5, 0xffffff, 1)
    container.add(playerDot)

    this.minimap = {
      container,
      collapsed: false,
      cameraRect,
      playerDot,
      zoomOutBounds,
      zoomInBounds,
      markerHits,
      worldWidth,
      worldHeight,
      mapX,
      mapY,
      mapWidth,
      mapHeight,
    }
    this.updateVillageMinimap()
    this.refreshVillageFuelNoticePosition()
  }

  private createCollapsedVillageMinimap(worldWidth: number, worldHeight: number) {
    const width = 74
    const height = 76
    const panelX = this.scale.width - width - VILLAGE_MINIMAP.marginX
    const container = this.add
      .container(panelX, VILLAGE_MINIMAP.marginY)
      .setDepth(VILLAGE_MINIMAP.depth)
      .setScrollFactor(0)
      .setSize(width, height)

    const icon = this.add.graphics()
    icon.fillStyle(0x000000, 0.16)
    icon.fillEllipse(38, 48, 54, 12)
    icon.fillStyle(0x95d7e8, 1)
    icon.fillRoundedRect(8, 13, 9, 43, 4)
    icon.fillStyle(0x7ec4d4, 1)
    icon.fillRoundedRect(14, 10, 6, 47, 3)
    icon.fillStyle(0xbee4c4, 1)
    icon.beginPath()
    icon.moveTo(18, 13)
    icon.lineTo(34, 8)
    icon.lineTo(49, 13)
    icon.lineTo(65, 9)
    icon.lineTo(62, 53)
    icon.lineTo(45, 57)
    icon.lineTo(30, 52)
    icon.lineTo(16, 57)
    icon.closePath()
    icon.fillPath()
    icon.fillStyle(0x83bd6a, 1)
    icon.beginPath()
    icon.moveTo(20, 14)
    icon.lineTo(34, 9)
    icon.lineTo(30, 24)
    icon.lineTo(45, 21)
    icon.lineTo(55, 29)
    icon.lineTo(48, 38)
    icon.lineTo(62, 45)
    icon.lineTo(62, 53)
    icon.lineTo(45, 57)
    icon.lineTo(31, 52)
    icon.lineTo(18, 56)
    icon.lineTo(21, 42)
    icon.lineTo(16, 32)
    icon.closePath()
    icon.fillPath()
    icon.fillStyle(0x8ad2df, 1)
    icon.beginPath()
    icon.moveTo(18, 24)
    icon.lineTo(34, 30)
    icon.lineTo(50, 25)
    icon.lineTo(64, 28)
    icon.lineTo(63, 45)
    icon.lineTo(49, 40)
    icon.lineTo(34, 45)
    icon.lineTo(18, 39)
    icon.closePath()
    icon.fillPath()
    icon.lineStyle(3, 0xd9a343, 1)
    icon.beginPath()
    icon.moveTo(26, 42)
    icon.lineTo(35, 35)
    icon.lineTo(45, 37)
    icon.lineTo(52, 29)
    icon.lineTo(59, 30)
    icon.strokePath()
    icon.fillStyle(0xf09b36, 1)
    icon.fillCircle(25, 42, 5)
    icon.lineStyle(1.5, 0xffffff, 0.75)
    icon.strokeCircle(25, 42, 5)
    icon.fillStyle(0xf05c93, 1)
    icon.fillCircle(59, 30, 4.6)
    icon.strokeCircle(59, 30, 4.6)
    icon.lineStyle(2, 0x6a9f58, 0.55)
    icon.lineBetween(35, 9, 31, 52)
    icon.lineBetween(50, 14, 46, 57)

    const label = this.add
      .text(width / 2, 60, '지도', {
        fontSize: '16px',
        fontFamily: "'Jua', 'Apple SD Gothic Neo', sans-serif",
        color: '#4f4431',
        stroke: '#fff8e8',
        strokeThickness: 4,
        resolution: 2,
      })
      .setOrigin(0.5, 0)
    container.add([icon, label])

    this.minimap = {
      container,
      collapsed: true,
      mapIconBounds: new Phaser.Geom.Rectangle(0, 0, width, height),
      worldWidth,
      worldHeight,
    }
    this.refreshVillageFuelNoticePosition()
  }

  private createVillageFuelNotice() {
    const width = 74
    const height = 76
    const container = this.add
      .container(0, VILLAGE_MINIMAP.marginY)
      .setDepth(VILLAGE_MINIMAP.depth)
      .setScrollFactor(0)
      .setSize(width, height)

    const icon = this.add.graphics()
    icon.fillStyle(0x000000, 0.16)
    icon.fillEllipse(38, 51, 58, 12)
    icon.fillStyle(0xfffefa, 1)
    icon.fillRoundedRect(8, 15, 58, 40, 8)
    icon.lineStyle(3, 0x8f7c54, 0.95)
    icon.strokeRoundedRect(8, 15, 58, 40, 8)
    icon.lineStyle(2.8, 0x8f7c54, 0.95)
    icon.lineBetween(12, 18, 38, 40)
    icon.lineBetween(62, 18, 38, 40)
    icon.lineBetween(12, 52, 32, 37)
    icon.lineBetween(62, 52, 44, 37)

    const noticeDot = this.add.circle(62, 15, 6, 0xff6f76, 1).setStrokeStyle(2, 0xffffff, 0.95)
    const label = this.add
      .text(width / 2, 60, '메시지', {
        fontSize: '16px',
        fontFamily: "'Jua', 'Apple SD Gothic Neo', sans-serif",
        color: '#4f4431',
        stroke: '#fff8e8',
        strokeThickness: 4,
        resolution: 2,
      })
      .setOrigin(0.5, 0)
    const popupUi = this.createVillageFuelNoticePopup()
    popupUi.popup.setVisible(false)

    container.add([icon, noticeDot, label, popupUi.popup])

    this.fuelNotice = {
      container,
      iconBounds: new Phaser.Geom.Rectangle(0, 0, width, height),
      popupBounds: new Phaser.Geom.Rectangle(0, 0, popupUi.width, popupUi.height),
      confirmBounds: popupUi.confirmBounds,
      popup: popupUi.popup,
    }
    this.refreshVillageFuelNoticePosition()
    this.refreshVillageFuelNoticeUi()
  }

  private createVillageFuelNoticePopup() {
    const width = Math.min(
      VILLAGE_FUEL_NOTICE_POPUP.designWidth,
      Math.max(286, this.scale.width - 32),
    )
    const ui = width / VILLAGE_FUEL_NOTICE_POPUP.designWidth
    const height = VILLAGE_FUEL_NOTICE_POPUP.designHeight * ui
    const popup = this.add.container(0, 0).setSize(width, height)

    const panel = this.add.graphics()
    drawVillageFuelNoticePanelSurface(panel, width, height, ui)

    const title = this.add
      .text(width / 2, 24 * ui, '별빛 우편함', {
        fontFamily: VILLAGE_NOTICE_FONT_FAMILY,
        fontSize: `${Math.round(24 * ui)}px`,
        fontStyle: '800',
        color: VILLAGE_FUEL_NOTICE_COLORS.title,
        align: 'center',
        resolution: 2,
      })
      .setOrigin(0.5, 0)
    const subText = this.add
      .text(width / 2, 61 * ui, '별빛 에너지가 도착했어요', {
        fontFamily: VILLAGE_NOTICE_FONT_FAMILY,
        fontSize: `${Math.round(15 * ui)}px`,
        fontStyle: '700',
        color: VILLAGE_FUEL_NOTICE_COLORS.muted,
        align: 'center',
        resolution: 2,
      })
      .setOrigin(0.5, 0)

    const messageBox = this.add.graphics()
    drawVillageFuelNoticeMessageBox(messageBox, 24 * ui, 96 * ui, 312 * ui, 84 * ui, ui)
    const messageText = this.add
      .text(width / 2, 138 * ui, '별빛 항구에 가서 확인해보자', {
        fontFamily: VILLAGE_NOTICE_FONT_FAMILY,
        fontSize: `${Math.round(19 * ui)}px`,
        fontStyle: '800',
        color: VILLAGE_FUEL_NOTICE_COLORS.text,
        align: 'center',
        wordWrap: { width: 280 * ui },
        resolution: 2,
      })
      .setOrigin(0.5)

    const buttonWidth = 312 * ui
    const buttonHeight = 40 * ui
    const buttonY = 222 * ui
    const buttonBg = this.add.graphics()
    drawVillageFuelNoticeButton(buttonBg, width / 2, buttonY, buttonWidth, buttonHeight, ui)
    const buttonText = this.add
      .text(width / 2, buttonY, '확인', {
        fontFamily: VILLAGE_NOTICE_FONT_FAMILY,
        fontSize: `${Math.round(18 * ui)}px`,
        fontStyle: '800',
        color: '#ffffff',
        resolution: 2,
      })
      .setOrigin(0.5)
    const confirmBounds = new Phaser.Geom.Rectangle(
      width / 2 - buttonWidth / 2,
      buttonY - buttonHeight / 2,
      buttonWidth,
      buttonHeight,
    )
    const confirmButton = this.add
      .zone(width / 2, buttonY, buttonWidth, buttonHeight)
      .setInteractive({ useHandCursor: true })
    confirmButton.on(
      'pointerdown',
      (
        _pointer: Phaser.Input.Pointer,
        _localX: number,
        _localY: number,
        event: Phaser.Types.Input.EventData,
      ) => {
        event.stopPropagation()
        this.dismissVillageFuelNotice()
      },
    )

    popup.add([panel, title, subText, messageBox, messageText, buttonBg, buttonText, confirmButton])
    return { popup, width, height, confirmBounds }
  }

  private refreshVillageFuelNoticePosition() {
    if (!this.fuelNotice) return

    const iconWidth = this.fuelNotice.container.width || 66
    const gap = 10
    const minimapX = this.minimap?.container.x ?? this.scale.width - VILLAGE_MINIMAP.marginX
    const minimapY = this.minimap?.container.y ?? VILLAGE_MINIMAP.marginY
    const iconVisualTopOffset = 7
    const y =
      this.minimap && !this.minimap.collapsed
        ? minimapY - iconVisualTopOffset
        : VILLAGE_MINIMAP.marginY
    const x = Math.max(VILLAGE_MINIMAP.marginX, minimapX - iconWidth - gap)
    this.fuelNotice.container.setPosition(x, y)

    const popupWidth = this.fuelNotice.popup.width || VILLAGE_FUEL_NOTICE_POPUP.designWidth
    const popupHeight = this.fuelNotice.popup.height || VILLAGE_FUEL_NOTICE_POPUP.designHeight
    const popupMaxX = Math.max(16, this.scale.width - popupWidth - 16)
    const popupMaxY = Math.max(16, this.scale.height - popupHeight - 16)
    const popupX = Phaser.Math.Clamp(
      this.scale.width - popupWidth - VILLAGE_FUEL_NOTICE_POPUP.marginX,
      16,
      popupMaxX,
    )
    const popupY = Phaser.Math.Clamp(VILLAGE_FUEL_NOTICE_POPUP.marginY, 16, popupMaxY)
    this.fuelNotice.popup.setPosition(popupX - x, popupY - y)
    this.fuelNotice.popupBounds.setTo(
      this.fuelNotice.popup.x,
      this.fuelNotice.popup.y,
      popupWidth,
      popupHeight,
    )
  }

  private refreshVillageFuelNoticeUi(forceVisible?: boolean) {
    if (!this.fuelNotice) return

    const fixedUiVisible =
      forceVisible ??
      !(
        this.isVillagerDialogueOpen ||
        this.settingsMenu.isOpen() ||
        this.isGomokuOpen ||
        this.isPhotoGalleryOpen
      )
    const visible = this.hasPendingFuelNotice && (forceVisible ?? true)
    const popupVisible = visible && this.isFuelNoticeOpen
    this.minimap?.container.setDepth(
      popupVisible ? VILLAGE_MINIMAP.depth - 4 : VILLAGE_MINIMAP.depth,
    )
    this.minimap?.container.setVisible(fixedUiVisible && !popupVisible)
    this.fuelNotice.container.setDepth(
      popupVisible ? VILLAGE_MINIMAP.depth + 6 : VILLAGE_MINIMAP.depth,
    )
    this.fuelNotice.container.setVisible(visible)
    this.fuelNotice.popup.setVisible(popupVisible)
  }

  private refreshVillageFixedUiAfterFontReady(worldWidth: number, worldHeight: number) {
    const fonts = (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts
    if (!fonts) return

    void fonts.ready.then(() => {
      if (!this.scene.isActive()) return

      const minimapVisible = this.minimap?.container.visible ?? true
      this.minimap?.container.destroy()
      this.minimap = null
      this.createVillageMinimap(worldWidth, worldHeight)
      ;(this.minimap as VillageMinimapUi | null)?.container.setVisible(minimapVisible)

      const fuelNoticeVisible = this.fuelNotice?.container.visible ?? false
      this.fuelNotice?.container.destroy()
      this.fuelNotice = null
      this.createVillageFuelNotice()
      this.refreshVillageFuelNoticeUi(fuelNoticeVisible)
    })
  }

  private async loadVillageFuelNoticeState() {
    if (this.isFuelInboxNoticeRequestPending) return

    this.isFuelInboxNoticeRequestPending = true
    try {
      const inboxResponse = await getFuelInbox()
      if (!this.scene.isActive()) return

      const pendingEvents = inboxResponse.data ?? []
      const signature = pendingEvents.map(event => event.id).join(':')
      this.currentFuelNoticeSignature = signature
      if (!signature) {
        this.dismissedFuelNoticeSignature = ''
      }
      this.hasPendingFuelNotice =
        pendingEvents.length > 0 && signature !== this.dismissedFuelNoticeSignature
      if (!this.hasPendingFuelNotice) {
        this.isFuelNoticeOpen = false
      }
    } catch (error) {
      console.warn('Failed to load village fuel inbox notice.', error)
    } finally {
      this.isFuelInboxNoticeRequestPending = false
      this.refreshVillageFuelNoticeUi()
    }
  }

  private createMinimapZoomButton(
    container: Phaser.GameObjects.Container,
    x: number,
    y: number,
    label: string,
    delta: number,
  ) {
    const nextIndex = this.minimapZoomIndex + delta
    const disabled = delta > 0 && nextIndex >= VILLAGE_MINIMAP_ZOOM_LEVELS.length
    const size = 26
    const radius = 11
    const iconColor = disabled ? 0xb5a98a : 0x5a4a2c
    const button = this.add.graphics()
    button.fillStyle(disabled ? 0xf0e6cf : 0xfffff4, disabled ? 0.34 : 0.92)
    button.fillCircle(x, y, radius)
    button.lineStyle(1.4, disabled ? 0xd0c29c : 0xb59d64, disabled ? 0.38 : 0.9)
    button.strokeCircle(x, y, radius)
    button.lineStyle(2.4, iconColor, disabled ? 0.45 : 1)
    button.lineBetween(x - 5, y, x + 5, y)
    if (label === '+') {
      button.lineBetween(x, y - 5, x, y + 5)
    }

    container.add(button)
    return new Phaser.Geom.Rectangle(x - size / 2, y - size / 2, size, size)
  }

  private changeVillageMinimapZoom(delta: number) {
    if (!this.minimap) return

    const { worldWidth, worldHeight } = this.minimap
    if (delta < 0 && this.minimapZoomIndex === 0) {
      this.isMinimapCollapsed = true
      this.minimap.container.destroy()
      this.minimap = null
      this.createVillageMinimap(worldWidth, worldHeight)
      return
    }

    const nextIndex = Phaser.Math.Clamp(
      this.minimapZoomIndex + delta,
      0,
      VILLAGE_MINIMAP_ZOOM_LEVELS.length - 1,
    )
    if (nextIndex === this.minimapZoomIndex) return

    this.minimapZoomIndex = nextIndex
    this.minimap.container.destroy()
    this.minimap = null
    this.createVillageMinimap(worldWidth, worldHeight)
  }

  private updateVillageMinimap() {
    if (!this.minimap) return
    if (this.minimap.collapsed) return

    const { cameraRect, playerDot, worldWidth, worldHeight, mapX, mapY, mapWidth, mapHeight } =
      this.minimap
    const playerRatioX = Phaser.Math.Clamp(this.player.x / worldWidth, 0, 1)
    const playerRatioY = Phaser.Math.Clamp(this.player.y / worldHeight, 0, 1)
    playerDot.setPosition(mapX + playerRatioX * mapWidth, mapY + playerRatioY * mapHeight)

    const camera = this.cameras.main
    const cameraX = mapX + Phaser.Math.Clamp(camera.scrollX / worldWidth, 0, 1) * mapWidth
    const cameraY = mapY + Phaser.Math.Clamp(camera.scrollY / worldHeight, 0, 1) * mapHeight
    const cameraWidth = Phaser.Math.Clamp((camera.width / worldWidth) * mapWidth, 10, mapWidth)
    const cameraHeight = Phaser.Math.Clamp((camera.height / worldHeight) * mapHeight, 10, mapHeight)

    cameraRect.clear()
    cameraRect.lineStyle(1.8, 0xffffff, 0.9)
    cameraRect.strokeRoundedRect(cameraX, cameraY, cameraWidth, cameraHeight, 4)
    cameraRect.lineStyle(1, 0x7a6b4c, 0.45)
    cameraRect.strokeRoundedRect(cameraX + 1, cameraY + 1, cameraWidth - 2, cameraHeight - 2, 4)
  }

  private handleFuelNoticePointerDown(pointer: Phaser.Input.Pointer) {
    if (!this.fuelNotice?.container.visible) return false

    const { container, iconBounds, popupBounds } = this.fuelNotice
    const localX = pointer.x - container.x
    const localY = pointer.y - container.y

    if (Phaser.Geom.Rectangle.Contains(iconBounds, localX, localY)) {
      if (this.isFuelNoticeOpen) {
        this.dismissVillageFuelNotice()
        return true
      }

      this.isFuelNoticeOpen = true
      this.refreshVillageFuelNoticeUi()
      return true
    }

    const popupLocalX = localX - this.fuelNotice.popup.x
    const popupLocalY = localY - this.fuelNotice.popup.y
    if (
      this.isFuelNoticeOpen &&
      Phaser.Geom.Rectangle.Contains(this.fuelNotice.confirmBounds, popupLocalX, popupLocalY)
    ) {
      this.dismissVillageFuelNotice()
      return true
    }

    if (this.isFuelNoticeOpen && Phaser.Geom.Rectangle.Contains(popupBounds, localX, localY)) {
      return true
    }

    if (this.isFuelNoticeOpen) {
      this.dismissVillageFuelNotice()
      return true
    }

    return false
  }

  private dismissVillageFuelNotice() {
    this.dismissedFuelNoticeSignature = this.currentFuelNoticeSignature
    this.hasPendingFuelNotice = false
    this.isFuelNoticeOpen = false
    this.refreshVillageFuelNoticeUi()
  }

  private handleMinimapPointerDown(pointer: Phaser.Input.Pointer) {
    if (!this.minimap?.container.visible) return false

    const { container } = this.minimap
    const localX = pointer.x - container.x
    const localY = pointer.y - container.y

    if (this.minimap.collapsed) {
      if (Phaser.Geom.Rectangle.Contains(this.minimap.mapIconBounds, localX, localY)) {
        this.isMinimapCollapsed = false
        const { worldWidth, worldHeight } = this.minimap
        this.minimap.container.destroy()
        this.minimap = null
        this.createVillageMinimap(worldWidth, worldHeight)
        return true
      }

      return this.isPointerInsideMinimap(pointer)
    }

    if (Phaser.Geom.Rectangle.Contains(this.minimap.zoomOutBounds, localX, localY)) {
      this.changeVillageMinimapZoom(-1)
      return true
    }

    if (Phaser.Geom.Rectangle.Contains(this.minimap.zoomInBounds, localX, localY)) {
      this.changeVillageMinimapZoom(1)
      return true
    }

    for (const marker of this.minimap.markerHits) {
      if (Phaser.Geom.Rectangle.Contains(marker.bounds, localX, localY)) {
        this.teleportPlayerToWorld(marker.worldX, marker.worldY)
        return true
      }
    }

    return this.isPointerInsideMinimap(pointer)
  }

  private isPointerInsideMinimap(pointer: Phaser.Input.Pointer) {
    if (!this.minimap?.container.visible) return false

    const { container } = this.minimap
    return (
      pointer.x >= container.x &&
      pointer.x <= container.x + container.width &&
      pointer.y >= container.y &&
      pointer.y <= container.y + container.height
    )
  }

  private handleMinimapPointerMove(pointer: Phaser.Input.Pointer) {
    if (!this.minimap || this.minimap.collapsed || !this.minimap.container.visible) {
      this.setHoveredMinimapMarker(null)
      return
    }
    const { container, markerHits } = this.minimap
    const localX = pointer.x - container.x
    const localY = pointer.y - container.y
    let hovered: number | null = null
    for (let index = 0; index < markerHits.length; index += 1) {
      if (Phaser.Geom.Rectangle.Contains(markerHits[index].bounds, localX, localY)) {
        hovered = index
        break
      }
    }
    this.setHoveredMinimapMarker(hovered)
  }

  private setHoveredMinimapMarker(index: number | null) {
    if (this.hoveredMinimapMarkerIndex === index) return
    const prev = this.hoveredMinimapMarkerIndex
    if (prev !== null && this.minimap && !this.minimap.collapsed && this.minimap.markerHits[prev]) {
      this.minimap.markerHits[prev].dot.setScale(1)
    }
    if (
      index !== null &&
      this.minimap &&
      !this.minimap.collapsed &&
      this.minimap.markerHits[index]
    ) {
      this.minimap.markerHits[index].dot.setScale(1.4)
      this.input.setDefaultCursor('pointer')
    } else {
      this.input.setDefaultCursor('default')
    }
    this.hoveredMinimapMarkerIndex = index
  }

  private teleportPlayerToWorld(worldX: number, worldY: number) {
    if (this.isTransitioning) return
    if (this.settingsMenu.isOpen()) return
    if (this.isVillagerDialogueOpen) return
    if (this.isGomokuOpen) return
    if (this.isPhotoGalleryOpen) return
    if (this.isFuelNoticeOpen) return

    this.target = null
    this.player.setVelocity(0, 0)
    this.player.setPosition(worldX, worldY)
    this.lastSafePlayerPosition?.set(worldX, worldY)
    this.cameras.main.centerOn(worldX, worldY)
    // 미니맵 fast-travel 은 사용자의 명시적 의사이므로, 직전 씬 복귀 cooldown 을 건너뛰어 즉시 진입 가능하게.
    this.portalCooldownUntil = this.time.now
    // 모든 포털 wasInside 를 false 로 초기화해, 도착지가 포털 내부면 다음 update 에서 didEnter=true 가 발화.
    ;(Object.keys(this.playerWasInPortal) as VillagePortalKey[]).forEach(key => {
      this.playerWasInPortal[key] = false
    })
  }

  private createPhotoGallery(worldWidth: number, worldHeight: number) {
    const x = VILLAGE_PHOTO_GALLERY.xRatio * worldWidth
    const y = VILLAGE_PHOTO_GALLERY.yRatio * worldHeight
    const gallery = this.add
      .image(x, y, VILLAGE_PHOTO_GALLERY_KEY)
      .setOrigin(0.5, 1)
      .setScale(VILLAGE_PHOTO_GALLERY.scale)
      .setDepth(3)
      .setInteractive({ useHandCursor: true })
    gallery.on(
      'pointerdown',
      (
        _pointer: Phaser.Input.Pointer,
        _localX: number,
        _localY: number,
        event: Phaser.Types.Input.EventData,
      ) => {
        if (this.settingsMenu.isOpen()) return
        event.stopPropagation()
        this.openPhotoGallery()
      },
    )

    const box = this.add
      .rectangle(
        x,
        y - gallery.displayHeight * 0.25,
        gallery.displayWidth * 0.55,
        gallery.displayHeight * 0.4,
        0xff0000,
        0,
      )
      .setDepth(1)
    this.physics.add.existing(box, true)
    this.obstacles.add(box)

    return gallery
  }

  private createGomokuBoard(worldWidth: number, worldHeight: number) {
    const baseX = VILLAGE_GOMOKU_BOARD.xRatio * worldWidth
    const y = VILLAGE_GOMOKU_BOARD.yRatio * worldHeight
    const board = this.add
      .image(baseX, y, VILLAGE_GOMOKU_BOARD_KEY)
      .setOrigin(0.5, 1)
      .setScale(VILLAGE_GOMOKU_BOARD.scale)
      .setDepth(3)
      .setInteractive({ useHandCursor: true })
    const x = baseX + board.displayWidth * GOMOKU_BOARD_POSITION_OFFSET.xBoardWidthRatio
    board.setX(x)
    board.on(
      'pointerdown',
      (
        _pointer: Phaser.Input.Pointer,
        _localX: number,
        _localY: number,
        event: Phaser.Types.Input.EventData,
      ) => {
        if (this.settingsMenu.isOpen()) return
        event.stopPropagation()
        this.enterGomokuGame()
      },
    )

    const box = this.add.rectangle(x, y - 22, 90, 44, 0xff0000, 0).setDepth(1)
    this.physics.add.existing(box, true)
    this.obstacles.add(box)

    return board
  }

  private readonly handleObstacleEditorPointerMove = (pointer: Phaser.Input.Pointer) => {
    this.obstacleManager?.handlePointerMove(pointer)
  }

  private readonly handleObstacleEditorPointerUp = (pointer: Phaser.Input.Pointer) => {
    this.obstacleManager?.handlePointerUp(pointer)
  }

  private readonly clearEditedObstacleRects = () => {
    this.obstacleManager?.clearEditedObstacleRects()
  }

  private readonly undoObstaclePolygonPoint = () => {
    this.obstacleManager?.undoPolygonEditorPoint()
  }

  private readonly handleNpcInteract = (event?: KeyboardEvent) => {
    if (!this.canStartWorldInteraction()) {
      event?.preventDefault()
      return
    }

    if (!this.dialogDismissed) {
      if (this.isPhotoBoothInRange) {
        event?.preventDefault()
        this.enterPhotoBoothScene()
        return
      }
      if (this.isPhotoGalleryInRange) {
        event?.preventDefault()
        this.openPhotoGallery()
        return
      }
      if (this.isGomokuBoardInRange) {
        event?.preventDefault()
        this.tryOpenGomokuGame()
        return
      }
      if (this.nearestNpcId) {
        event?.preventDefault()
        this.tryOpenNpcDialogue(this.nearestNpcId)
        return
      }
    }

    if (event?.key === 'e' || event?.key === 'E') {
      this.obstacleManager?.exportObstacleRects()
      return
    }

    if (event?.key === 'Enter') {
      this.obstacleManager?.commitPolygonEditor()
    }
  }

  private preventPolygonObstaclePenetration(delta: number) {
    if (!this.player.body || !this.obstacleManager) {
      return
    }

    const footRadius = 0
    const dt = Math.min(delta, 50) / 1000
    const velocity = this.player.body.velocity

    if (velocity.x === 0 && velocity.y === 0) {
      return
    }

    const nextX = this.player.x + velocity.x * dt
    const nextY = this.player.y + velocity.y * dt

    if (!this.isPlayerFootBlockedAt(nextX, nextY, footRadius)) {
      return
    }

    const canMoveX =
      velocity.x !== 0 && !this.isPlayerFootBlockedAt(nextX, this.player.y, footRadius)
    const canMoveY =
      velocity.y !== 0 && !this.isPlayerFootBlockedAt(this.player.x, nextY, footRadius)

    if (canMoveX && canMoveY) {
      if (Math.abs(velocity.x) >= Math.abs(velocity.y)) {
        this.player.setVelocityY(0)
      } else {
        this.player.setVelocityX(0)
      }
      return
    }

    if (canMoveX) {
      this.player.setVelocityY(0)
      return
    }

    if (canMoveY) {
      this.player.setVelocityX(0)
      return
    }

    this.player.setVelocity(0, 0)
    this.target = null
  }

  private resolvePolygonObstacleCollision() {
    if (!this.player.body || !this.obstacleManager) {
      return
    }

    const footRadius = 0

    if (!this.isPlayerFootBlockedAt(this.player.x, this.player.y, footRadius)) {
      this.lastSafePlayerPosition?.set(this.player.x, this.player.y)
      return
    }

    const fallback =
      this.lastSafePlayerPosition ?? new Phaser.Math.Vector2(this.player.x, this.player.y)
    const current = new Phaser.Math.Vector2(this.player.x, this.player.y)
    const candidates =
      Math.abs(current.x - fallback.x) > Math.abs(current.y - fallback.y)
        ? [
            new Phaser.Math.Vector2(current.x, fallback.y),
            new Phaser.Math.Vector2(fallback.x, current.y),
          ]
        : [
            new Phaser.Math.Vector2(fallback.x, current.y),
            new Phaser.Math.Vector2(current.x, fallback.y),
          ]
    const slidePosition = candidates.find(
      candidate => !this.isPlayerFootBlockedAt(candidate.x, candidate.y, footRadius),
    )
    const nextPosition = slidePosition ?? fallback

    this.player.body.reset(nextPosition.x, nextPosition.y)
    this.player.setVelocity(0, 0)
    this.lastSafePlayerPosition ??= new Phaser.Math.Vector2(nextPosition.x, nextPosition.y)
    this.lastSafePlayerPosition.set(nextPosition.x, nextPosition.y)

    if (!slidePosition) {
      this.target = null
    }
  }

  private isPolygonObstacleTarget(worldX: number, worldY: number) {
    if (!this.player.body || !this.obstacleManager) {
      return false
    }

    const footRadius = 0
    return this.obstacleManager.containsBlockedFoot(worldX, worldY, footRadius)
  }

  private isPlayerFootBlockedAt(playerX: number, playerY: number, radius: number) {
    if (!this.player.body || !this.obstacleManager) {
      return false
    }

    const footOffsetX = this.player.body.center.x - this.player.x
    const footOffsetY = this.player.body.bottom - this.player.y

    return this.obstacleManager.containsBlockedFoot(
      playerX + footOffsetX,
      playerY + footOffsetY,
      radius,
    )
  }

  private blockWorldInteractionBriefly(durationMs = WORLD_INTERACTION_REOPEN_COOLDOWN_MS) {
    this.worldInteractionCooldownUntil = Math.max(
      this.worldInteractionCooldownUntil,
      this.time.now + durationMs,
    )
  }

  private isWorldInteractionCooldownActive() {
    return this.time.now < this.worldInteractionCooldownUntil
  }

  private hasBlockingOverlayOpen() {
    return (
      this.isVillagerDialogueOpen ||
      this.settingsMenu.isOpen() ||
      this.isGomokuOpen ||
      this.isPhotoGalleryOpen
    )
  }

  private canStartWorldInteraction() {
    return (
      !this.isTransitioning &&
      !this.hasBlockingOverlayOpen() &&
      !this.isWorldInteractionCooldownActive()
    )
  }

  private tryOpenNpcDialogue(npcId: VillagerNpcId) {
    if (!this.canStartWorldInteraction() || this.dialogDismissed) return

    const npc = this.villageNpcs.find(candidate => candidate.id === npcId)
    if (!npc) return

    const distance = Phaser.Math.Distance.Between(
      this.player.x,
      this.player.y,
      npc.object.x,
      npc.object.y,
    )
    if (distance > NPC_DIALOG_DISTANCE) return

    this.showNpcDialog(npcId)
  }

  private tryOpenGomokuGame() {
    if (!this.canStartWorldInteraction()) return
    if (this.getGomokuBoardDistance() > GOMOKU_BOARD_INTERACT_DISTANCE) return
    this.enterGomokuGame()
  }

  private showNpcDialog(npcId: VillagerNpcId) {
    const dialog = this.dialogs.get(npcId)
    if (!dialog) return

    setCenteredDialogText(dialog, VILLAGER_FIRST_GREETING[npcId].slice(0, 2).join('\n'))
    this.isVillagerDialogueOpen = true
    this.activeDialogNpcId = npcId
    this.target = null
    this.player.setVelocity(0, 0)
    this.interactionHint.hide()
    fadeSimpleDialog(this, dialog, 1, 120)
    this.game.events.emit('villager-dialogue:open', { npcId })
  }

  private hideDialog(markDismissed: boolean, notifyReact = true) {
    const dialog = this.getActiveDialog()
    const wasOpen = this.isVillagerDialogueOpen
    if (this.isVillagerDialogueOpen && notifyReact) {
      this.game.events.emit('villager-dialogue:force-close')
    }
    this.isVillagerDialogueOpen = false
    this.dialogDismissed = markDismissed
    this.activeDialogNpcId = null

    if (dialog) {
      fadeSimpleDialog(this, dialog, 0, 200)
    }

    if (wasOpen && markDismissed) {
      this.blockWorldInteractionBriefly()
    }
  }

  private handleVillagerDialogueClosed() {
    this.hideDialog(true, false)
  }

  private handleVillagerDialogueText({ text }: { text: string }) {
    const dialog = this.getActiveDialog()
    if (!dialog) return
    setCenteredDialogText(dialog, text)
  }

  private handleGomokuClosed() {
    this.isGomokuOpen = false
    this.blockWorldInteractionBriefly()
  }

  private openPhotoGallery() {
    if (!this.canStartWorldInteraction()) return
    this.isPhotoGalleryOpen = true
    this.target = null
    this.player.setVelocity(0, 0)
    this.interactionHint.hide()
    this.game.events.emit('photo-gallery:open')
  }

  private handlePhotoGalleryClosed = () => {
    this.isPhotoGalleryOpen = false
    this.blockWorldInteractionBriefly()
  }

  private updateInteractionHint(nearestNpc: VillageNpcInstance | null) {
    if (
      this.isVillagerDialogueOpen ||
      this.settingsMenu.isOpen() ||
      this.isGomokuOpen ||
      this.isPhotoGalleryOpen ||
      this.isWorldInteractionCooldownActive()
    ) {
      this.interactionHint.hide()
      return
    }

    if (this.isPhotoBoothInRange && this.photoBooth) {
      this.interactionHint.show(
        this.photoBooth.x,
        this.photoBooth.y - this.photoBooth.displayHeight,
        '포토부스',
        { badgeLabel: '사진', helpMessage: 'E 또는 Enter로 사진 찍기' },
      )
      return
    }

    if (this.isPhotoGalleryInRange && this.photoGallery) {
      this.interactionHint.show(
        this.photoGallery.x,
        this.photoGallery.y - this.photoGallery.displayHeight,
        '사진 갤러리',
        { badgeLabel: '갤러리', helpMessage: 'E 또는 Enter로 공개 사진 보기' },
      )
      return
    }

    if (this.isGomokuBoardInRange && this.gomokuBoard) {
      this.interactionHint.show(
        this.gomokuBoard.x,
        this.gomokuBoard.y - this.gomokuBoard.displayHeight,
        '\uC624\uBAA9',
        {
          badgeLabel: '\uC624\uBAA9',
          helpMessage: 'E / Enter: \uC624\uBAA9 \uD55C \uD310',
        },
      )
      return
    }

    if (!nearestNpc) {
      this.interactionHint.hide()
      return
    }

    this.interactionHint.show(
      nearestNpc.object.x,
      nearestNpc.object.y - nearestNpc.object.displayHeight,
      villageDialogues[nearestNpc.id].displayName,
    )
  }

  private getPhotoBoothDistance() {
    if (!this.photoBooth) {
      return Number.POSITIVE_INFINITY
    }
    return Phaser.Math.Distance.Between(
      this.player.x,
      this.player.y,
      this.photoBooth.x,
      this.photoBooth.y,
    )
  }

  private getPhotoGalleryDistance() {
    if (!this.photoGallery) {
      return Number.POSITIVE_INFINITY
    }
    return Phaser.Math.Distance.Between(
      this.player.x,
      this.player.y,
      this.photoGallery.x,
      this.photoGallery.y,
    )
  }

  private getGomokuBoardDistance() {
    if (!this.gomokuBoard) {
      return Number.POSITIVE_INFINITY
    }

    const rect = this.getGomokuBoardInteractionRect()
    const nearestX = Phaser.Math.Clamp(this.player.x, rect.left, rect.right)
    const nearestY = Phaser.Math.Clamp(this.player.y, rect.top, rect.bottom)

    return Phaser.Math.Distance.Between(this.player.x, this.player.y, nearestX, nearestY)
  }

  private getGomokuBoardInteractionRect() {
    if (!this.gomokuBoard) {
      return new Phaser.Geom.Rectangle(0, 0, 0, 0)
    }

    const width = this.gomokuBoard.displayWidth * GOMOKU_BOARD_INTERACT_RECT.width
    const height = this.gomokuBoard.displayHeight * GOMOKU_BOARD_INTERACT_RECT.height
    const x = this.gomokuBoard.x - this.gomokuBoard.displayWidth * GOMOKU_BOARD_INTERACT_RECT.left
    const y = this.gomokuBoard.y - this.gomokuBoard.displayHeight * GOMOKU_BOARD_INTERACT_RECT.top

    return new Phaser.Geom.Rectangle(x, y, width, height)
  }

  private enterGomokuGame() {
    if (!this.canStartWorldInteraction()) return
    this.isGomokuOpen = true
    this.target = null
    this.player.setVelocity(0, 0)
    if (this.isVillagerDialogueOpen) {
      this.hideDialog(false)
    }
    this.interactionHint.hide()
    this.game.events.emit('gomoku:open')
  }

  private enterPhotoBoothScene() {
    if (!this.canStartWorldInteraction()) return
    this.isTransitioning = true
    this.target = null
    this.player.setVelocity(0, 0)
    if (this.isVillagerDialogueOpen) {
      this.hideDialog(false)
    }
    // 마을은 정지(paused) 상태로 두고 FrameSelect 를 위에 띄워서 마을이 반투명하게 비춰 보이게.
    // 다른 photo-booth 씬(Camera/Pick/Result/Save) 은 불투명 배경이라 마을이 가려지므로 그대로 paused.
    // 마지막에 fadeToScene('VillageScene') 으로 복귀 시 Phaser 가 stop + restart 처리.
    this.scene.launch('PhotoBoothFrameSelectScene')
    this.scene.bringToTop('PhotoBoothFrameSelectScene')
    this.scene.pause()
  }

  private getActiveDialog() {
    if (!this.activeDialogNpcId) return null
    return this.dialogs.get(this.activeDialogNpcId) ?? null
  }

  private createVillageDialog(name: string, frameKey: string) {
    return createSimpleDialogUi(this, {
      ...NPC_DIALOG_FRAME_LAYOUT,
      frameKey,
      nameText: name,
    })
  }

  private getNearestNpcInTalkDistance() {
    let nearest: VillageNpcInstance | null = null
    let nearestDistance = Number.POSITIVE_INFINITY

    for (const npc of this.villageNpcs) {
      const dx = this.player.x - npc.object.x
      const dy = this.player.y - npc.object.y
      const distance = Math.sqrt(dx * dx + dy * dy)
      if (distance < NPC_DIALOG_DISTANCE && distance < nearestDistance) {
        nearest = npc
        nearestDistance = distance
      }
    }

    return nearest
  }

  private updateJeonghoFieldWarning(delta: number) {
    if (
      !this.jeonghoFieldWarningZone ||
      this.isTransitioning ||
      Boolean(this.controlTutorial) ||
      this.hasBlockingOverlayOpen()
    ) {
      this.resetJeonghoFieldWarning()
      return
    }

    const isStandingOnField = this.getPlayerFootProbePoints(delta).some(point =>
      this.isJeonghoFieldWarningPoint(point),
    )

    if (!isStandingOnField) {
      this.resetJeonghoFieldWarning()
      return
    }

    this.jeonghoFieldEnteredAt ??= this.time.now
    const phase =
      this.time.now - this.jeonghoFieldEnteredAt >= JEONGHO_FIELD_WARNING_HOLD_MS
        ? 'angry'
        : 'normal'
    this.showJeonghoFieldWarning(phase)
  }

  private getPlayerFootProbePoints(delta: number) {
    const foot = this.getPlayerFootWorldPoint()
    const body = this.player.body
    if (!body || (body.velocity.x === 0 && body.velocity.y === 0)) {
      return [foot]
    }

    const direction = new Phaser.Math.Vector2(body.velocity.x, body.velocity.y)
    direction.normalize()
    const dt = Math.min(delta, 50) / 1000
    const speedProbe = Math.max(
      body.velocity.length() * dt * 4,
      JEONGHO_FIELD_WARNING_FOOT_SAMPLE_RADIUS,
    )

    return [
      foot,
      new Phaser.Math.Vector2(foot.x + direction.x * speedProbe, foot.y + direction.y * speedProbe),
    ]
  }

  private getPlayerFootWorldPoint() {
    const body = this.player.body
    if (!body) {
      return new Phaser.Math.Vector2(this.player.x, this.player.y)
    }

    return new Phaser.Math.Vector2(body.center.x, body.bottom)
  }

  private isJeonghoFieldWarningPoint(point: Phaser.Math.Vector2) {
    if (!this.jeonghoFieldWarningZone) return false

    const radius = JEONGHO_FIELD_WARNING_FOOT_SAMPLE_RADIUS
    const diagonal = radius * 0.707
    const sampleOffsets = [
      { x: 0, y: 0 },
      { x: -radius, y: 0 },
      { x: radius, y: 0 },
      { x: 0, y: -radius },
      { x: 0, y: radius },
      { x: -diagonal, y: -diagonal },
      { x: diagonal, y: -diagonal },
      { x: -diagonal, y: diagonal },
      { x: diagonal, y: diagonal },
    ]

    return sampleOffsets.some(offset =>
      Phaser.Geom.Polygon.Contains(
        this.jeonghoFieldWarningZone!,
        point.x + offset.x,
        point.y + offset.y,
      ),
    )
  }

  private resetJeonghoFieldWarning() {
    this.jeonghoFieldEnteredAt = null
    this.setJeonghoNpcTexture(JEONGHO_NORMAL_KEY)
    if (!this.jeonghoFieldWarningBubble) return

    this.tweens.killTweensOf(this.jeonghoFieldWarningBubble.container)
    this.jeonghoFieldWarningBubble.container.setVisible(false).setAlpha(0).setScale(0.96)
    this.jeonghoFieldWarningBubble.phase = null
  }

  private showJeonghoFieldWarning(phase: JeonghoFieldWarningPhase) {
    const npc = this.villageNpcs.find(candidate => candidate.id === JEONGHO_NPC_ID)
    if (!npc) return

    this.setJeonghoNpcTexture(phase === 'angry' ? JEONGHO_ANGRY_KEY : JEONGHO_NORMAL_KEY)

    const bubble = this.getOrCreateJeonghoFieldWarningBubble()
    bubble.container.setPosition(npc.object.x, npc.object.y - npc.object.displayHeight - 18)

    if (!bubble.container.visible) {
      bubble.container.setVisible(true).setAlpha(0).setScale(0.96)
      this.tweens.add({
        targets: bubble.container,
        alpha: 1,
        scale: 1,
        duration: 120,
        ease: 'Back.Out',
      })
    }

    if (bubble.phase === phase) return

    this.layoutJeonghoFieldWarningBubble(bubble, phase)
    bubble.phase = phase
  }

  private getOrCreateJeonghoFieldWarningBubble() {
    if (this.jeonghoFieldWarningBubble) {
      return this.jeonghoFieldWarningBubble
    }

    const container = this.add.container(0, 0).setDepth(40).setVisible(false).setAlpha(0)
    const background = this.add.graphics()
    const text = this.add.text(0, 0, '', {
      fontSize: '18px',
      fontFamily: "'Jua', 'Apple SD Gothic Neo', sans-serif",
      color: '#3a2418',
      align: 'center',
      resolution: 2,
    })

    container.add([background, text])
    this.jeonghoFieldWarningBubble = {
      container,
      background,
      text,
      phase: null,
    }

    return this.jeonghoFieldWarningBubble
  }

  private setJeonghoNpcTexture(textureKey: string) {
    const npc = this.villageNpcs.find(candidate => candidate.id === JEONGHO_NPC_ID)
    if (!npc || npc.object.texture.key === textureKey) return

    npc.object.setTexture(textureKey)
  }

  private layoutJeonghoFieldWarningBubble(
    bubble: JeonghoFieldWarningBubble,
    phase: JeonghoFieldWarningPhase,
  ) {
    const isAngry = phase === 'angry'
    const width = isAngry ? 184 : 204
    const height = 44
    const top = -height - 12
    const radius = 12

    bubble.background.clear()
    bubble.background.fillStyle(0x000000, 0.16)
    bubble.background.fillRoundedRect(-width / 2 + 3, top + 4, width, height, radius)
    bubble.background.fillStyle(isAngry ? 0xfff0df : 0xfffff4, 0.98)
    bubble.background.fillRoundedRect(-width / 2, top, width, height, radius)
    bubble.background.lineStyle(2, isAngry ? 0xd86a42 : 0x8f6f48, 0.95)
    bubble.background.strokeRoundedRect(-width / 2, top, width, height, radius)
    bubble.background.fillStyle(isAngry ? 0xfff0df : 0xfffff4, 0.98)
    bubble.background.fillTriangle(
      -10,
      top + height - 1,
      10,
      top + height - 1,
      0,
      top + height + 11,
    )
    bubble.background.lineStyle(2, isAngry ? 0xd86a42 : 0x8f6f48, 0.95)
    bubble.background.beginPath()
    bubble.background.moveTo(-10, top + height - 1)
    bubble.background.lineTo(0, top + height + 11)
    bubble.background.lineTo(10, top + height - 1)
    bubble.background.strokePath()

    bubble.text
      .setText(isAngry ? JEONGHO_FIELD_WARNING_ANGRY_TEXT : JEONGHO_FIELD_WARNING_TEXT)
      .setFontSize(18)
      .setOrigin(0.5, 0.5)
      .setPosition(0, top + height / 2)
  }

  private updateThemePortalTransitions() {
    VILLAGE_THEME_PORTALS.forEach(portal => {
      const rectangle = this.portals.get(portal.key)
      if (!rectangle) {
        console.warn(`[VillageScene] Missing portal rectangle for "${portal.key}"`)
        return
      }

      const portalState = getRectangleEntryState(
        rectangle,
        this.player.x,
        this.player.y,
        this.playerWasInPortal[portal.key],
      )

      const canUsePortal = this.time.now >= this.portalCooldownUntil

      if (!this.isTransitioning && canUsePortal && portalState.didEnter) {
        this.enterThemeScene(portal.sceneKey)
      }

      this.playerWasInPortal[portal.key] = portalState.isInside
    })
  }

  private enterThemeScene(sceneKey: string) {
    this.isTransitioning = true
    this.target = null
    this.player.setVelocity(0, 0)

    if (this.isVillagerDialogueOpen) {
      this.hideDialog(false)
    }

    fadeToScene(this, sceneKey, { duration: 250 })
  }

  private logout() {
    useAuthStore.getState().clear()
    this.game.events.emit('auth:logout')
    this.settingsMenu.close()
    this.isTransitioning = true
    this.target = null
    this.player.setVelocity(0, 0)
    fadeToScene(this, 'StartScene', { duration: 250 })
  }
}
