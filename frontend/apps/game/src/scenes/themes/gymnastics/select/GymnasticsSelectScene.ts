import Phaser from 'phaser'
import { playSceneBgm } from '@/game/systems/sceneBgm'
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
  createFloatingInteractionIcon,
  loadInteractionIcons,
  setInteractionIconActive,
} from '@/game/ui/interactionIcon'
import {
  NPC_DIALOG_FRAME_LAYOUT,
  createSimpleDialogUi,
  fadeSimpleDialog,
  setCenteredDialogText,
  type SimpleDialogUi,
} from '@/game/ui/simpleDialog'
import {
  CUTE_CARD_PALETTES,
  drawCuteCardPanel,
  drawCutePillButton,
  type CuteCardPalette,
} from '@/game/ui/cuteCard'
import { createRatioRectangle, getRectangleEntryState } from '@/game/world/portal'
import {
  attachEmojiPalette,
  attachVillageRealtime,
  type AttachedEmojiPalette,
  type VillageRealtimeIntegration,
} from '@/features/village-realtime'
import { seongsuDialogs } from './dialog/seongsuDialogs'

const TALK_DISTANCE = 82
const GYMNASTICS_ROOM_SPAWN = { xRatio: 0.5, yRatio: 0.76 }
const GYMNASTICS_EXIT_PORTAL = { xRatio: 0.44, yRatio: 0.86, widthRatio: 0.12, heightRatio: 0.12 }
const GYMNASTICS_RETURN_SPAWN = { xRatio: 0.733, yRatio: 0.286 }
const CARD_DEPTH = 24
const CARD_FRAME_ASPECT_RATIO = 408 / 612
const CONTENT_CONFIRM_VISIBLE_MS = 1000
const CARD_FONT_FAMILY =
  '"Pretendard Variable", Pretendard, "Noto Sans KR", -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", sans-serif'
const GYMNASTICS_BACKGROUND_TEXTURE_KEY = 'gymnastics-background-v3'
const DEBUG_OBSTACLES = false
const OBSTACLE_EDITOR_ENABLED = import.meta.env.DEV
const OBSTACLE_EDITOR_MIN_SIZE = 0.003
const gymnasticsRoomSceneConfig = {
  backgroundFitMode: 'cover',
  backgroundAnchor: 'center',
  showNpcIndicator: true,
  npcPosition: {
    anchorTarget: 'center_main_purple_mat',
    xRatio: 0.5,
    yRatio: 0.62,
    offsetX: 0,
    offsetY: 0,
  },
} as const
const RACCOON_IDLE_ANIM_KEY = 'raccoon-gymnastics-idle'
const RACCOON_TEXTURE_KEY = 'raccoon-clean'
const RACCOON_FRAME_SIZE = 360
const RACCOON_CROP_RECTS = [
  { x: 120, y: 640, width: 360, height: 340 },
  { x: 580, y: 640, width: 360, height: 340 },
  { x: 1040, y: 640, width: 360, height: 340 },
  { x: 1460, y: 640, width: 360, height: 340 },
]

type GymnasticsContentMode = 'top' | 'daniel'
type GymnasticsDialogPhase = 'closed' | 'intro' | 'choice' | 'confirm'

type GymnasticsChoiceOption = {
  mode: GymnasticsContentMode
  label: string
  description: string
}

type GymnasticsCardView = {
  choice: GymnasticsChoiceOption
  container: Phaser.GameObjects.Container
  panel: Phaser.GameObjects.Graphics
  selectButton: Phaser.GameObjects.Graphics
  selectLabel: Phaser.GameObjects.Text
  baseX: number
  baseY: number
  width: number
  height: number
  palette: CuteCardPalette
}

const CARD_LAYOUT = {
  tagTopOffset: 0.085,
  characterCenterY: -0.065,
  characterSize: 0.42,
  titleY: 0.21,
  descGap: 0.07,
  buttonCenterY: 0.4,
  buttonWidth: 0.55,
  buttonHeight: 0.078,
} as const

const gymnasticsChoiceOptions: GymnasticsChoiceOption[] = [
  { mode: 'top', label: 'TOP 체조', description: 'TOP 동작을 따라 하며 몸을 풀어봐.' },
  { mode: 'daniel', label: '다니엘 체조', description: '다니엘 동작으로 신나게 움직여봐.' },
]

const GYMNASTICS_CONTENT_SCENE_KEYS: Record<GymnasticsContentMode, string> = {
  top: 'GymnasticsTopScene',
  daniel: 'GymnasticsDanielScene',
}

type ObstacleRect = { x: number; y: number; w: number; h: number }
type ObstacleInstance = {
  rect: ObstacleRect
  object: Phaser.GameObjects.Rectangle
}

const GYMNASTICS_ROOM_OBSTACLES: ObstacleRect[] = [
  { x: 0.1896, y: 0.4019, w: 0.6625, h: 0.1999 },
  { x: 0.2215, y: 0.5969, w: 0.0437, h: 0.0308 },
  { x: 0.266, y: 0.5907, w: 0.0528, h: 0.0308 },
  { x: 0, y: 0.6808, w: 0.0375, h: 0.0691 },
  { x: 0.0417, y: 0.64, w: 0.0354, h: 0.0753 },
  { x: 0.0757, y: 0.6302, w: 0.0569, h: 0.058 },
  { x: 0.134, y: 0.6092, w: 0.0208, h: 0.0728 },
  { x: 0.1458, y: 0.5944, w: 0.0368, h: 0.0654 },
  { x: 0.1875, y: 0.5895, w: 0.0278, h: 0.0506 },
  { x: 0.8299, y: 0.5598, w: 0.0431, h: 0.0568 },
  { x: 0.8597, y: 0.5858, w: 0.05, h: 0.0543 },
  { x: 0.8778, y: 0.6191, w: 0.0542, h: 0.0383 },
  { x: 0.9056, y: 0.6314, w: 0.0549, h: 0.037 },
  { x: 0.9333, y: 0.6623, w: 0.0486, h: 0.0296 },
  { x: 0.9507, y: 0.6795, w: 0.0486, h: 0.0333 },
  { x: 0.9847, y: 0.7079, w: 0.0146, h: 0.016 },
  { x: 0.7257, y: 0.6006, w: 0.0118, h: 0.1752 },
  { x: 0.7764, y: 0.6018, w: 0.0139, h: 0.1764 },
  { x: 0.7833, y: 0.6697, w: 0.009, h: 0.1876 },
  { x: 0.8431, y: 0.6536, w: 0.009, h: 0.195 },
  { x: 0.775, y: 0.603, w: 0.016, h: 0.0148 },
  { x: 0.7958, y: 0.6203, w: 0.016, h: 0.0247 },
  { x: 0.8167, y: 0.6376, w: 0.0132, h: 0.016 },
  { x: 0.8347, y: 0.6549, w: 0.0111, h: 0.0099 },
  { x: 0.8521, y: 0.6647, w: 0.0063, h: 0.0111 },
  { x: 0.7424, y: 0.6191, w: 0.016, h: 0.0173 },
  { x: 0.7632, y: 0.6425, w: 0.0118, h: 0.0148 },
  { x: 0.7854, y: 0.6647, w: 0.0132, h: 0.0136 },
  { x: 0.8979, y: 0.819, w: 0.0486, h: 0.1024 },
  { x: 0.8729, y: 0.8807, w: 0.0368, h: 0.0666 },
  { x: 0.8035, y: 0.8708, w: 0.0604, h: 0.0765 },
  { x: 0.7722, y: 0.9201, w: 0.059, h: 0.0506 },
  { x: 0.3354, y: 0.7647, w: 0.0333, h: 0.0962 },
  { x: 0.3694, y: 0.7708, w: 0.0132, h: 0.0531 },
  { x: 0.3208, y: 0.7992, w: 0.0313, h: 0.0555 },
  { x: 0.1243, y: 0.7782, w: 0.0333, h: 0.0555 },
  { x: 0.1486, y: 0.7955, w: 0.0132, h: 0.1123 },
  { x: 0.1465, y: 0.7622, w: 0.0243, h: 0.0345 },
  { x: 0.1674, y: 0.7326, w: 0.0292, h: 0.0444 },
  { x: 0.1931, y: 0.7054, w: 0.025, h: 0.0345 },
  { x: 0.2146, y: 0.6771, w: 0.0222, h: 0.0395 },
  { x: 0.2424, y: 0.6672, w: 0.0264, h: 0.0321 },
  { x: 0.2542, y: 0.6413, w: 0.0229, h: 0.037 },
  { x: 0.259, y: 0.6758, w: 0.0097, h: 0.0913 },
]

type GymnasticsSelectSceneData = {
  spawn?: RatioPoint
}

type BackgroundDisplayArea = {
  x: number
  y: number
  width: number
  height: number
}

export class GymnasticsSelectScene extends Phaser.Scene {
  /** 룸 ID — 같은 테마 select 에 들어온 환자끼리만 보이도록 (S14P31E103-794). */
  private static readonly REALTIME_ROOM_ID = 'gymnastics.select'

  private player!: PlayerSprite
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private villageRealtime: VillageRealtimeIntegration | null = null
  private emojiPalette: AttachedEmojiPalette | null = null
  private obstacles!: Phaser.Physics.Arcade.StaticGroup
  private obstacleInstances: ObstacleInstance[] = []
  private obstacleEditorDraft?: Phaser.GameObjects.Rectangle
  private obstacleEditorStart?: Phaser.Math.Vector2
  private target: Phaser.Math.Vector2 | null = null
  private lastDirection: PlayerDirection = 'down'
  private exitPortal!: Phaser.Geom.Rectangle
  private isTransitioning = false
  private playerWasInExitPortal = true

  private raccoon!: Phaser.GameObjects.Sprite
  private raccoonAnchor = new Phaser.Math.Vector2()
  private talkIcon!: Phaser.GameObjects.Image
  private dialog!: SimpleDialogUi
  private cards: GymnasticsCardView[] = []
  private isDialogVisible = false
  private dialogDismissed = false
  private dialogPhase: GymnasticsDialogPhase = 'closed'
  private hoveredMode: GymnasticsContentMode | null = null
  private selectedMode: GymnasticsContentMode | null = null
  private isWaitingContentStart = false
  private contentStartTimer: Phaser.Time.TimerEvent | null = null
  private sessionHistoryButton!: Phaser.GameObjects.Text
  private backgroundDisplayArea!: BackgroundDisplayArea

  constructor() {
    super({ key: 'GymnasticsSelectScene' })
  }

  preload() {
    this.load.image(
      GYMNASTICS_BACKGROUND_TEXTURE_KEY,
      assetPath('images/themes/gymnastics/background/gymbackground.png'),
    )
    this.load.image(
      'raccoon-source',
      assetPath('images/themes/gymnastics/characters/raccoon_exercise_spritesheet.png'),
    )
    this.load.image(
      'gym-card-top-raccoon',
      assetPath('images/themes/gymnastics/characters/TOPracoon.png'),
    )
    this.load.image(
      'gym-card-daniel-raccoon',
      assetPath('images/themes/gymnastics/characters/dinielracoon.png'),
    )
    loadInteractionIcons(this)
    this.load.image(
      'gymnastics-seongsu-dialog-frame',
      assetPath('images/npcs/seongsu/dialog_frame.png'),
    )
    loadPlayerSpritesheets(this)
  }

  create(data: GymnasticsSelectSceneData = {}) {
    playSceneBgm(this)
    const { width: vw, height: vh } = this.scale
    this.isTransitioning = false
    this.isDialogVisible = false
    this.dialogDismissed = false
    this.dialogPhase = 'closed'
    this.hoveredMode = null
    this.selectedMode = null
    this.isWaitingContentStart = false
    this.cards = []
    this.clearContentStartTimer()
    this.target = null
    this.obstacleInstances = []
    this.obstacleEditorStart = undefined
    this.obstacleEditorDraft?.destroy()
    this.obstacleEditorDraft = undefined

    this.backgroundDisplayArea = this.addContainBackground(GYMNASTICS_BACKGROUND_TEXTURE_KEY)
    createSceneWeatherLayer(this)
    this.physics.world.setBounds(0, 0, vw, vh)
    this.obstacles = this.physics.add.staticGroup()
    GYMNASTICS_ROOM_OBSTACLES.forEach(rect => this.addObstacleRect(rect))

    const npcPosition = this.toBackgroundPoint(
      gymnasticsRoomSceneConfig.npcPosition.xRatio,
      gymnasticsRoomSceneConfig.npcPosition.yRatio,
      gymnasticsRoomSceneConfig.npcPosition.offsetX,
      gymnasticsRoomSceneConfig.npcPosition.offsetY,
    )
    const raccoonX = npcPosition.x
    const raccoonY = npcPosition.y
    const raccoonH = Math.min(vh, this.backgroundDisplayArea.height) * 0.17
    this.createCleanRaccoonTexture()
    this.ensureRaccoonAnimations()
    this.raccoon = this.add.sprite(raccoonX, raccoonY, RACCOON_TEXTURE_KEY, 0)
    this.raccoon.setOrigin(0.5, 0.58).setDisplaySize(raccoonH, raccoonH).setDepth(5)
    this.raccoon.play(RACCOON_IDLE_ANIM_KEY)
    this.raccoonAnchor.set(raccoonX, raccoonY)

    this.talkIcon = createFloatingInteractionIcon(this, {
      x: raccoonX,
      y: raccoonY - raccoonH * 0.55,
      displaySize: 44,
      depth: 6,
      bobOffset: 10,
    })
    this.talkIcon.setVisible(gymnasticsRoomSceneConfig.showNpcIndicator)

    this.createDialogUi()
    this.createSessionHistoryButton(vw)
    this.createChoiceCards(vw, vh)
    ensurePlayerWalkAnimations(this)

    const spawn = data.spawn ?? GYMNASTICS_ROOM_SPAWN
    const spawnX = vw * spawn.xRatio
    const spawnY = vh * spawn.yRatio
    this.player = createPlayer(this, spawnX, spawnY)
    this.addRaccoonObstacle(raccoonH)
    this.physics.add.collider(this.player, this.obstacles)
    this.dialogDismissed =
      Phaser.Math.Distance.Between(spawnX, spawnY, this.raccoonAnchor.x, this.raccoonAnchor.y) <=
      TALK_DISTANCE
    this.exitPortal = createRatioRectangle(vw, vh, GYMNASTICS_EXIT_PORTAL)
    this.cursors = this.input.keyboard!.createCursorKeys()

    this.input.keyboard!.on('keydown-ENTER', () => {
      if (this.isDialogVisible) this.advanceDialog()
    })
    this.input.keyboard!.on('keydown-ESC', () => {
      if (this.isDialogVisible) this.closeDialog(true)
    })
    this.input.on('pointerdown', this.handlePointerDown)
    this.input.on('pointermove', this.handleObstacleEditorPointerMove)
    this.input.on('pointerup', this.handleObstacleEditorPointerUp)
    this.input.keyboard!.on('keydown-E', this.exportObstacleRects)
    this.input.keyboard!.on('keydown-R', this.clearEditedObstacleRects)
    this.input.mouse?.disableContextMenu()

    this.villageRealtime = attachVillageRealtime({
      scene: this,
      worldWidth: vw,
      worldHeight: vh,
      roomId: GymnasticsSelectScene.REALTIME_ROOM_ID,
    })
    this.emojiPalette = attachEmojiPalette(this, {
      realtime: this.villageRealtime,
      getPlayer: () => this.player,
      isOverlayOpen: () => this.isDialogVisible,
    })

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.clearContentStartTimer()
      this.input.off('pointerdown', this.handlePointerDown)
      this.input.off('pointermove', this.handleObstacleEditorPointerMove)
      this.input.off('pointerup', this.handleObstacleEditorPointerUp)
      this.input.keyboard?.off('keydown-E', this.exportObstacleRects)
      this.input.keyboard?.off('keydown-R', this.clearEditedObstacleRects)
      this.emojiPalette?.destroy()
      this.emojiPalette = null
      this.villageRealtime?.destroy()
      this.villageRealtime = null
    })

    this.playerWasInExitPortal = true
    this.cameras.main.fadeIn(250, 0, 0, 0)
  }

  update() {
    const movement = updatePlayerMovement({
      player: this.player,
      cursors: this.cursors,
      target: this.target,
      lastDirection: this.lastDirection,
      speed: getPlayerMoveSpeed(),
      blocked: this.isDialogVisible,
    })
    this.target = movement.target
    this.lastDirection = movement.lastDirection

    this.villageRealtime?.publishLocal(this.player, this.lastDirection, movement.moving)
    this.emojiPalette?.update()
    this.updateSeongsuConversation()

    if (this.isDialogVisible) return

    const exitState = getRectangleEntryState(
      this.exitPortal,
      this.player.x,
      this.player.y,
      this.playerWasInExitPortal,
    )
    if (!this.isTransitioning && exitState.didEnter) {
      this.returnToVillage()
    }
    this.playerWasInExitPortal = exitState.isInside
  }

  private readonly handlePointerDown = (pointer: Phaser.Input.Pointer) => {
    if (this.emojiPalette?.consumePointerDown(pointer)) {
      return
    }

    if (this.handleObstacleEditorPointerDown(pointer)) {
      return
    }

    if (this.sessionHistoryButton.getBounds().contains(pointer.x, pointer.y)) {
      this.openSessionHistory()
      return
    }

    if (this.isDialogVisible) {
      if (this.isWaitingContentStart) return

      const clickedDialog = this.dialog.frame.getBounds().contains(pointer.x, pointer.y)
      if (this.dialogPhase === 'intro' && clickedDialog) {
        this.showChoicePrompt()
        return
      }
      if (this.dialogPhase === 'choice') {
        const clickedCard = this.getCardAtPointer(pointer)
        if (clickedCard) {
          this.handleChoiceSelected(clickedCard.choice.mode)
          return
        }
        this.closeDialog(true)
        return
      }
      if (!clickedDialog) this.closeDialog(true)
      return
    }

    this.target = new Phaser.Math.Vector2(pointer.x, pointer.y)
    createClickTargetMarker(this, pointer.x, pointer.y)
  }

  private updateSeongsuConversation() {
    if (this.isTransitioning) return

    const dist = Phaser.Math.Distance.Between(
      this.player.x,
      this.player.y,
      this.raccoonAnchor.x,
      this.raccoonAnchor.y,
    )

    if (dist > TALK_DISTANCE) {
      this.dialogDismissed = false
      return
    }

    if (!this.isDialogVisible && !this.dialogDismissed) {
      this.startConversation()
    }
  }

  private createDialogUi() {
    this.dialog = createSimpleDialogUi(this, {
      ...NPC_DIALOG_FRAME_LAYOUT,
      frameKey: 'gymnastics-seongsu-dialog-frame',
      nameText: '체조선생님 성수',
    })
  }

  private createSessionHistoryButton(vw: number) {
    this.sessionHistoryButton = this.add
      .text(vw - 28, 28, '기록 보기', {
        fontFamily: CARD_FONT_FAMILY,
        fontSize: '18px',
        fontStyle: 'bold',
        color: '#fff8ec',
        backgroundColor: '#6d4a27',
        padding: { x: 14, y: 9 },
      })
      .setOrigin(1, 0)
      .setDepth(30)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true })

    this.sessionHistoryButton.on(
      'pointerdown',
      (
        _pointer: Phaser.Input.Pointer,
        _localX: number,
        _localY: number,
        event: Phaser.Types.Input.EventData,
      ) => {
        event.stopPropagation()
        this.openSessionHistory()
      },
    )
  }

  private openSessionHistory() {
    this.game.events.emit('exercise-sessions:open')
  }

  private addContainBackground(textureKey: string): BackgroundDisplayArea {
    const { width, height } = this.scale
    const backgroundFill = this.add.rectangle(width / 2, height / 2, width, height, 0x1f1a15)
    backgroundFill.setDepth(-1)

    const background = this.add.image(width / 2, height / 2, textureKey)
    const source = background.texture.getSourceImage() as HTMLImageElement
    const scale =
      gymnasticsRoomSceneConfig.backgroundFitMode === 'cover'
        ? Math.max(width / source.width, height / source.height)
        : Math.min(width / source.width, height / source.height)
    const displayWidth = source.width * scale
    const displayHeight = source.height * scale
    background.setOrigin(0.5).setScale(scale).setDepth(0)

    return {
      x: (width - displayWidth) / 2,
      y: (height - displayHeight) / 2,
      width: displayWidth,
      height: displayHeight,
    }
  }

  private toBackgroundPoint(xRatio: number, yRatio: number, offsetX = 0, offsetY = 0) {
    return {
      x: this.backgroundDisplayArea.x + this.backgroundDisplayArea.width * xRatio + offsetX,
      y: this.backgroundDisplayArea.y + this.backgroundDisplayArea.height * yRatio + offsetY,
    }
  }

  private addObstacleRect(rect: ObstacleRect) {
    const x = Phaser.Math.Clamp(rect.x, 0, 1)
    const y = Phaser.Math.Clamp(rect.y, 0, 1)
    const w = Phaser.Math.Clamp(rect.w, 0, 1 - x)
    const h = Phaser.Math.Clamp(rect.h, 0, 1 - y)
    const box = this.add
      .rectangle(
        this.backgroundDisplayArea.x + (x + w / 2) * this.backgroundDisplayArea.width,
        this.backgroundDisplayArea.y + (y + h / 2) * this.backgroundDisplayArea.height,
        w * this.backgroundDisplayArea.width,
        h * this.backgroundDisplayArea.height,
        0xff0000,
        DEBUG_OBSTACLES ? 0.22 : 0,
      )
      .setDepth(1)

    if (DEBUG_OBSTACLES) {
      box.setStrokeStyle(2, 0xff3333, 0.85)
    }

    this.physics.add.existing(box, true)
    this.obstacles.add(box)
    this.obstacleInstances.push({ rect: { x, y, w, h }, object: box })

    return box
  }

  private addRaccoonObstacle(raccoonH: number) {
    const box = this.add
      .rectangle(
        this.raccoonAnchor.x,
        this.raccoonAnchor.y + raccoonH * 0.22,
        raccoonH * 0.3,
        raccoonH * 0.22,
        0xff0000,
        DEBUG_OBSTACLES ? 0.22 : 0,
      )
      .setDepth(1)

    if (DEBUG_OBSTACLES) {
      box.setStrokeStyle(2, 0xff3333, 0.85)
    }

    this.physics.add.existing(box, true)
    this.obstacles.add(box)
  }

  private handleObstacleEditorPointerDown(pointer: Phaser.Input.Pointer) {
    if (!OBSTACLE_EDITOR_ENABLED || !this.obstacles) {
      return false
    }

    const event = pointer.event as MouseEvent | PointerEvent | undefined
    const isShiftDrag = Boolean(event?.shiftKey)
    const isRightClick = pointer.rightButtonDown() || pointer.button === 2

    if (isRightClick) {
      this.removeObstacleAt(pointer.x, pointer.y)
      return true
    }

    if (!isShiftDrag) {
      return false
    }

    this.obstacleEditorStart = new Phaser.Math.Vector2(pointer.x, pointer.y)
    this.obstacleEditorDraft?.destroy()
    this.obstacleEditorDraft = this.add
      .rectangle(pointer.x, pointer.y, 1, 1, 0x00aaff, 0.26)
      .setDepth(30)
      .setStrokeStyle(2, 0x0077ff, 0.95)

    return true
  }

  private readonly handleObstacleEditorPointerMove = (pointer: Phaser.Input.Pointer) => {
    if (!this.obstacleEditorStart || !this.obstacleEditorDraft) {
      return
    }

    const bounds = this.getObstacleDragBounds(this.obstacleEditorStart, pointer.x, pointer.y)
    this.obstacleEditorDraft.setPosition(bounds.centerX, bounds.centerY)
    this.obstacleEditorDraft.setSize(bounds.width, bounds.height)
    this.obstacleEditorDraft.setDisplaySize(bounds.width, bounds.height)
  }

  private readonly handleObstacleEditorPointerUp = (pointer: Phaser.Input.Pointer) => {
    if (!this.obstacleEditorStart || !this.obstacleEditorDraft) {
      return
    }

    const bounds = this.getObstacleDragBounds(this.obstacleEditorStart, pointer.x, pointer.y)
    this.obstacleEditorDraft.destroy()
    this.obstacleEditorDraft = undefined
    this.obstacleEditorStart = undefined

    const rect = {
      x: (bounds.x - this.backgroundDisplayArea.x) / this.backgroundDisplayArea.width,
      y: (bounds.y - this.backgroundDisplayArea.y) / this.backgroundDisplayArea.height,
      w: bounds.width / this.backgroundDisplayArea.width,
      h: bounds.height / this.backgroundDisplayArea.height,
    }

    if (rect.w < OBSTACLE_EDITOR_MIN_SIZE || rect.h < OBSTACLE_EDITOR_MIN_SIZE) {
      return
    }

    this.addObstacleRect(rect)
  }

  private getObstacleDragBounds(start: Phaser.Math.Vector2, currentX: number, currentY: number) {
    const left = this.backgroundDisplayArea.x
    const top = this.backgroundDisplayArea.y
    const rightLimit = this.backgroundDisplayArea.x + this.backgroundDisplayArea.width
    const bottomLimit = this.backgroundDisplayArea.y + this.backgroundDisplayArea.height
    const x = Phaser.Math.Clamp(Math.min(start.x, currentX), left, rightLimit)
    const y = Phaser.Math.Clamp(Math.min(start.y, currentY), top, bottomLimit)
    const right = Phaser.Math.Clamp(Math.max(start.x, currentX), left, rightLimit)
    const bottom = Phaser.Math.Clamp(Math.max(start.y, currentY), top, bottomLimit)
    const width = Math.max(1, right - x)
    const height = Math.max(1, bottom - y)

    return new Phaser.Geom.Rectangle(x, y, width, height)
  }

  private removeObstacleAt(x: number, y: number) {
    for (let index = this.obstacleInstances.length - 1; index >= 0; index -= 1) {
      const instance = this.obstacleInstances[index]
      if (!instance.object.getBounds().contains(x, y)) {
        continue
      }

      this.obstacles.remove(instance.object, true, true)
      this.obstacleInstances.splice(index, 1)
      return
    }
  }

  private readonly exportObstacleRects = () => {
    if (!OBSTACLE_EDITOR_ENABLED) {
      return
    }

    const lines = this.obstacleInstances.map(({ rect }) => {
      const x = Number(rect.x.toFixed(4))
      const y = Number(rect.y.toFixed(4))
      const w = Number(rect.w.toFixed(4))
      const h = Number(rect.h.toFixed(4))
      return `  { x: ${x}, y: ${y}, w: ${w}, h: ${h} },`
    })
    const output = `const GYMNASTICS_ROOM_OBSTACLES: ObstacleRect[] = [\n${lines.join('\n')}\n]`

    console.info('[GymnasticsSelectScene] Exported obstacle rectangles:\n' + output)
    void navigator.clipboard?.writeText(output).catch(() => undefined)
  }

  private readonly clearEditedObstacleRects = () => {
    if (!OBSTACLE_EDITOR_ENABLED) {
      return
    }

    this.obstacleInstances.forEach(({ object }) => {
      this.obstacles.remove(object, true, true)
    })
    this.obstacleInstances = []
    this.obstacleEditorDraft?.destroy()
    this.obstacleEditorDraft = undefined
    this.obstacleEditorStart = undefined
  }

  private createCleanRaccoonTexture() {
    if (this.textures.exists(RACCOON_TEXTURE_KEY)) return

    const source = this.textures.get('raccoon-source').getSourceImage() as HTMLImageElement
    const canvas = document.createElement('canvas')
    canvas.width = RACCOON_FRAME_SIZE * RACCOON_CROP_RECTS.length
    canvas.height = RACCOON_FRAME_SIZE
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Raccoon canvas context is not available.')

    RACCOON_CROP_RECTS.forEach((rect, index) => {
      context.drawImage(
        source,
        rect.x,
        rect.y,
        rect.width,
        rect.height,
        index * RACCOON_FRAME_SIZE,
        RACCOON_FRAME_SIZE - rect.height,
        rect.width,
        rect.height,
      )
    })

    const texture = this.textures.addCanvas(RACCOON_TEXTURE_KEY, canvas)
    if (!texture) throw new Error('Clean raccoon texture is not available.')

    RACCOON_CROP_RECTS.forEach((_, index) => {
      texture.add(index, 0, index * RACCOON_FRAME_SIZE, 0, RACCOON_FRAME_SIZE, RACCOON_FRAME_SIZE)
    })
  }

  private ensureRaccoonAnimations() {
    if (this.anims.exists(RACCOON_IDLE_ANIM_KEY)) return

    this.anims.create({
      key: RACCOON_IDLE_ANIM_KEY,
      frames: this.anims.generateFrameNumbers(RACCOON_TEXTURE_KEY, { start: 0, end: 3 }),
      frameRate: 1.2,
      repeat: -1,
    })
  }

  private startConversation() {
    this.hoveredMode = null
    this.selectedMode = null
    this.isWaitingContentStart = false
    this.clearContentStartTimer()
    this.dialogPhase = 'intro'
    setCenteredDialogText(this.dialog, Phaser.Utils.Array.GetRandom(seongsuDialogs.guide).text)
    this.isDialogVisible = true
    setInteractionIconActive(this.talkIcon, true)
    fadeSimpleDialog(this, this.dialog, 1, 220)
  }

  private advanceDialog() {
    if (this.dialogPhase === 'intro') this.showChoicePrompt()
  }

  private showChoicePrompt() {
    if (this.dialogPhase !== 'intro') return

    this.dialogPhase = 'choice'
    setCenteredDialogText(
      this.dialog,
      Phaser.Utils.Array.GetRandom(seongsuDialogs.choicePrompt).text,
    )
    fadeSimpleDialog(this, this.dialog, 0, 160)
    this.time.delayedCall(110, () => {
      if (this.isDialogVisible && this.dialogPhase === 'choice') this.showCards()
    })
  }

  private createChoiceCards(vw: number, vh: number) {
    const cardHeight = Phaser.Math.Clamp(vh * 0.78, 540, 690)
    const cardWidth = cardHeight * (CARD_FRAME_ASPECT_RATIO + 0.055)
    const gap = Phaser.Math.Clamp(vw * 0.04, 56, 86)
    const totalWidth = cardWidth * gymnasticsChoiceOptions.length + gap
    const firstX = vw / 2 - totalWidth / 2 + cardWidth / 2
    const centerY = Phaser.Math.Clamp(vh * 0.48, 24 + cardHeight / 2, vh - cardHeight / 2 - 24)

    this.cards = gymnasticsChoiceOptions.map((choice, index) =>
      this.createChoiceCard(
        choice,
        firstX + index * (cardWidth + gap),
        centerY,
        cardWidth,
        cardHeight,
      ),
    )
    this.hideCards(true)
  }

  private createChoiceCard(
    choice: GymnasticsChoiceOption,
    x: number,
    y: number,
    width: number,
    height: number,
  ) {
    const container = this.add.container(x, y).setDepth(CARD_DEPTH).setAlpha(0).setVisible(false)
    container.setSize(width, height)
    container.setScrollFactor(0)
    container.setInteractive(
      new Phaser.Geom.Rectangle(-width / 2, -height / 2, width, height),
      Phaser.Geom.Rectangle.Contains,
    )
    container.input!.cursor = 'pointer'

    const palette = choice.mode === 'top' ? CUTE_CARD_PALETTES.butter : CUTE_CARD_PALETTES.sage
    const panel = this.add.graphics()
    const tagFontSize = Math.round(height * 0.028)
    const tagLabel = this.add
      .text(0, 0, choice.label, {
        fontFamily: CARD_FONT_FAMILY,
        fontSize: `${tagFontSize}px`,
        fontStyle: 'bold',
        color: palette.accentHex,
      })
      .setOrigin(0.5)
    const tagW = tagLabel.width + Math.round(height * 0.055)
    const tagH = Math.round(height * 0.052)
    const tagY = -height / 2 + Math.round(height * CARD_LAYOUT.tagTopOffset)
    const tagBg = this.add.graphics()
    tagBg.fillStyle(palette.accent, 0.22)
    tagBg.fillRoundedRect(-tagW / 2, tagY - tagH / 2, tagW, tagH, tagH / 2)
    tagBg.lineStyle(1.2, palette.accent, 0.55)
    tagBg.strokeRoundedRect(-tagW / 2, tagY - tagH / 2, tagW, tagH, tagH / 2)
    tagLabel.setPosition(0, tagY)

    const characterKey = choice.mode === 'top' ? 'gym-card-top-raccoon' : 'gym-card-daniel-raccoon'
    const character = this.add
      .image(0, height * CARD_LAYOUT.characterCenterY, characterKey)
      .setDisplaySize(height * CARD_LAYOUT.characterSize, height * CARD_LAYOUT.characterSize)

    const titleY = height * CARD_LAYOUT.titleY
    const title = this.add
      .text(0, titleY, choice.label, {
        fontFamily: CARD_FONT_FAMILY,
        fontSize: `${Math.round(height * 0.056)}px`,
        fontStyle: '700',
        color: '#3b2a44',
        align: 'center',
      })
      .setOrigin(0.5)

    const description = this.add
      .text(0, titleY + Math.round(height * CARD_LAYOUT.descGap), choice.description, {
        fontFamily: CARD_FONT_FAMILY,
        fontSize: `${Math.round(height * 0.026)}px`,
        fontStyle: 'bold',
        color: '#7a6e85',
        align: 'center',
        wordWrap: { width: width * 0.78, useAdvancedWrap: true },
      })
      .setOrigin(0.5)

    const selectButton = this.add.graphics()
    const selectLabel = this.add
      .text(0, height * CARD_LAYOUT.buttonCenterY, '선택', {
        fontFamily: CARD_FONT_FAMILY,
        fontSize: `${Math.round(height * 0.034)}px`,
        fontStyle: 'bold',
        color: '#ffffff',
        align: 'center',
      })
      .setOrigin(0.5)
      .setShadow(0, 1, `#${palette.shadow.toString(16).padStart(6, '0')}`, 2, false, true)

    container.add([
      panel,
      tagBg,
      tagLabel,
      character,
      title,
      description,
      selectButton,
      selectLabel,
    ])

    const card = {
      choice,
      container,
      panel,
      selectButton,
      selectLabel,
      baseX: x,
      baseY: y,
      width,
      height,
      palette,
    }

    container.on('pointerover', () => this.handleCardHover(choice.mode))
    container.on('pointerout', () => this.handleCardOut(choice.mode))
    container.on(
      'pointerdown',
      (
        _pointer: Phaser.Input.Pointer,
        _localX: number,
        _localY: number,
        event: Phaser.Types.Input.EventData,
      ) => {
        event.stopPropagation()
        this.handleChoiceSelected(choice.mode)
      },
    )

    return card
  }

  private getCardAtPointer(pointer: Phaser.Input.Pointer) {
    return this.cards.find(card => {
      if (!card.container.visible || card.container.alpha <= 0) return false

      const width = card.width * card.container.scaleX
      const height = card.height * card.container.scaleY

      return Phaser.Geom.Rectangle.Contains(
        new Phaser.Geom.Rectangle(
          card.container.x - width / 2,
          card.container.y - height / 2,
          width,
          height,
        ),
        pointer.x,
        pointer.y,
      )
    })
  }

  private handleCardHover(mode: GymnasticsContentMode) {
    if (!this.isDialogVisible || this.isWaitingContentStart) return

    this.hoveredMode = mode
    this.updateCardStates()
  }

  private handleCardOut(mode: GymnasticsContentMode) {
    if (this.isWaitingContentStart || this.hoveredMode !== mode) return

    this.hoveredMode = null
    this.updateCardStates()
  }

  private handleChoiceSelected(mode: GymnasticsContentMode) {
    if (this.isTransitioning || this.isWaitingContentStart) return

    this.selectedMode = mode
    this.hoveredMode = null
    this.isWaitingContentStart = true
    this.dialogPhase = 'confirm'
    this.updateCardStates()
    this.hideCards()

    const choice = gymnasticsChoiceOptions.find(option => option.mode === mode)
    setCenteredDialogText(this.dialog, `${choice?.label ?? '체조'}로 시작할게! 준비됐지?`)
    fadeSimpleDialog(this, this.dialog, 1, 180)

    this.contentStartTimer = this.time.delayedCall(CONTENT_CONFIRM_VISIBLE_MS, () => {
      this.contentStartTimer = null
      this.startSelectedContent(mode)
    })
  }

  private updateCardStates() {
    this.cards.forEach(card => {
      const isSelected = card.choice.mode === this.selectedMode
      const isHovered = card.choice.mode === this.hoveredMode
      const dimmed = this.isWaitingContentStart && !isSelected
      const state = isSelected ? 'selected' : isHovered ? 'hover' : 'default'

      card.container.setScale(isSelected ? 1.035 : isHovered ? 1.02 : 1)
      card.container.setAlpha(dimmed ? 0.55 : 1)
      drawCuteCardPanel(card.panel, card.width, card.height, card.palette, state, 28)
      drawCutePillButton(
        card.selectButton,
        0,
        card.height * CARD_LAYOUT.buttonCenterY,
        card.width * CARD_LAYOUT.buttonWidth,
        card.height * CARD_LAYOUT.buttonHeight,
        card.palette,
        state,
      )
    })
  }

  private showCards() {
    this.cards.forEach((card, index) => {
      card.container.setVisible(true)
      card.container.setAlpha(0)
      card.container.setPosition(card.baseX, card.baseY + 18)
      card.container.setScale(1)
      this.tweens.killTweensOf(card.container)
      this.tweens.add({
        targets: card.container,
        alpha: 1,
        y: card.baseY,
        duration: 240,
        delay: index * 70,
        ease: 'Sine.easeOut',
      })
    })
    this.updateCardStates()
  }

  private hideCards(immediate = false) {
    this.cards.forEach(card => {
      this.tweens.killTweensOf(card.container)
      if (immediate) {
        card.container.setVisible(false).setAlpha(0)
        return
      }

      this.tweens.add({
        targets: card.container,
        alpha: 0,
        y: card.baseY + 12,
        duration: 160,
        ease: 'Sine.easeIn',
        onComplete: () => {
          card.container.setVisible(false)
          card.container.setPosition(card.baseX, card.baseY)
        },
      })
    })
  }

  private closeDialog(markDismissed: boolean) {
    this.clearContentStartTimer()
    this.isDialogVisible = false
    this.dialogDismissed = markDismissed
    this.dialogPhase = 'closed'
    this.hoveredMode = null
    this.selectedMode = null
    this.isWaitingContentStart = false
    setInteractionIconActive(this.talkIcon, false)
    this.hideCards()
    fadeSimpleDialog(this, this.dialog, 0, 180)
  }

  private clearContentStartTimer() {
    this.contentStartTimer?.remove(false)
    this.contentStartTimer = null
  }

  private startSelectedContent(mode: GymnasticsContentMode) {
    if (this.isTransitioning) return

    this.isTransitioning = true
    this.target = null
    this.player.setVelocity(0, 0)
    this.closeDialog(false)
    fadeToScene(this, GYMNASTICS_CONTENT_SCENE_KEYS[mode], { duration: 250 })
  }

  private returnToVillage() {
    if (this.isTransitioning) return
    this.isTransitioning = true

    fadeToScene(this, 'VillageScene', {
      duration: 250,
      data: { spawn: GYMNASTICS_RETURN_SPAWN },
    })
  }
}
