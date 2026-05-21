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
  drawCutePillButton,
  drawCuteCardPanel,
  type CuteCardPalette,
} from '@/game/ui/cuteCard'
import { addCoverBackground } from '@/game/world/background'
import { createRatioRectangle, isPointInRectangle } from '@/game/world/portal'
import {
  attachEmojiPalette,
  attachVillageRealtime,
  type AttachedEmojiPalette,
  type VillageRealtimeIntegration,
} from '@/features/village-realtime'
import {
  artChoiceOptions,
  rumiContentDialogs,
  rumiSelectDialogs,
  type ArtChoiceOption,
  type ArtContentMode,
} from '../dialog/rumiDialogs'

const ART_ROOM_SPAWN = { xRatio: 0.5, yRatio: 0.76 }
const ART_EXIT_PORTAL = { xRatio: 0.44, yRatio: 0.86, widthRatio: 0.12, heightRatio: 0.12 }
const ART_RETURN_SPAWN = { xRatio: 0.37, yRatio: 0.58 }
const RUMI_TALK_ICON = { xRatio: 0.37, yRatio: 0.42 }
const RUMI_INTERACTION = { xRatio: 0.37, yRatio: 0.66, radiusRatio: 0.06 }
const CARD_DEPTH = 24
const CARD_FONT_FAMILY =
  '"Pretendard Variable", Pretendard, "Noto Sans KR", -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", sans-serif'
const CARD_FRAME_ASPECT_RATIO = 408 / 612
const CONTENT_CONFIRM_VISIBLE_MS = 1300
const DEBUG_OBSTACLES = false
const OBSTACLE_EDITOR_ENABLED = import.meta.env.DEV
const OBSTACLE_EDITOR_MIN_SIZE = 0.003

const CARD_LAYOUT = {
  tagTopOffset: 0.085,
  characterCenterY: -0.06,
  characterSize: 0.4,
  titleY: 0.21,
  descGap: 0.07,
  buttonCenterY: 0.4,
  buttonWidth: 0.55,
  buttonHeight: 0.078,
} as const

const ART_CONTENT_SCENE_KEYS: Record<ArtContentMode, string> = {
  // 그림 퀴즈 진입은 mode-select(QuizLobbyScene) 가 먼저 — 거기서 혼자(AI) / 친구랑(멀티) 분기 (S14P31E103-820).
  'free-drawing': 'QuizLobbyScene',
  coloring: 'ArtColoringSelectScene',
}

type ArtSelectSceneData = {
  spawn?: RatioPoint
  suppressRumiDialog?: boolean
}

type ArtCardView = {
  choice: ArtChoiceOption
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

type RumiDialogPhase = 'closed' | 'intro' | 'choice' | 'confirm'
type ObstacleRect = { x: number; y: number; w: number; h: number }
type ObstacleInstance = {
  rect: ObstacleRect
  object: Phaser.GameObjects.Rectangle
}
type BackgroundDisplayArea = {
  x: number
  y: number
  width: number
  height: number
}

const ART_ROOM_OBSTACLES: ObstacleRect[] = [
  { x: 0, y: 0, w: 1, h: 0.37 },
  { x: 0.39, y: 0.04, w: 0.245, h: 0.38 },
  { x: 0.88, y: 0.25, w: 0.12, h: 0.4 },
  { x: 0.0219, y: 0.3673, w: 0.0564, h: 0.3111 },
  { x: 0.0744, y: 0.4327, w: 0.0392, h: 0.1529 },
  { x: 0.0219, y: 0.6719, w: 0.0319, h: 0.1085 },
  { x: 0.0916, y: 0.6797, w: 0.0697, h: 0.085 },
  { x: 0.0578, y: 0.8248, w: 0.0571, h: 0.1176 },
  { x: 0.0219, y: 0.8667, w: 0.0531, h: 0.1281 },
  { x: 0.0491, y: 0.7451, w: 0.0272, h: 0.1137 },
  { x: 0.0717, y: 0.7647, w: 0.0219, h: 0.0837 },
  { x: 0.097, y: 0.8235, w: 0.0133, h: 0.017 },
  { x: 0.0923, y: 0.6353, w: 0.0226, h: 0.0693 },
  { x: 0.1116, y: 0.6235, w: 0.0086, h: 0.0601 },
  { x: 0.1355, y: 0.6301, w: 0.0146, h: 0.051 },
  { x: 0.4721, y: 0.4235, w: 0.081, h: 0.1948 },
  { x: 0.4728, y: 0.6157, w: 0.0764, h: 0.0248 },
  { x: 0.4914, y: 0.6889, w: 0.0405, h: 0.0418 },
  { x: 0.4927, y: 0.7333, w: 0.0073, h: 0.0222 },
  { x: 0.5212, y: 0.7307, w: 0.01, h: 0.0222 },
  { x: 0.5697, y: 0.5804, w: 0.0531, h: 0.115 },
  { x: 0.5697, y: 0.5281, w: 0.0173, h: 0.0497 },
  { x: 0.5963, y: 0.5621, w: 0.0073, h: 0.0222 },
  { x: 0.6122, y: 0.5621, w: 0.008, h: 0.017 },
  { x: 0.6487, y: 0.3647, w: 0.1056, h: 0.1294 },
  { x: 0.5531, y: 0.4131, w: 0.1155, h: 0.0575 },
  { x: 0.3818, y: 0.4013, w: 0.1129, h: 0.0562 },
  { x: 0.2835, y: 0.3673, w: 0.1023, h: 0.132 },
  { x: 0.3845, y: 0.4444, w: 0.0193, h: 0.0366 },
  { x: 0.7457, y: 0.4105, w: 0.1448, h: 0.0641 },
  { x: 0.6806, y: 0.6614, w: 0.2244, h: 0.1804 },
  { x: 0.6932, y: 0.6092, w: 0.0272, h: 0.0706 },
  { x: 0.7291, y: 0.6366, w: 0.0073, h: 0.0209 },
  { x: 0.7437, y: 0.634, w: 0.0106, h: 0.0196 },
  { x: 0.7802, y: 0.6379, w: 0.0133, h: 0.0275 },
  { x: 0.7968, y: 0.6392, w: 0.0166, h: 0.0235 },
  { x: 0.8161, y: 0.6314, w: 0.0146, h: 0.0327 },
  { x: 0.8413, y: 0.6418, w: 0.0106, h: 0.0248 },
  { x: 0.6116, y: 0.8536, w: 0.0485, h: 0.1373 },
  { x: 0.3619, y: 0.8614, w: 0.0372, h: 0.1333 },
  { x: 0.8944, y: 0.8, w: 0.0319, h: 0.1072 },
  { x: 0.9416, y: 0.8275, w: 0.0359, h: 0.1477 },
  { x: 0.1215, y: 0.3569, w: 0.1288, h: 0.1765 },
  { x: 0.1235, y: 0.5268, w: 0.0372, h: 0.0667 },
  { x: 0.1521, y: 0.5386, w: 0.0604, h: 0.0209 },
]

export class ArtSelectScene extends Phaser.Scene {
  /** 룸 ID — 같은 테마 select 에 들어온 환자끼리만 보이도록 (S14P31E103-794). */
  private static readonly REALTIME_ROOM_ID = 'art.select'

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

  private talkIcon!: Phaser.GameObjects.Image
  private rumiAnchor = new Phaser.Math.Vector2()
  private rumiInteractionRadius = 0

  private dialog!: SimpleDialogUi
  private cards: ArtCardView[] = []
  private isAlbumVisible = false

  private isDialogVisible = false
  private dialogDismissed = false
  private dialogPhase: RumiDialogPhase = 'closed'
  private hoveredMode: ArtContentMode | null = null
  private selectedMode: ArtContentMode | null = null
  private isWaitingContentStart = false
  private contentStartTimer: Phaser.Time.TimerEvent | null = null
  private backgroundDisplayArea!: BackgroundDisplayArea

  private readonly handlePointerDown = (pointer: Phaser.Input.Pointer) => {
    if (this.emojiPalette?.consumePointerDown(pointer)) {
      return
    }

    if (this.handleObstacleEditorPointerDown(pointer)) {
      return
    }

    if (this.isDialogVisible) {
      if (this.isWaitingContentStart) {
        return
      }

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

      if (clickedDialog) {
        return
      }

      this.closeDialog(true)
      return
    }

    if (this.isAlbumVisible) {
      return
    }

    this.target = new Phaser.Math.Vector2(pointer.x, pointer.y)
    createClickTargetMarker(this, pointer.x, pointer.y)
  }

  private readonly handleEnterDown = () => {
    if (this.isDialogVisible) {
      this.advanceDialog()
    }
  }

  private readonly handleEscDown = () => {
    if (this.isAlbumVisible) {
      this.closeAlbum()
      return
    }

    if (this.isDialogVisible) {
      this.closeDialog(true)
    }
  }

  constructor() {
    super({ key: 'ArtSelectScene' })
  }

  preload() {
    this.load.image('art-room-background', assetPath('images/themes/art/background/background.png'))
    loadInteractionIcons(this)
    this.load.image('rumi-dialog-frame', assetPath('images/npcs/rumi/dialog-frame.png'))
    this.load.image('art-rumi-character', assetPath('images/themes/art/ui/rumi.png'))
    this.load.image('art-card-free', assetPath('images/themes/art/ui/free.png'))
    this.load.image('art-card-paint', assetPath('images/themes/art/ui/paint.png'))
    loadPlayerSpritesheets(this)
  }

  create(data: ArtSelectSceneData = {}) {
    playSceneBgm(this)
    const { width: vw, height: vh } = this.scale
    this.isTransitioning = false
    this.isDialogVisible = false
    this.dialogDismissed = Boolean(data.suppressRumiDialog)
    this.dialogPhase = 'closed'
    this.hoveredMode = null
    this.selectedMode = null
    this.isWaitingContentStart = false
    this.target = null
    this.cards = []
    this.obstacleInstances = []
    this.obstacleEditorStart = undefined
    this.obstacleEditorDraft?.destroy()
    this.obstacleEditorDraft = undefined
    this.clearContentStartTimer()

    const background = addCoverBackground(this, 'art-room-background')
    const backgroundLeft = background.x - background.displayWidth / 2
    const backgroundTop = background.y - background.displayHeight / 2
    this.backgroundDisplayArea = {
      x: backgroundLeft,
      y: backgroundTop,
      width: background.displayWidth,
      height: background.displayHeight,
    }

    this.talkIcon = createFloatingInteractionIcon(this, {
      x: backgroundLeft + background.displayWidth * RUMI_TALK_ICON.xRatio,
      y: backgroundTop + background.displayHeight * RUMI_TALK_ICON.yRatio,
    })

    this.createRumiCharacter(
      backgroundLeft,
      backgroundTop,
      background.displayWidth,
      background.displayHeight,
    )

    this.rumiAnchor.set(
      backgroundLeft + background.displayWidth * RUMI_INTERACTION.xRatio,
      backgroundTop + background.displayHeight * RUMI_INTERACTION.yRatio,
    )
    this.rumiInteractionRadius =
      Math.min(background.displayWidth, background.displayHeight) * RUMI_INTERACTION.radiusRatio

    this.physics.world.setBounds(0, 0, vw, vh)
    this.obstacles = this.physics.add.staticGroup()
    ART_ROOM_OBSTACLES.forEach(rect => this.addObstacleRect(rect))

    ensurePlayerWalkAnimations(this)
    this.createDialogUi()
    this.createChoiceCards(vw, vh)

    const spawn = data.spawn ?? ART_ROOM_SPAWN
    this.player = createPlayer(this, vw * spawn.xRatio, vh * spawn.yRatio)
    this.addRumiObstacle()
    this.physics.add.collider(this.player, this.obstacles)

    this.exitPortal = createRatioRectangle(vw, vh, ART_EXIT_PORTAL)

    this.cursors = this.input.keyboard!.createCursorKeys()
    this.input.on('pointerdown', this.handlePointerDown)
    this.input.on('pointermove', this.handleObstacleEditorPointerMove)
    this.input.on('pointerup', this.handleObstacleEditorPointerUp)
    this.input.keyboard!.on('keydown-ENTER', this.handleEnterDown)
    this.input.keyboard!.on('keydown-ESC', this.handleEscDown)
    this.input.keyboard!.on('keydown-E', this.exportObstacleRects)
    this.input.keyboard!.on('keydown-R', this.clearEditedObstacleRects)
    this.input.mouse?.disableContextMenu()

    this.villageRealtime = attachVillageRealtime({
      scene: this,
      worldWidth: vw,
      worldHeight: vh,
      roomId: ArtSelectScene.REALTIME_ROOM_ID,
    })
    this.emojiPalette = attachEmojiPalette(this, {
      realtime: this.villageRealtime,
      getPlayer: () => this.player,
      isOverlayOpen: () => this.isDialogVisible || this.isAlbumVisible,
    })

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.clearContentStartTimer()
      this.input.off('pointerdown', this.handlePointerDown)
      this.input.off('pointermove', this.handleObstacleEditorPointerMove)
      this.input.off('pointerup', this.handleObstacleEditorPointerUp)
      this.input.keyboard?.off('keydown-ENTER', this.handleEnterDown)
      this.input.keyboard?.off('keydown-ESC', this.handleEscDown)
      this.input.keyboard?.off('keydown-E', this.exportObstacleRects)
      this.input.keyboard?.off('keydown-R', this.clearEditedObstacleRects)
      this.closeAlbum()
      this.emojiPalette?.destroy()
      this.emojiPalette = null
      this.villageRealtime?.destroy()
      this.villageRealtime = null
    })

    this.cameras.main.fadeIn(250, 0, 0, 0)
  }

  update() {
    const movement = updatePlayerMovement({
      player: this.player,
      cursors: this.cursors,
      target: this.target,
      lastDirection: this.lastDirection,
      speed: getPlayerMoveSpeed(),
      blocked: this.isDialogVisible || this.isAlbumVisible,
    })
    this.target = movement.target
    this.lastDirection = movement.lastDirection

    this.villageRealtime?.publishLocal(this.player, this.lastDirection, movement.moving)
    this.emojiPalette?.update()
    this.updateRumiConversation()

    if (this.isDialogVisible || this.isAlbumVisible) {
      return
    }

    if (
      !this.isTransitioning &&
      isPointInRectangle(this.exitPortal, this.player.x, this.player.y)
    ) {
      this.returnToVillage()
    }
  }

  private updateRumiConversation() {
    if (this.isTransitioning || this.isAlbumVisible) {
      return
    }

    const distanceToRumi = Phaser.Math.Distance.Between(
      this.player.x,
      this.player.y,
      this.rumiAnchor.x,
      this.rumiAnchor.y,
    )
    const isNearRumi = distanceToRumi <= this.rumiInteractionRadius

    setInteractionIconActive(this.talkIcon, this.isDialogVisible)

    if (!isNearRumi) {
      this.dialogDismissed = false
      return
    }

    if (!this.isDialogVisible && !this.dialogDismissed) {
      this.startRumiConversation()
    }
  }

  private createDialogUi() {
    this.dialog = createSimpleDialogUi(this, {
      ...NPC_DIALOG_FRAME_LAYOUT,
      frameKey: 'rumi-dialog-frame',
      nameText: '루미',
    })
  }

  private createRumiCharacter(
    backgroundLeft: number,
    backgroundTop: number,
    backgroundWidth: number,
    backgroundHeight: number,
  ) {
    const source = this.textures.get('art-rumi-character').getSourceImage() as HTMLImageElement
    const aspect = source.width / source.height
    const rumiHeight = backgroundHeight * 0.23
    const rumiWidth = rumiHeight * aspect
    const x = backgroundLeft + backgroundWidth * RUMI_TALK_ICON.xRatio
    const iconHalfHeight = this.talkIcon.displayHeight / 2
    const y = backgroundTop + backgroundHeight * RUMI_TALK_ICON.yRatio + iconHalfHeight + 6

    this.add
      .image(x, y, 'art-rumi-character')
      .setOrigin(0.5, 0)
      .setDepth(5)
      .setDisplaySize(rumiWidth, rumiHeight)
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

  private addRumiObstacle() {
    const size = Math.min(this.backgroundDisplayArea.width, this.backgroundDisplayArea.height)
    const box = this.add
      .rectangle(
        this.rumiAnchor.x,
        this.rumiAnchor.y + size * 0.02,
        size * 0.055,
        size * 0.055,
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
    const output = `const ART_ROOM_OBSTACLES: ObstacleRect[] = [\n${lines.join('\n')}\n]`

    console.info('[ArtSelectScene] Exported obstacle rectangles:\n' + output)
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

  private createChoiceCards(vw: number, vh: number) {
    const cardHeight = Phaser.Math.Clamp(vh * 0.78, 540, 690)
    const cardWidth = cardHeight * (CARD_FRAME_ASPECT_RATIO + 0.055)
    const gap = Phaser.Math.Clamp(vw * 0.04, 56, 86)
    const totalWidth = cardWidth * artChoiceOptions.length + gap
    const firstX = vw / 2 - totalWidth / 2 + cardWidth / 2
    const centerY = Phaser.Math.Clamp(vh * 0.48, 24 + cardHeight / 2, vh - cardHeight / 2 - 24)

    this.cards = artChoiceOptions.map((choice, index) =>
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
    choice: ArtChoiceOption,
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

    const palette =
      choice.mode === 'free-drawing' ? CUTE_CARD_PALETTES.rose : CUTE_CARD_PALETTES.sage
    const tagText = choice.label

    const panel = this.add.graphics()
    container.add(panel)

    // ── top tag pill ──
    const tagFontSize = Math.round(height * 0.028)
    const tagLabel = this.add
      .text(0, 0, tagText, {
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

    // ── hero: rumi character image (1024×1024 square) ──
    // paint.png leaves more empty space around the owl (rainbow takes up the
    // upper-left), so it visually reads smaller — bump its display size a bit
    // to match the free-drawing card.
    const characterKey = choice.mode === 'free-drawing' ? 'art-card-free' : 'art-card-paint'
    const characterScale = choice.mode === 'free-drawing' ? 1 : 1.18
    const characterSize = height * CARD_LAYOUT.characterSize * characterScale
    const character = this.add
      .image(0, height * CARD_LAYOUT.characterCenterY, characterKey)
      .setDisplaySize(characterSize, characterSize)

    // ── title ──
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

    // ── description ──
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

    // ── select button ──
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

    container.add([tagBg, tagLabel, character, title, description, selectButton, selectLabel])

    const card: ArtCardView = {
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
      if (!card.container.visible || card.container.alpha <= 0) {
        return false
      }

      const scaleX = card.container.scaleX
      const scaleY = card.container.scaleY
      const width = card.width * scaleX
      const height = card.height * scaleY

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

  private startRumiConversation() {
    this.hoveredMode = null
    this.selectedMode = null
    this.isWaitingContentStart = false
    this.clearContentStartTimer()
    this.dialogPhase = 'intro'
    this.setIntroLine()
    this.isDialogVisible = true
    setInteractionIconActive(this.talkIcon, true)
    fadeSimpleDialog(this, this.dialog, 1, 220)
  }

  private setIntroLine() {
    const line = Phaser.Utils.Array.GetRandom(rumiSelectDialogs.greeting)
    setCenteredDialogText(this.dialog, line.text)
  }

  private advanceDialog() {
    if (this.dialogPhase === 'intro') {
      this.showChoicePrompt()
    }
  }

  private showChoicePrompt() {
    if (this.dialogPhase !== 'intro') {
      return
    }

    this.dialogPhase = 'choice'
    fadeSimpleDialog(this, this.dialog, 0, 160)
    this.time.delayedCall(110, () => {
      if (this.isDialogVisible && this.dialogPhase === 'choice') {
        this.showCards()
      }
    })
  }

  private handleCardHover(mode: ArtContentMode) {
    if (!this.isDialogVisible || this.isWaitingContentStart) {
      return
    }

    this.hoveredMode = mode
    this.updateCardStates()
  }

  private handleCardOut(mode: ArtContentMode) {
    if (this.isWaitingContentStart || this.hoveredMode !== mode) {
      return
    }

    this.hoveredMode = null
    this.updateCardStates()
  }

  private handleChoiceSelected(mode: ArtContentMode) {
    if (this.isTransitioning || this.isWaitingContentStart) {
      return
    }

    this.selectedMode = mode
    this.hoveredMode = null
    this.isWaitingContentStart = true
    this.dialogPhase = 'confirm'
    this.updateCardStates()
    this.hideCards()

    const line = Phaser.Utils.Array.GetRandom(rumiContentDialogs[mode].confirm)
    setCenteredDialogText(this.dialog, line.text)
    fadeSimpleDialog(this, this.dialog, 1, 180)

    this.contentStartTimer = this.time.delayedCall(CONTENT_CONFIRM_VISIBLE_MS, () => {
      this.contentStartTimer = null
      this.startSelectedContent(mode)
    })
  }

  private startSelectedContent(mode: ArtContentMode) {
    if (this.isTransitioning) {
      return
    }

    const targetSceneKey = ART_CONTENT_SCENE_KEYS[mode]
    if (!this.scene.manager.keys[targetSceneKey]) {
      this.closeDialog(true)
      return
    }

    this.isTransitioning = true
    this.target = null
    this.player.setVelocity(0, 0)
    this.closeDialog(false)
    fadeToScene(this, targetSceneKey, { duration: 220 })
  }

  private updateCardStates() {
    this.cards.forEach(card => {
      const isSelected = card.choice.mode === this.selectedMode
      const isHovered = card.choice.mode === this.hoveredMode
      const dimmed = this.isWaitingContentStart && !isSelected
      const alpha = dimmed ? 0.55 : 1
      const state = isSelected ? 'selected' : isHovered ? 'hover' : 'default'
      card.container.setScale(isSelected ? 1.035 : isHovered ? 1.02 : 1)
      card.container.setAlpha(alpha)
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

  private closeAlbum() {
    if (!this.isAlbumVisible) {
      this.isAlbumVisible = false
      return
    }

    this.scene.stop('ArtAlbumScene')
    this.isAlbumVisible = false
  }

  private returnToVillage() {
    if (this.isTransitioning) {
      return
    }

    this.isTransitioning = true
    this.target = null
    this.player.setVelocity(0, 0)

    if (this.isDialogVisible) {
      this.closeDialog(false)
    }

    fadeToScene(this, 'VillageScene', {
      duration: 250,
      data: {
        spawn: ART_RETURN_SPAWN,
        portalCooldownMs: 250,
      },
    })
  }
}
