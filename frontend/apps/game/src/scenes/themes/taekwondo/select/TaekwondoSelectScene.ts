import Phaser from 'phaser'
import { playSceneBgm } from '@/game/systems/sceneBgm'
import { assetPath } from '@/game/assets/assetPath'
import {
  createClickTargetMarker,
  createPlayer,
  ensurePlayerWalkAnimations,
  getTaekwondoBeltPlayerTextureKey,
  loadPlayerSpritesheets,
  loadTaekwondoBeltPlayerSpritesheets,
  type PlayerDirection,
  type PlayerSprite,
  updatePlayerMovement,
} from '@/game/entities/player'
import { resolvePatientProfileId } from '@/features/exerciseSessions/patientProfile'
import {
  DEFAULT_TAEKWONDO_BELT_COLOR,
  getLatestTaekwondoBeltColor,
  type TaekwondoBeltColor,
} from '@wish/api-client'
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
import { createRatioRectangle, isPointInRectangle } from '@/game/world/portal'
import {
  attachEmojiPalette,
  attachVillageRealtime,
  type AttachedEmojiPalette,
  type VillageRealtimeIntegration,
} from '@/features/village-realtime'
import { seokjaeSelectDialogs } from '../dialog/seokjaeDialogs'

const TAEKWONDO_SPRITE_FRAME = { width: 384, height: 512 }
const ROOM_SPAWN = { xRatio: 0.5, yRatio: 0.78 }
const EXIT_PORTAL = { xRatio: 0.45, yRatio: 0.8, widthRatio: 0.11, heightRatio: 0.26 }
const RETURN_SPAWN = { xRatio: 0.445, yRatio: 0.15 }
const SEOKJAE = { xRatio: 0.5, yRatio: 0.4, scaleRatio: 0.34 }
const SEOKJAE_INTERACTION = { radiusRatio: 0.08 }
const SEOKJAE_TALK_ICON_OFFSET = { yRatio: 0.15 }
const SEOKJAE_POSES = [4, 6, 7]
const RANDOM_POSE_DELAY = 500
const DEBUG_OBSTACLES = false
const OBSTACLE_EDITOR_ENABLED = import.meta.env.DEV
const OBSTACLE_EDITOR_MIN_SIZE = 0.003

type ObstacleRect = { x: number; y: number; w: number; h: number }
type ObstacleInstance = {
  rect: ObstacleRect
  object: Phaser.GameObjects.Rectangle
}

const ROOM_OBSTACLES: ObstacleRect[] = [
  { x: 0, y: 0.9595, w: 0.4243, h: 0.0392 },
  { x: 0.5785, y: 0.9542, w: 0.4208, h: 0.0431 },
  { x: 0.6153, y: 0.8471, w: 0.041, h: 0.1333 },
  { x: 0.3521, y: 0.8458, w: 0.0347, h: 0.1268 },
  { x: 0.3396, y: 0.8837, w: 0.0236, h: 0.0667 },
  { x: 0.3785, y: 0.8889, w: 0.0194, h: 0.0549 },
  { x: 0.6021, y: 0.881, w: 0.0271, h: 0.0523 },
  { x: 0.6507, y: 0.8876, w: 0.0187, h: 0.0523 },
  { x: 0.5771, y: 0.8745, w: 0.0187, h: 0.098 },
  { x: 0.4118, y: 0.8654, w: 0.0153, h: 0.1137 },
  { x: 0, y: 0.6523, w: 0.041, h: 0.1307 },
  { x: 0, y: 0.0052, w: 0.1396, h: 0.4732 },
  { x: 0, y: 0.4745, w: 0.0972, h: 0.0431 },
  { x: 0.0028, y: 0.5229, w: 0.0319, h: 0.1163 },
  { x: 0.0326, y: 0.5137, w: 0.0125, h: 0.102 },
  { x: 0.0444, y: 0.5085, w: 0.0125, h: 0.0784 },
  { x: 0.0618, y: 0.5137, w: 0.0104, h: 0.0431 },
  { x: 0.0986, y: 0.4588, w: 0.0326, h: 0.0418 },
  { x: 0.2687, y: 0, w: 0.0354, h: 0.4131 },
  { x: 0.1306, y: 0.1464, w: 0.134, h: 0.2418 },
  { x: 0.284, y: 0.1516, w: 0.7153, h: 0.2484 },
  { x: 0.8396, y: 0.3856, w: 0.0347, h: 0.0471 },
  { x: 0.8833, y: 0.3856, w: 0.0938, h: 0.0601 },
  { x: 0.9042, y: 0.4327, w: 0.0431, h: 0.0693 },
  { x: 0.9222, y: 0.4967, w: 0.0597, h: 0.0431 },
  { x: 0.9104, y: 0.515, w: 0.0201, h: 0.0222 },
  { x: 0.9576, y: 0.6392, w: 0.0417, h: 0.0353 },
  { x: 0.9431, y: 0.5333, w: 0.0299, h: 0.0575 },
  { x: 0.959, y: 0.5817, w: 0.0403, h: 0.0575 },
]

type TaekwondoSelectData = {
  beltColor?: TaekwondoBeltColor
}

export class TaekwondoSelectScene extends Phaser.Scene {
  /** 룸 ID — 같은 테마 select 에 들어온 환자끼리만 보이도록 (S14P31E103-794). */
  private static readonly REALTIME_ROOM_ID = 'taekwondo.select'

  private player!: PlayerSprite
  private villageRealtime: VillageRealtimeIntegration | null = null
  private emojiPalette: AttachedEmojiPalette | null = null
  private seokjaeNpc!: Phaser.GameObjects.Sprite
  private obstacles!: Phaser.Physics.Arcade.StaticGroup
  private obstacleInstances: ObstacleInstance[] = []
  private obstacleEditorDraft?: Phaser.GameObjects.Rectangle
  private obstacleEditorStart?: Phaser.Math.Vector2
  private seokjaeInteractionRadius = 0
  private talkIcon!: Phaser.GameObjects.Image
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private target: Phaser.Math.Vector2 | null = null
  private lastDirection: PlayerDirection = 'down'
  private exitPortal!: Phaser.Geom.Rectangle
  private randomPoseTimer?: Phaser.Time.TimerEvent
  private seokjaePoseIndex = 0
  private isTransitioning = false
  private isSceneShuttingDown = false
  private beltColor: TaekwondoBeltColor = DEFAULT_TAEKWONDO_BELT_COLOR
  private initialBeltColor: TaekwondoBeltColor = DEFAULT_TAEKWONDO_BELT_COLOR

  private dialog!: SimpleDialogUi
  private isDialogVisible = false
  private dialogDismissed = false

  private readonly handlePointerDown = (pointer: Phaser.Input.Pointer) => {
    if (this.emojiPalette?.consumePointerDown(pointer)) {
      return
    }

    if (this.handleObstacleEditorPointerDown(pointer)) {
      return
    }

    if (this.isDialogVisible) {
      const clickedDialog = this.dialog.frame.getBounds().contains(pointer.x, pointer.y)

      if (clickedDialog) {
        this.startPoomsaeSelectScene()
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
      this.startPoomsaeSelectScene()
    }
  }

  private readonly handleEscDown = () => {
    if (!this.isDialogVisible) {
      return
    }

    this.closeDialog(true)
  }

  constructor() {
    super({ key: 'TaekwondoSelectScene' })
  }

  init(data: TaekwondoSelectData = {}) {
    this.initialBeltColor = data.beltColor ?? DEFAULT_TAEKWONDO_BELT_COLOR
  }

  preload() {
    this.load.image(
      'taekwondo-room-background',
      assetPath('images/themes/taekwondo/background/taekwondo_inside.png'),
    )
    loadInteractionIcons(this)
    this.load.image('seokjae-dialog-frame', assetPath('images/npcs/seokjae/dialog-frame.png'))
    this.load.spritesheet(
      'seokjae',
      assetPath('images/themes/taekwondo/characters/seokjae_sprite.png'),
      {
        frameWidth: TAEKWONDO_SPRITE_FRAME.width,
        frameHeight: TAEKWONDO_SPRITE_FRAME.height,
        margin: 0,
        spacing: 0,
      },
    )
    loadPlayerSpritesheets(this)
    loadTaekwondoBeltPlayerSpritesheets(this)
  }

  create() {
    playSceneBgm(this)
    const { width: vw, height: vh } = this.scale
    this.isTransitioning = false
    this.isSceneShuttingDown = false
    this.beltColor = this.initialBeltColor
    this.seokjaePoseIndex = 0
    this.target = null
    this.obstacleInstances = []
    this.obstacleEditorStart = undefined
    this.obstacleEditorDraft?.destroy()
    this.obstacleEditorDraft = undefined
    this.isDialogVisible = false
    this.dialogDismissed = false

    const background = addCoverBackground(this, 'taekwondo-room-background')
    this.seokjaeInteractionRadius =
      Math.min(background.displayWidth, background.displayHeight) * SEOKJAE_INTERACTION.radiusRatio

    this.physics.world.setBounds(0, 0, vw, vh)
    this.obstacles = this.physics.add.staticGroup()
    ROOM_OBSTACLES.forEach(rect => this.addObstacleRect(rect, vw, vh))
    ensurePlayerWalkAnimations(this, getTaekwondoBeltPlayerTextureKey(this.beltColor))
    this.createSeokjaeNpc(vw, vh)
    this.createDialogUi()

    this.player = createPlayer(this, vw * ROOM_SPAWN.xRatio, vh * ROOM_SPAWN.yRatio, {
      textureKey: getTaekwondoBeltPlayerTextureKey(this.beltColor),
    })
    this.addSeokjaeObstacle(vw, vh)
    this.physics.add.collider(this.player, this.obstacles)
    this.exitPortal = createRatioRectangle(vw, vh, EXIT_PORTAL)
    void this.loadLatestBeltColor()

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
      roomId: TaekwondoSelectScene.REALTIME_ROOM_ID,
    })
    this.emojiPalette = attachEmojiPalette(this, {
      realtime: this.villageRealtime,
      getPlayer: () => this.player,
      isOverlayOpen: () => this.isDialogVisible,
    })

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.isSceneShuttingDown = true
      this.input.off('pointerdown', this.handlePointerDown)
      this.input.off('pointermove', this.handleObstacleEditorPointerMove)
      this.input.off('pointerup', this.handleObstacleEditorPointerUp)
      this.input.keyboard?.off('keydown-ENTER', this.handleEnterDown)
      this.input.keyboard?.off('keydown-ESC', this.handleEscDown)
      this.input.keyboard?.off('keydown-E', this.exportObstacleRects)
      this.input.keyboard?.off('keydown-R', this.clearEditedObstacleRects)
      this.randomPoseTimer?.remove(false)
      this.randomPoseTimer = undefined
      this.emojiPalette?.destroy()
      this.emojiPalette = null
      this.villageRealtime?.destroy()
      this.villageRealtime = null
    })

    this.cameras.main.fadeIn(250, 0, 0, 0)
  }

  private async loadLatestBeltColor() {
    const beltColor = await getLatestTaekwondoBeltColor(resolvePatientProfileId())

    if (this.isSceneShuttingDown || !this.player?.active) {
      return
    }

    this.beltColor = beltColor
    this.applyPlayerBeltColor()
  }

  private addObstacleRect(rect: ObstacleRect, vw: number, vh: number) {
    const x = Phaser.Math.Clamp(rect.x, 0, 1)
    const y = Phaser.Math.Clamp(rect.y, 0, 1)
    const w = Phaser.Math.Clamp(rect.w, 0, 1 - x)
    const h = Phaser.Math.Clamp(rect.h, 0, 1 - y)
    const box = this.add
      .rectangle(
        (x + w / 2) * vw,
        (y + h / 2) * vh,
        w * vw,
        h * vh,
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

  private addSeokjaeObstacle(vw: number, vh: number) {
    const size = Math.min(vw, vh)
    const box = this.add
      .rectangle(
        this.seokjaeNpc.x,
        this.seokjaeNpc.y + size * 0.075,
        size * 0.055,
        size * 0.05,
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

    const { width: vw, height: vh } = this.scale
    const rect = {
      x: bounds.x / vw,
      y: bounds.y / vh,
      w: bounds.width / vw,
      h: bounds.height / vh,
    }

    if (rect.w < OBSTACLE_EDITOR_MIN_SIZE || rect.h < OBSTACLE_EDITOR_MIN_SIZE) {
      return
    }

    this.addObstacleRect(rect, vw, vh)
  }

  private getObstacleDragBounds(start: Phaser.Math.Vector2, currentX: number, currentY: number) {
    const { width: vw, height: vh } = this.scale
    const x = Phaser.Math.Clamp(Math.min(start.x, currentX), 0, vw)
    const y = Phaser.Math.Clamp(Math.min(start.y, currentY), 0, vh)
    const right = Phaser.Math.Clamp(Math.max(start.x, currentX), 0, vw)
    const bottom = Phaser.Math.Clamp(Math.max(start.y, currentY), 0, vh)
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
    const output = `const ROOM_OBSTACLES: ObstacleRect[] = [\n${lines.join('\n')}\n]`

    console.info('[TaekwondoSelectScene] Exported obstacle rectangles:\n' + output)
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

  private applyPlayerBeltColor() {
    const textureKey = getTaekwondoBeltPlayerTextureKey(this.beltColor)
    ensurePlayerWalkAnimations(this, textureKey)

    if (this.player.texture.key === textureKey) {
      return
    }

    this.player.anims.stop()
    this.player.setTexture(textureKey, 0)
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
    this.updateSeokjaeTalkIcon()
    this.updateSeokjaeConversation()

    if (
      !this.isDialogVisible &&
      !this.isTransitioning &&
      isPointInRectangle(this.exitPortal, this.player.x, this.player.y)
    ) {
      this.returnToVillage()
    }
  }

  private updateSeokjaeConversation() {
    if (this.isTransitioning) {
      return
    }

    const isNearSeokjae = this.getDistanceToSeokjae() <= this.seokjaeInteractionRadius

    if (!isNearSeokjae) {
      this.dialogDismissed = false
      return
    }

    if (!this.isDialogVisible && !this.dialogDismissed) {
      this.startSeokjaeConversation()
    }
  }

  private startSeokjaeConversation() {
    this.setIntroLine()
    this.isDialogVisible = true
    setInteractionIconActive(this.talkIcon, true)
    fadeSimpleDialog(this, this.dialog, 1, 220)
  }

  private createSeokjaeNpc(vw: number, vh: number) {
    this.seokjaeNpc = this.add
      .sprite(vw * SEOKJAE.xRatio, vh * SEOKJAE.yRatio, 'seokjae', 0)
      .setDepth(6)
    const scale = (Math.min(vw, vh) / TAEKWONDO_SPRITE_FRAME.height) * SEOKJAE.scaleRatio
    this.seokjaeNpc.setScale(scale)
    this.createSeokjaeTalkIcon(vh)
    this.startRandomSeokjaePose()
  }

  private createSeokjaeTalkIcon(vh: number) {
    this.talkIcon = createFloatingInteractionIcon(this, {
      x: this.seokjaeNpc.x,
      y: this.seokjaeNpc.y - vh * SEOKJAE_TALK_ICON_OFFSET.yRatio,
    })
  }

  private updateSeokjaeTalkIcon() {
    setInteractionIconActive(this.talkIcon, this.isDialogVisible)
  }

  private getDistanceToSeokjae() {
    return Phaser.Math.Distance.Between(
      this.player.x,
      this.player.y,
      this.seokjaeNpc.x,
      this.seokjaeNpc.y,
    )
  }

  private createDialogUi() {
    this.dialog = createSimpleDialogUi(this, {
      ...NPC_DIALOG_FRAME_LAYOUT,
      frameKey: 'seokjae-dialog-frame',
      nameText: '석재',
    })
  }

  private setIntroLine() {
    const line = Phaser.Utils.Array.GetRandom(seokjaeSelectDialogs)
    setCenteredDialogText(this.dialog, line.text)
  }

  private closeDialog(markDismissed: boolean) {
    this.isDialogVisible = false
    this.dialogDismissed = markDismissed
    setInteractionIconActive(this.talkIcon, false)
    fadeSimpleDialog(this, this.dialog, 0, 180)
  }

  private startRandomSeokjaePose() {
    this.randomPoseTimer?.remove(false)
    this.seokjaeNpc.setFrame(SEOKJAE_POSES[this.seokjaePoseIndex])
    this.randomPoseTimer = this.time.addEvent({
      delay: RANDOM_POSE_DELAY,
      loop: true,
      callback: () => {
        this.seokjaePoseIndex = (this.seokjaePoseIndex + 1) % SEOKJAE_POSES.length
        this.seokjaeNpc.setFrame(SEOKJAE_POSES[this.seokjaePoseIndex])
      },
    })
  }

  private startPoomsaeSelectScene() {
    if (this.isTransitioning) {
      return
    }

    this.isTransitioning = true
    this.target = null
    this.player.setVelocity(0, 0)
    this.closeDialog(false)
    fadeToScene(this, 'TaekwondoPoomsaeSelectScene', {
      duration: 220,
      data: { beltColor: this.beltColor },
    })
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
        spawn: RETURN_SPAWN,
        portalCooldownMs: 250,
      },
    })
  }
}
