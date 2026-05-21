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
import { addCoverBackground } from '@/game/world/background'
import { createRatioRectangle, getRectangleEntryState } from '@/game/world/portal'
import {
  attachEmojiPalette,
  attachVillageRealtime,
  type AttachedEmojiPalette,
  type VillageRealtimeIntegration,
} from '@/features/village-realtime'
import { gisungChoiceDialogs, gisungSelectDialogs } from '../dialog/gisungDialogs'

// gisung_sprite.png is 2400x600 with four dogs in 600-wide cells, but the
// dogs aren't perfectly centered in their cells (dog 1 center=356, dog 2
// center=932 within naive 600-wide halves). We only use the first two frames
// and slice them as 576x600 windows centered on each dog so animation stays
// rock-steady: frame 0 = x[68..644], frame 1 = x[644..1220].
const MUSIC_SPRITE_FRAME = { width: 576, height: 600 }
const MUSIC_SPRITE_FRAME_RECTS: Array<{ x: number; y: number; w: number; h: number }> = [
  { x: 68, y: 0, w: 576, h: 600 },
  { x: 644, y: 0, w: 576, h: 600 },
]
const MUSIC_ROOM_SPAWN = { xRatio: 0.5, yRatio: 0.78 }
const MUSIC_EXIT_PORTAL = { xRatio: 0.43, yRatio: 0.86, widthRatio: 0.14, heightRatio: 0.12 }
const MUSIC_RETURN_SPAWN = { xRatio: 0.238, yRatio: 0.228 }
const GISUNG_ON_WINDOW = { xRatio: 0.5, yRatio: 0.42, heightRatio: 0.32 }
const GISUNG_INTERACTION_RADIUS_RATIO = 0.16
const GISUNG_TALK_ICON_OFFSET_RATIO = 1.18
const CONTENT_CONFIRM_VISIBLE_MS = 1300
const RHYTHM_TARGET_SCENE_KEY = 'MusicSongSelectScene'
const DEBUG_OBSTACLES = false
const OBSTACLE_EDITOR_ENABLED = import.meta.env.DEV
const OBSTACLE_EDITOR_MIN_SIZE = 0.003

// Flow: 인사 → 게임 설명 → 출발 신호. Picked from existing dialog pool so
// the lines flow naturally (no repeated phrases like "귀를 쫑긋").
const INTRO_LINES = [
  gisungSelectDialogs.greeting[0].text, // "오늘은 음악으로 놀아볼 시간이야!"
  gisungChoiceDialogs['rhythm-game'].hover[0].text, // "노래를 잘 듣고, 알맞은 순간에..."
]
const CONFIRM_LINE = gisungChoiceDialogs['rhythm-game'].confirm[1].text // "좋아! 하나, 둘, 셋!..."

type MusicSelectSceneData = {
  spawn?: RatioPoint
}

type MusicDialogPhase = 'closed' | 'intro' | 'confirm'
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

const MUSIC_ROOM_OBSTACLES: ObstacleRect[] = [
  { x: 0, y: 0, w: 1, h: 0.32 },
  { x: 0.345, y: 0.04, w: 0.05, h: 0.33 },
  { x: 0.595, y: 0.04, w: 0.055, h: 0.33 },
  { x: 0.1096, y: 0.302, w: 0.0312, h: 0.1085 },
  { x: 0.1321, y: 0.302, w: 0.2251, h: 0.0562 },
  { x: 0.17, y: 0.332, w: 0.1527, h: 0.0588 },
  { x: 0.3838, y: 0.3085, w: 0.3008, h: 0.0523 },
  { x: 0.6773, y: 0.3242, w: 0.1673, h: 0.0928 },
  { x: 0.7756, y: 0.4, w: 0.0744, h: 0.0444 },
  { x: 0.8074, y: 0.4405, w: 0.0226, h: 0.0248 },
  { x: 0.6985, y: 0.4144, w: 0.079, h: 0.0288 },
  { x: 0.7463, y: 0.4353, w: 0.0153, h: 0.0549 },
  { x: 0.7663, y: 0.4327, w: 0.008, h: 0.0431 },
  { x: 0.6985, y: 0.434, w: 0.006, h: 0.034 },
  { x: 0.8479, y: 0.3582, w: 0.0452, h: 0.1673 },
  { x: 0.9044, y: 0.3739, w: 0.073, h: 0.1085 },
  { x: 0.9163, y: 0.4876, w: 0.0611, h: 0.0314 },
  { x: 0.9276, y: 0.5216, w: 0.0498, h: 0.0183 },
  { x: 0.9402, y: 0.5399, w: 0.0372, h: 0.0314 },
  { x: 0.9475, y: 0.5595, w: 0.0299, h: 0.0327 },
  { x: 0.8991, y: 0.6471, w: 0.0339, h: 0.1673 },
  { x: 0.9475, y: 0.6601, w: 0.0299, h: 0.1804 },
  { x: 0.9064, y: 0.6314, w: 0.0252, h: 0.0288 },
  { x: 0.8845, y: 0.834, w: 0.075, h: 0.0863 },
  { x: 0.7105, y: 0.783, w: 0.1574, h: 0.1373 },
  { x: 0.8021, y: 0.7608, w: 0.0126, h: 0.0261 },
  { x: 0.822, y: 0.7542, w: 0.0106, h: 0.0327 },
  { x: 0.7304, y: 0.7255, w: 0.0292, h: 0.0758 },
  { x: 0.2032, y: 0.7281, w: 0.0299, h: 0.102 },
  { x: 0.2311, y: 0.7503, w: 0.0697, h: 0.081 },
  { x: 0.3048, y: 0.7712, w: 0.0299, h: 0.0719 },
  { x: 0.3207, y: 0.8418, w: 0.0033, h: 0.0601 },
  { x: 0.166, y: 0.8444, w: 0.0452, h: 0.0771 },
  { x: 0.0731, y: 0.8092, w: 0.0425, h: 0.0954 },
  { x: 0.1102, y: 0.7608, w: 0.0452, h: 0.1007 },
  { x: 0.0611, y: 0.651, w: 0.0438, h: 0.0536 },
  { x: 0.075, y: 0.6314, w: 0.0232, h: 0.0471 },
  { x: 0.0697, y: 0.6876, w: 0.0272, h: 0.0915 },
  { x: 0.0306, y: 0.7072, w: 0.0305, h: 0.1176 },
  { x: 0.0219, y: 0.3425, w: 0.087, h: 0.0667 },
  { x: 0.0219, y: 0.4052, w: 0.0691, h: 0.0536 },
  { x: 0.0233, y: 0.4549, w: 0.0525, h: 0.0366 },
  { x: 0.0219, y: 0.502, w: 0.0339, h: 0.0353 },
  { x: 0.0219, y: 0.5399, w: 0.0193, h: 0.0392 },
  { x: 0.34, y: 0.8641, w: 0.0511, h: 0.1346 },
  { x: 0.4084, y: 0.8863, w: 0.0093, h: 0.1085 },
  { x: 0.6315, y: 0.8732, w: 0.0352, h: 0.1203 },
  { x: 0.5943, y: 0.8863, w: 0.0086, h: 0.1098 },
  { x: 0.8327, y: 0.3163, w: 0.1448, h: 0.0562 },
]

export class MusicSelectScene extends Phaser.Scene {
  /** 룸 ID — 같은 테마 select 에 들어온 환자끼리만 보이도록 (S14P31E103-794). */
  private static readonly REALTIME_ROOM_ID = 'music.select'

  private player!: PlayerSprite
  private villageRealtime: VillageRealtimeIntegration | null = null
  private emojiPalette: AttachedEmojiPalette | null = null
  private gisungNpc!: Phaser.GameObjects.Sprite
  private obstacles!: Phaser.Physics.Arcade.StaticGroup
  private obstacleInstances: ObstacleInstance[] = []
  private obstacleEditorDraft?: Phaser.GameObjects.Rectangle
  private obstacleEditorStart?: Phaser.Math.Vector2
  private gisungAnchor = new Phaser.Math.Vector2()
  private gisungInteractionRadius = 0
  private talkIcon!: Phaser.GameObjects.Image
  private dialog!: SimpleDialogUi
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private target: Phaser.Math.Vector2 | null = null
  private lastDirection: PlayerDirection = 'down'
  private exitPortal!: Phaser.Geom.Rectangle
  private playerWasInExitPortal = true
  private isTransitioning = false
  private isDialogVisible = false
  private dialogDismissed = false
  private dialogPhase: MusicDialogPhase = 'closed'
  private introStep = 0
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
        this.advanceIntro()
        return
      }

      if (clickedDialog) {
        return
      }

      this.closeDialog(true)
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
    if (this.isDialogVisible) {
      this.closeDialog(true)
    }
  }

  constructor() {
    super({ key: 'MusicSelectScene' })
  }

  preload() {
    this.load.image('music-background', assetPath('images/themes/music/background/background.png'))
    // load as a plain image — frames are defined manually in create() because
    // the two dogs are not symmetrically placed within naive halves of the sheet
    this.load.image(
      'music-gisung-sprite',
      assetPath('images/themes/music/characters/gisung_sprite.png'),
    )
    loadInteractionIcons(this)
    this.load.image('gisung-dialog-frame', assetPath('images/npcs/gisung/dialog-frame.png'))
    loadPlayerSpritesheets(this)
  }

  create(data: MusicSelectSceneData = {}) {
    playSceneBgm(this)
    const { width: vw, height: vh } = this.scale
    this.isTransitioning = false
    this.isDialogVisible = false
    this.dialogDismissed = false
    this.dialogPhase = 'closed'
    this.introStep = 0
    this.isWaitingContentStart = false
    this.target = null
    this.playerWasInExitPortal = true
    this.obstacleInstances = []
    this.obstacleEditorStart = undefined
    this.obstacleEditorDraft?.destroy()
    this.obstacleEditorDraft = undefined
    this.clearContentStartTimer()

    const background = addCoverBackground(this, 'music-background')
    this.backgroundDisplayArea = this.getBackgroundDisplayArea(background)
    this.setupGisungFrames()
    this.createGisungAnimation()
    this.createGisungOnWindow(background)
    this.createDialogUi()

    this.physics.world.setBounds(0, 0, vw, vh)
    this.obstacles = this.physics.add.staticGroup()
    MUSIC_ROOM_OBSTACLES.forEach(rect => this.addObstacleRect(rect))
    ensurePlayerWalkAnimations(this)

    const spawn = data.spawn ?? MUSIC_ROOM_SPAWN
    this.player = createPlayer(this, vw * spawn.xRatio, vh * spawn.yRatio)
    this.addGisungObstacle()
    this.physics.add.collider(this.player, this.obstacles)
    this.exitPortal = createRatioRectangle(vw, vh, MUSIC_EXIT_PORTAL)

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
      roomId: MusicSelectScene.REALTIME_ROOM_ID,
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
      this.input.keyboard?.off('keydown-ENTER', this.handleEnterDown)
      this.input.keyboard?.off('keydown-ESC', this.handleEscDown)
      this.input.keyboard?.off('keydown-E', this.exportObstacleRects)
      this.input.keyboard?.off('keydown-R', this.clearEditedObstacleRects)
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
      blocked: this.isTransitioning || this.isDialogVisible,
    })
    this.target = movement.target
    this.lastDirection = movement.lastDirection

    this.villageRealtime?.publishLocal(this.player, this.lastDirection, movement.moving)
    this.emojiPalette?.update()
    this.updateGisungConversation()

    if (this.isDialogVisible) {
      return
    }

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

  private setupGisungFrames() {
    const tex = this.textures.get('music-gisung-sprite')
    if (tex.has('0') && tex.has('1')) {
      return
    }
    MUSIC_SPRITE_FRAME_RECTS.forEach((rect, index) => {
      tex.add(index, 0, rect.x, rect.y, rect.w, rect.h)
    })
  }

  private createGisungAnimation() {
    if (this.anims.exists('music-gisung-play')) {
      return
    }

    this.anims.create({
      key: 'music-gisung-play',
      frames: this.anims.generateFrameNumbers('music-gisung-sprite', { start: 0, end: 1 }),
      frameRate: 1,
      repeat: -1,
    })
  }

  private createGisungOnWindow(background: Phaser.GameObjects.Image) {
    const backgroundLeft = background.x - background.displayWidth / 2
    const backgroundTop = background.y - background.displayHeight / 2
    const frameAspect = MUSIC_SPRITE_FRAME.width / MUSIC_SPRITE_FRAME.height
    const targetHeight = Math.min(
      background.displayHeight * GISUNG_ON_WINDOW.heightRatio,
      (background.displayWidth * 0.14) / frameAspect,
    )
    const displayHeight = targetHeight
    const displayWidth = targetHeight * frameAspect

    this.gisungNpc = this.add
      .sprite(
        backgroundLeft + background.displayWidth * GISUNG_ON_WINDOW.xRatio,
        backgroundTop + background.displayHeight * GISUNG_ON_WINDOW.yRatio,
        'music-gisung-sprite',
        0,
      )
      .setOrigin(0.5, 0.5)
      .setDepth(4)

    this.gisungNpc.setDisplaySize(displayWidth, displayHeight)
    this.gisungNpc.anims.play('music-gisung-play')
    this.gisungAnchor.set(this.gisungNpc.x, this.gisungNpc.y)
    this.gisungInteractionRadius =
      Math.min(background.displayWidth, background.displayHeight) * GISUNG_INTERACTION_RADIUS_RATIO

    this.talkIcon = createFloatingInteractionIcon(this, {
      x: this.gisungNpc.x,
      y: this.gisungNpc.y - this.gisungNpc.displayHeight * (GISUNG_TALK_ICON_OFFSET_RATIO - 0.5),
      displaySize: 44,
      depth: 6,
      bobOffset: 8,
    })
  }

  private getBackgroundDisplayArea(background: Phaser.GameObjects.Image): BackgroundDisplayArea {
    return {
      x: background.x - background.displayWidth / 2,
      y: background.y - background.displayHeight / 2,
      width: background.displayWidth,
      height: background.displayHeight,
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

  private addGisungObstacle() {
    const box = this.add
      .rectangle(
        this.gisungAnchor.x,
        this.gisungAnchor.y + this.gisungNpc.displayHeight * 0.18,
        this.gisungNpc.displayWidth * 0.32,
        this.gisungNpc.displayHeight * 0.22,
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
    const output = `const MUSIC_ROOM_OBSTACLES: ObstacleRect[] = [\n${lines.join('\n')}\n]`

    console.info('[MusicSelectScene] Exported obstacle rectangles:\n' + output)
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

  private createDialogUi() {
    this.dialog = createSimpleDialogUi(this, {
      ...NPC_DIALOG_FRAME_LAYOUT,
      frameKey: 'gisung-dialog-frame',
      nameText: '기성',
    })
  }

  private updateGisungConversation() {
    if (this.isTransitioning) {
      return
    }

    const distanceToGisung = Phaser.Math.Distance.Between(
      this.player.x,
      this.player.y,
      this.gisungAnchor.x,
      this.gisungAnchor.y,
    )
    const isNearGisung = distanceToGisung <= this.gisungInteractionRadius

    setInteractionIconActive(this.talkIcon, this.isDialogVisible)

    if (!isNearGisung) {
      this.dialogDismissed = false
      return
    }

    if (!this.isDialogVisible && !this.dialogDismissed) {
      this.startGisungConversation()
    }
  }

  private startGisungConversation() {
    this.isWaitingContentStart = false
    this.clearContentStartTimer()
    this.dialogPhase = 'intro'
    this.introStep = 0
    setCenteredDialogText(this.dialog, INTRO_LINES[0])
    this.isDialogVisible = true
    setInteractionIconActive(this.talkIcon, true)
    fadeSimpleDialog(this, this.dialog, 1, 220)
  }

  private advanceDialog() {
    if (this.dialogPhase === 'intro') {
      this.advanceIntro()
    }
  }

  private advanceIntro() {
    if (this.dialogPhase !== 'intro' || this.isWaitingContentStart) {
      return
    }

    if (this.introStep < INTRO_LINES.length - 1) {
      this.introStep += 1
      setCenteredDialogText(this.dialog, INTRO_LINES[this.introStep])
      return
    }

    this.showConfirm()
  }

  private showConfirm() {
    this.dialogPhase = 'confirm'
    this.isWaitingContentStart = true
    setCenteredDialogText(this.dialog, CONFIRM_LINE)

    this.contentStartTimer = this.time.delayedCall(CONTENT_CONFIRM_VISIBLE_MS, () => {
      this.contentStartTimer = null
      this.startRhythmContent()
    })
  }

  private startRhythmContent() {
    if (this.isTransitioning) {
      return
    }

    if (!this.scene.manager.keys[RHYTHM_TARGET_SCENE_KEY]) {
      this.closeDialog(true)
      return
    }

    this.isTransitioning = true
    this.target = null
    this.player.setVelocity(0, 0)
    this.closeDialog(false)
    fadeToScene(this, RHYTHM_TARGET_SCENE_KEY, { duration: 220 })
  }

  private closeDialog(markDismissed: boolean) {
    this.clearContentStartTimer()
    this.isDialogVisible = false
    this.dialogDismissed = markDismissed
    this.dialogPhase = 'closed'
    this.introStep = 0
    this.isWaitingContentStart = false
    setInteractionIconActive(this.talkIcon, false)
    fadeSimpleDialog(this, this.dialog, 0, 180)
  }

  private clearContentStartTimer() {
    this.contentStartTimer?.remove(false)
    this.contentStartTimer = null
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
        spawn: MUSIC_RETURN_SPAWN,
        portalCooldownMs: 250,
      },
    })
  }
}
