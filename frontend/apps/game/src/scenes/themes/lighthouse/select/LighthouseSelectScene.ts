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
import { getPlayerMoveSpeed } from '@/game/settings/gameSettings'
import { fadeToScene } from '@/game/systems/sceneTransition'
import { getGameWeather } from '@/features/weather/weatherStore'
import type { WeatherCondition } from '@/features/weather/types'
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
import { NpcInteractionHintUi } from '@/game/ui/npcInteractionHint'
import { addCoverBackground } from '@/game/world/background'
import { createRatioRectangle, isPointInRectangle } from '@/game/world/portal'
import {
  attachEmojiPalette,
  attachVillageRealtime,
  type AttachedEmojiPalette,
  type VillageRealtimeIntegration,
} from '@/features/village-realtime'
import {
  createEmotionCheckinAnalysis,
  type EmotionCheckinAnalysis,
  type SelectedChoiceEvent,
} from '../dialog/emotionAnalytics'
import {
  getLighthouseEmotionScene,
  getChoiceDisplayText,
  getQuestionDisplayText,
  getSecondaryAction,
  getVisibleChoices,
  LIGHTHOUSE_EMOTION_CLOSING_SCENE_ID,
  LIGHTHOUSE_MAX_QUESTION_SCENES,
  LIGHTHOUSE_REST_CLOSING_SCENE_ID,
  logDialogueGraphForReview,
  validateDialogueGraph,
  waveMeterCards,
  type LighthouseEmotionChoice,
  type LighthouseEmotionScene,
  type WaveMeterCard,
} from '../dialog/lighthouseEmotionDialogue'
import {
  childComfortSettings,
  createLighthousePlayEvent,
  emotionCheckinConfig,
  emotionCheckinEffectConfig,
  getCompanionReaction,
  getDecorRewardForSession,
  getMicroFeedback,
  neutralCheckinReward,
  postcardConfig,
  type LighthousePlayEvent,
} from '../dialog/lighthouseEngagement'

const LIGHTHOUSE_ROOM_SPAWN = { xRatio: 0.3, yRatio: 0.76 }
const LIGHTHOUSE_EXIT_PORTAL = { xRatio: 0.28, yRatio: 0.86, widthRatio: 0.18, heightRatio: 0.14 }
const LIGHTHOUSE_RETURN_SPAWN = { xRatio: 0.7, yRatio: 0.68 }
const YOUNGCHEOL_POSITION = { xRatio: 0.28, yRatio: 0.66, heightRatio: 0.18 }
const YOUNGCHEOL_TALK_ICON_OFFSET_RATIO = 0.205
const YOUNGCHEOL_INTERACTION = { xRatio: 0.28, yRatio: 0.64, radiusRatio: 0.06 }
const SYSTEM_PROMPT_DEPTH = 28
const CHOICE_BUTTON_DEPTH = 29
const ENGAGEMENT_DEPTH = 31
const POSTCARD_DEPTH = 34
const CHILD_REPLY_DELAY_MS = 520
const CHILD_CHOICE_PROMPT = '선택: 지금 마음에 가까운 말'
const WAVE_METER_PROMPT = '마음 파도계\n지난 며칠 동안 마음의 파도는?'
const WAVE_METER_LAST_SHOWN_KEY = 'lighthouseWaveMeterLastShownDate'
const LIGHTHOUSE_BACKGROUND_KEY = 'lighthouse-background'
const LIGHTHOUSE_CLOUDY_BACKGROUND_KEY = 'lighthouse-background-cloudy'
const DEBUG_OBSTACLES = false
const OBSTACLE_EDITOR_ENABLED = import.meta.env.DEV
const OBSTACLE_EDITOR_MIN_SIZE = 0.003
const CHOICE_BUTTON = {
  gap: 10,
  widthRatio: 0.48,
  maxWidth: 620,
  height: 58,
  radius: 8,
  paddingX: 64,
  bottomGap: 14,
}
const SYSTEM_PROMPT_PANEL = {
  widthRatio: 0.62,
  maxWidth: 860,
  height: 70,
  bottomMargin: 42,
  radius: 10,
  paddingX: 28,
}

type LighthouseUiMode = 'GAMEPLAY' | 'NPC_DIALOGUE' | 'PLAYER_CHOICE' | 'SYSTEM_PROMPT' | 'POSTCARD'

type LighthouseDialogPhase =
  | 'closed'
  | 'scene-lines'
  | 'choosing'
  | 'selected'
  | 'reply'
  | 'summary'
  | 'wave-meter'

type ChoiceButtonVisualState = 'normal' | 'hover' | 'focused' | 'pressed' | 'disabled'

type ChoiceButton = {
  container: Phaser.GameObjects.Container
  background: Phaser.GameObjects.Graphics
  marker: Phaser.GameObjects.Text
  label: Phaser.GameObjects.Text
  baseY: number
  choice: LighthouseEmotionChoice
  isRestButton: boolean
  disabled: boolean
  state: ChoiceButtonVisualState
  index: number
  width: number
  height: number
}

type SystemPromptUi = {
  panel: Phaser.GameObjects.Graphics
  text: Phaser.GameObjects.Text
  width: number
  height: number
  baseY: number
}

type EngagementUi = {
  light: Phaser.GameObjects.Arc
  environment: Phaser.GameObjects.Rectangle
  companion: Phaser.GameObjects.Container
  companionBody: Phaser.GameObjects.Arc
  companionWing: Phaser.GameObjects.Arc
  companionName: Phaser.GameObjects.Text
  toastPanel: Phaser.GameObjects.Graphics
  toastText: Phaser.GameObjects.Text
  skipText: Phaser.GameObjects.Text
  activityText: Phaser.GameObjects.Text
}

type PostcardUi = {
  container: Phaser.GameObjects.Container
  overlay: Phaser.GameObjects.Rectangle
  panel: Phaser.GameObjects.Graphics
  title: Phaser.GameObjects.Text
  body: Phaser.GameObjects.Text
  decor: Phaser.GameObjects.Text
  savedText: Phaser.GameObjects.Text
  saveButton: Phaser.GameObjects.Text
  closeButton: Phaser.GameObjects.Text
}

type LighthouseSelectSceneData = {
  spawn?: RatioPoint
}

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

const LIGHTHOUSE_OBSTACLES: ObstacleRect[] = [
  { x: 0, y: 0, w: 1, h: 0.37 },
  { x: 0, y: 0.37, w: 0.22, h: 0.2 },
  { x: 0.67, y: 0.66, w: 0.33, h: 0.25 },
  { x: 0.86, y: 0.89, w: 0.14, h: 0.11 },
  { x: 0.2118, y: 0.3686, w: 0.1743, h: 0.1468 },
  { x: 0.3424, y: 0.4673, w: 0.0833, h: 0.1172 },
  { x: 0.3882, y: 0.5426, w: 0.0722, h: 0.0814 },
  { x: 0.434, y: 0.5969, w: 0.0736, h: 0.0642 },
  { x: 0.4951, y: 0.6499, w: 0.1181, h: 0.0938 },
  { x: 0.5701, y: 0.724, w: 0.1208, h: 0.095 },
  { x: 0.6292, y: 0.7955, w: 0.0611, h: 0.0975 },
  { x: 0.7854, y: 0.8807, w: 0.1028, h: 0.0888 },
  { x: 0, y: 0.5709, w: 0.1368, h: 0.0494 },
  { x: 0, y: 0.6265, w: 0.1139, h: 0.0345 },
  { x: 0, y: 0.6647, w: 0.0764, h: 0.0247 },
  { x: 0, y: 0.6832, w: 0.0688, h: 0.1271 },
  { x: 0.0799, y: 0.7659, w: 0.0556, h: 0.0494 },
]

type FinishEmotionCheckinReason =
  | 'completed'
  | 'rest'
  | 'max_steps'
  | 'missing_followup'
  | 'error_fallback'

function isLighthouseCloudyWeather(condition: WeatherCondition) {
  return (
    condition === 'CLOUDY' ||
    condition === 'PARTLY_CLOUDY' ||
    condition === 'RAIN' ||
    condition === 'HEAVY_RAIN' ||
    condition === 'SNOW' ||
    condition === 'FOG' ||
    condition === 'THUNDER'
  )
}

export class LighthouseSelectScene extends Phaser.Scene {
  /** 룸 ID — 같은 테마 select 에 들어온 환자끼리만 보이도록 (S14P31E103-794). */
  private static readonly REALTIME_ROOM_ID = 'lighthouse.select'

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
  private isDialogVisible = false
  private dialogDismissed = false
  private uiMode: LighthouseUiMode = 'NPC_DIALOGUE'
  private dialogPhase: LighthouseDialogPhase = 'closed'
  private talkIcon!: Phaser.GameObjects.Image
  private youngcheolAnchor = new Phaser.Math.Vector2()
  private youngcheolInteractionRadius = 0
  private dialog!: SimpleDialogUi
  private systemPrompt!: SystemPromptUi
  private choiceButtons: ChoiceButton[] = []
  private focusedChoiceIndex = 0
  private replyTimer?: Phaser.Time.TimerEvent
  private gamepadChoiceInputAvailableAt = 0
  private currentScene: LighthouseEmotionScene | null = null
  private activeChoices: LighthouseEmotionChoice[] = []
  private pendingChoice: LighthouseEmotionChoice | null = null
  private selectedChoiceEvents: SelectedChoiceEvent[] = []
  private selectedChoiceSceneCount = 0
  private sessionId = ''
  private selectedWaveMeterCard: WaveMeterCard | undefined
  private analysis: EmotionCheckinAnalysis | null = null
  private playEvents: LighthousePlayEvent[] = []
  private engagementUi!: EngagementUi
  private postcardUi!: PostcardUi
  private focusedPostcardActionIndex = 0
  private savedPostcards: Array<{ sessionId: string; message: string; savedAt: number }> = []
  private engagementTimers: Phaser.Time.TimerEvent[] = []
  private engagementInProgress = false
  private isChoiceTransitioning = false
  private isEmotionCheckinActive = false
  private hasPostcardBeenShown = false
  private isEmotionCheckinFinishing = false
  private isBackendEmotionDialogueOpen = false
  private interactionHint!: NpcInteractionHintUi
  private pendingAfterEngagement: (() => void) | null = null
  private soundMuted = false
  private caregiverDebugText: Phaser.GameObjects.Text | null = null
  private backgroundDisplayArea!: BackgroundDisplayArea

  constructor() {
    super({ key: 'LighthouseSelectScene' })
  }

  preload() {
    this.load.image(
      LIGHTHOUSE_BACKGROUND_KEY,
      assetPath('images/themes/lighthouse/background/Lighthouse.png'),
    )
    this.load.image(
      LIGHTHOUSE_CLOUDY_BACKGROUND_KEY,
      assetPath('images/themes/lighthouse/background/lighthousecloudy.png'),
    )
    this.load.image(
      'lighthouse-youngcheol',
      assetPath('images/themes/lighthouse/characters/youngcheolbuji.png'),
    )
    this.load.image(
      'lighthouse-youngcheol-dialog-frame',
      assetPath('images/npcs/yeongcheol/dialog-frame.png'),
    )
    loadInteractionIcons(this)
    loadPlayerSpritesheets(this)
  }

  create(data: LighthouseSelectSceneData = {}) {
    playSceneBgm(this)
    const { width: vw, height: vh } = this.scale
    this.cameras.main.resetFX()
    this.cameras.main.setAlpha(1)
    this.isTransitioning = false
    this.isDialogVisible = false
    this.dialogDismissed = false
    this.uiMode = 'NPC_DIALOGUE'
    this.dialogPhase = 'closed'
    this.isChoiceTransitioning = false
    this.focusedChoiceIndex = 0
    this.focusedPostcardActionIndex = 0
    this.target = null
    this.obstacleInstances = []
    this.obstacleEditorStart = undefined
    this.obstacleEditorDraft?.destroy()
    this.obstacleEditorDraft = undefined
    this.resetEmotionCheckinSession()

    const background = addCoverBackground(this, LIGHTHOUSE_BACKGROUND_KEY)
    this.applyWeatherBackground(background)
    const backgroundLeft = background.x - background.displayWidth / 2
    const backgroundTop = background.y - background.displayHeight / 2
    this.backgroundDisplayArea = {
      x: backgroundLeft,
      y: backgroundTop,
      width: background.displayWidth,
      height: background.displayHeight,
    }

    this.createYoungcheolCharacter(
      backgroundLeft,
      backgroundTop,
      background.displayWidth,
      background.displayHeight,
    )

    this.talkIcon = createFloatingInteractionIcon(this, {
      x: backgroundLeft + background.displayWidth * YOUNGCHEOL_POSITION.xRatio,
      y:
        backgroundTop +
        background.displayHeight * (YOUNGCHEOL_POSITION.yRatio - YOUNGCHEOL_TALK_ICON_OFFSET_RATIO),
      displaySize: 44,
      depth: 7,
      bobOffset: 10,
    })

    this.youngcheolAnchor.set(
      backgroundLeft + background.displayWidth * YOUNGCHEOL_INTERACTION.xRatio,
      backgroundTop + background.displayHeight * YOUNGCHEOL_INTERACTION.yRatio,
    )
    this.youngcheolInteractionRadius =
      Math.min(background.displayWidth, background.displayHeight) *
      YOUNGCHEOL_INTERACTION.radiusRatio

    this.physics.world.setBounds(0, 0, vw, vh)
    this.obstacles = this.physics.add.staticGroup()
    LIGHTHOUSE_OBSTACLES.forEach(rect => this.addObstacleRect(rect))
    ensurePlayerWalkAnimations(this)
    this.createDialogUi()
    this.createSystemPromptUi()
    this.createEngagementUi()
    this.createPostcardUi()
    this.createCaregiverDebugUi()
    this.interactionHint = new NpcInteractionHintUi(this)
    this.validateDialogueGraphForDevelopment()

    const spawn = data.spawn ?? LIGHTHOUSE_ROOM_SPAWN
    this.player = createPlayer(this, vw * spawn.xRatio, vh * spawn.yRatio)
    this.addYoungcheolObstacle()
    this.physics.add.collider(this.player, this.obstacles)
    this.exitPortal = createRatioRectangle(vw, vh, LIGHTHOUSE_EXIT_PORTAL)

    this.cursors = this.input.keyboard!.createCursorKeys()
    this.input.on('pointerdown', this.handlePointerDown)
    this.input.on('pointermove', this.handleObstacleEditorPointerMove)
    this.input.on('pointerup', this.handleObstacleEditorPointerUp)
    this.input.keyboard!.on('keydown-ENTER', this.handleEnterDown)
    this.input.keyboard!.on('keydown-SPACE', this.handleSpaceDown)
    this.input.keyboard!.on('keydown-UP', this.handleChoiceUp)
    this.input.keyboard!.on('keydown-DOWN', this.handleChoiceDown)
    this.input.keyboard!.on('keydown-ESC', this.handleEscDown)
    this.input.keyboard!.on('keydown-M', this.handleMuteToggle)
    this.input.keyboard!.on('keydown-E', this.handleInteractDown)
    this.input.keyboard!.on('keydown-R', this.clearEditedObstacleRects)
    this.input.mouse?.disableContextMenu()
    this.game.events.on('lighthouse-emotion:closed', this.handleLighthouseEmotionClosed, this)
    this.game.events.on('lighthouse-emotion:text', this.handleLighthouseEmotionText, this)

    this.villageRealtime = attachVillageRealtime({
      scene: this,
      worldWidth: vw,
      worldHeight: vh,
      roomId: LighthouseSelectScene.REALTIME_ROOM_ID,
    })
    this.emojiPalette = attachEmojiPalette(this, {
      realtime: this.villageRealtime,
      getPlayer: () => this.player,
      isOverlayOpen: () => this.isDialogVisible,
    })

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.clearReplyTimer()
      this.input.off('pointerdown', this.handlePointerDown)
      this.input.off('pointermove', this.handleObstacleEditorPointerMove)
      this.input.off('pointerup', this.handleObstacleEditorPointerUp)
      this.input.keyboard?.off('keydown-ENTER', this.handleEnterDown)
      this.input.keyboard?.off('keydown-SPACE', this.handleSpaceDown)
      this.input.keyboard?.off('keydown-UP', this.handleChoiceUp)
      this.input.keyboard?.off('keydown-DOWN', this.handleChoiceDown)
      this.input.keyboard?.off('keydown-ESC', this.handleEscDown)
      this.input.keyboard?.off('keydown-M', this.handleMuteToggle)
      this.input.keyboard?.off('keydown-E', this.handleInteractDown)
      this.input.keyboard?.off('keydown-R', this.clearEditedObstacleRects)
      this.game.events.off('lighthouse-emotion:closed', this.handleLighthouseEmotionClosed, this)
      this.game.events.off('lighthouse-emotion:text', this.handleLighthouseEmotionText, this)
      this.clearEngagementTimers()
      this.emojiPalette?.destroy()
      this.emojiPalette = null
      this.villageRealtime?.destroy()
      this.villageRealtime = null
    })

    this.cameras.main.fadeIn(250, 0, 0, 0)
  }

  private async applyWeatherBackground(background: Phaser.GameObjects.Image) {
    const weather = await getGameWeather()

    if (!this.scene.isActive() || !isLighthouseCloudyWeather(weather.condition)) {
      return
    }

    const displayWidth = background.displayWidth
    const displayHeight = background.displayHeight
    background.setTexture(LIGHTHOUSE_CLOUDY_BACKGROUND_KEY)
    background.setDisplaySize(displayWidth, displayHeight)
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
    this.updateYoungcheolConversation()
    this.updateGamepadChoiceInput()

    if (this.isDialogVisible) return

    if (
      !this.isTransitioning &&
      isPointInRectangle(this.exitPortal, this.player.x, this.player.y)
    ) {
      this.returnToVillage()
    }
  }

  private readonly handlePointerDown = (pointer: Phaser.Input.Pointer) => {
    if (this.emojiPalette?.consumePointerDown(pointer)) {
      return
    }

    if (this.handleObstacleEditorPointerDown(pointer)) {
      return
    }

    if (this.uiMode === 'POSTCARD') {
      const clickedPostcardButton = this.getPostcardButtons().some(button =>
        button.getBounds().contains(pointer.x, pointer.y),
      )
      if (clickedPostcardButton || postcardConfig.closeOnBackdropClick) return
      return
    }

    if (this.isDialogVisible) {
      if (this.uiMode === 'PLAYER_CHOICE') {
        const clickedChoice = this.choiceButtons.some(
          button =>
            button.container.visible &&
            this.getChoiceButtonBounds(button).contains(pointer.x, pointer.y),
        )
        if (!clickedChoice) return
      }

      // 영철(LLM) 자유 대화는 React 측 "오늘은 여기까지 대화할래요!" 버튼만이 정상 종료 경로.
      // 실수 클릭으로 BE 세션이 IN_PROGRESS 로 남고 보호자 페이지 누락되는 사고를 막기 위해
      // Phaser 포인터로 인한 advance/close 는 LLM 대화 중에는 모두 무시한다. 진짜 advance/close 가
      // 필요한 opening/closing 상태에서는 React 측 dialogue-advance-hitarea 가 capture 단계에서
      // 먼저 받아 처리한다.
      if (this.isBackendEmotionDialogueOpen) return

      const clickedDialog = this.dialog.frame.getBounds().contains(pointer.x, pointer.y)
      if (clickedDialog) this.advanceDialog()
      else this.closeDialog(true)
      return
    }

    this.target = new Phaser.Math.Vector2(pointer.x, pointer.y)
    createClickTargetMarker(this, pointer.x, pointer.y)
  }

  private readonly handleEnterDown = () => {
    if (this.uiMode === 'POSTCARD') {
      this.activateFocusedPostcardAction()
      return
    }
    if (!this.isDialogVisible) return
    if (this.uiMode === 'PLAYER_CHOICE') this.selectFocusedChoice()
    else this.advanceDialog()
  }

  private readonly handleInteractDown = () => {
    return
  }

  private readonly handleSpaceDown = () => {
    if (this.uiMode === 'POSTCARD') {
      this.activateFocusedPostcardAction()
      return
    }
    if (this.engagementInProgress && childComfortSettings.allowSkipAnimations) {
      this.skipEngagementAnimation()
      return
    }
    if (this.isDialogVisible && this.uiMode === 'PLAYER_CHOICE') this.selectFocusedChoice()
  }

  private readonly handleChoiceUp = () => {
    if (this.uiMode === 'POSTCARD') {
      this.movePostcardFocus(-1)
      return
    }
    if (this.isDialogVisible && this.uiMode === 'PLAYER_CHOICE') this.moveChoiceFocus(-1)
  }

  private readonly handleChoiceDown = () => {
    if (this.uiMode === 'POSTCARD') {
      this.movePostcardFocus(1)
      return
    }
    if (this.isDialogVisible && this.uiMode === 'PLAYER_CHOICE') this.moveChoiceFocus(1)
  }

  private readonly handleEscDown = () => {
    if (this.uiMode === 'POSTCARD') {
      if (postcardConfig.allowEscClose) this.closePostcard(false)
      return
    }
    if (this.engagementInProgress && childComfortSettings.allowSkipAnimations) {
      this.skipEngagementAnimation()
      return
    }
    // 영철 LLM 대화 중에는 ESC 로 종료되지 않도록 차단 — "오늘은 여기까지 대화할래요!" 버튼이 유일 종료 경로.
    if (this.isBackendEmotionDialogueOpen) return
    if (this.isDialogVisible) this.closeDialog(true)
  }

  private readonly handleMuteToggle = () => {
    if (!childComfortSettings.allowMute) return
    this.soundMuted = !this.soundMuted
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

  private addYoungcheolObstacle() {
    const size = Math.min(this.backgroundDisplayArea.width, this.backgroundDisplayArea.height)
    const box = this.add
      .rectangle(
        this.youngcheolAnchor.x,
        this.youngcheolAnchor.y + size * 0.025,
        size * 0.05,
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

  private createYoungcheolCharacter(
    backgroundLeft: number,
    backgroundTop: number,
    backgroundWidth: number,
    backgroundHeight: number,
  ) {
    const textureKey = this.createVisibleTexture(
      'lighthouse-youngcheol',
      'lighthouse-youngcheol-visible',
    )
    const source = this.textures.get(textureKey).getSourceImage() as HTMLCanvasElement
    const aspect = source.width / source.height
    const characterHeight = backgroundHeight * YOUNGCHEOL_POSITION.heightRatio
    const characterWidth = characterHeight * aspect
    const x = backgroundLeft + backgroundWidth * YOUNGCHEOL_POSITION.xRatio
    const y = backgroundTop + backgroundHeight * YOUNGCHEOL_POSITION.yRatio

    this.add
      .image(x, y, textureKey)
      .setOrigin(0.5, 1)
      .setDepth(5)
      .setDisplaySize(characterWidth, characterHeight)
  }

  private createVisibleTexture(sourceKey: string, textureKey: string) {
    if (this.textures.exists(textureKey)) return textureKey

    const source = this.textures.get(sourceKey).getSourceImage() as HTMLImageElement
    const canvas = document.createElement('canvas')
    canvas.width = source.width
    canvas.height = source.height
    const context = canvas.getContext('2d')
    if (!context) return sourceKey

    context.drawImage(source, 0, 0)
    const imageData = context.getImageData(0, 0, source.width, source.height)
    const pixels = imageData.data

    this.makeConnectedBackgroundTransparent(pixels, source.width, source.height)

    let minX = source.width
    let minY = source.height
    let maxX = -1
    let maxY = -1

    for (let y = 0; y < source.height; y += 1) {
      for (let x = 0; x < source.width; x += 1) {
        const alpha = pixels[(y * source.width + x) * 4 + 3]
        if (alpha <= 8) continue
        minX = Math.min(minX, x)
        minY = Math.min(minY, y)
        maxX = Math.max(maxX, x)
        maxY = Math.max(maxY, y)
      }
    }

    if (maxX < minX || maxY < minY) return sourceKey

    context.putImageData(imageData, 0, 0)

    const width = maxX - minX + 1
    const height = maxY - minY + 1
    const cropped = document.createElement('canvas')
    cropped.width = width
    cropped.height = height
    const croppedContext = cropped.getContext('2d')
    if (!croppedContext) return sourceKey

    croppedContext.drawImage(canvas, minX, minY, width, height, 0, 0, width, height)
    this.textures.addCanvas(textureKey, cropped)
    return textureKey
  }

  private makeConnectedBackgroundTransparent(
    pixels: Uint8ClampedArray,
    width: number,
    height: number,
  ) {
    const visited = new Uint8Array(width * height)
    const queue: number[] = []
    let head = 0

    const enqueue = (x: number, y: number) => {
      if (x < 0 || x >= width || y < 0 || y >= height) return
      const index = y * width + x
      if (visited[index]) return
      visited[index] = 1

      const pixelIndex = index * 4
      const red = pixels[pixelIndex]
      const green = pixels[pixelIndex + 1]
      const blue = pixels[pixelIndex + 2]
      const alpha = pixels[pixelIndex + 3]

      if (alpha <= 8 || (red <= 10 && green <= 10 && blue <= 10)) {
        pixels[pixelIndex + 3] = 0
        queue.push(index)
      }
    }

    for (let x = 0; x < width; x += 1) {
      enqueue(x, 0)
      enqueue(x, height - 1)
    }
    for (let y = 0; y < height; y += 1) {
      enqueue(0, y)
      enqueue(width - 1, y)
    }

    while (head < queue.length) {
      const index = queue[head]
      head += 1
      const x = index % width
      const y = Math.floor(index / width)
      enqueue(x + 1, y)
      enqueue(x - 1, y)
      enqueue(x, y + 1)
      enqueue(x, y - 1)
    }
  }

  private createDialogUi() {
    this.dialog = createSimpleDialogUi(this, {
      ...NPC_DIALOG_FRAME_LAYOUT,
      frameKey: 'lighthouse-youngcheol-dialog-frame',
      nameText: '등대지기 영철',
    })
  }

  private createSystemPromptUi() {
    const { width: vw, height: vh } = this.scale
    const panelWidth = Math.min(vw * SYSTEM_PROMPT_PANEL.widthRatio, SYSTEM_PROMPT_PANEL.maxWidth)
    const panelHeight = SYSTEM_PROMPT_PANEL.height
    const x = vw / 2
    const y = vh * 0.24

    const panel = this.add.graphics().setDepth(SYSTEM_PROMPT_DEPTH).setScrollFactor(0).setAlpha(0)
    const text = this.add
      .text(x, y, CHILD_CHOICE_PROMPT, {
        fontFamily: '"Pretendard", "Noto Sans KR", "Malgun Gothic", sans-serif',
        fontSize: `${Math.max(18, Math.round(Math.min(vw, vh) * 0.028))}px`,
        fontStyle: 'bold',
        color: '#4a3320',
        align: 'center',
        wordWrap: {
          width: panelWidth - SYSTEM_PROMPT_PANEL.paddingX * 2,
          useAdvancedWrap: true,
        },
      })
      .setOrigin(0.5)
      .setDepth(SYSTEM_PROMPT_DEPTH + 1)
      .setScrollFactor(0)
      .setAlpha(0)

    this.systemPrompt = { panel, text, width: panelWidth, height: panelHeight, baseY: y }
    this.drawSystemPromptPanel()
  }

  private createCaregiverDebugUi() {
    const debugEnabled = import.meta.env.VITE_LIGHTHOUSE_CAREGIVER_DEBUG === 'true'
    this.caregiverDebugText = this.add
      .text(24, 24, '', {
        fontFamily: '"Pretendard", "Noto Sans KR", "Malgun Gothic", sans-serif',
        fontSize: '16px',
        color: '#fff8ec',
        backgroundColor: '#3c291d',
        padding: { x: 12, y: 10 },
        wordWrap: { width: Math.min(this.scale.width - 48, 640), useAdvancedWrap: true },
      })
      .setDepth(60)
      .setScrollFactor(0)
      .setVisible(debugEnabled)
  }

  private createEngagementUi() {
    const { width: vw, height: vh } = this.scale
    const light = this.add
      .circle(vw * 0.62, vh * 0.23, Math.max(36, Math.min(vw, vh) * 0.052), 0xfff0a8, 0)
      .setDepth(ENGAGEMENT_DEPTH)
      .setScrollFactor(0)
      .setBlendMode(Phaser.BlendModes.ADD)
    const environment = this.add
      .rectangle(vw / 2, vh / 2, vw, vh, 0xfff2c2, 0)
      .setDepth(ENGAGEMENT_DEPTH - 1)
      .setScrollFactor(0)
    const companionBody = this.add.circle(0, 0, 18, 0xfffbf0, 1).setStrokeStyle(3, 0x8a6a42)
    const companionWing = this.add
      .circle(-16, 2, 10, 0xf4e7d4, 1)
      .setScale(1.2, 0.62)
      .setStrokeStyle(2, 0x8a6a42)
    const companionName = this.add
      .text(0, 31, '\uBABD\uC774', {
        fontFamily: '"Pretendard", "Noto Sans KR", "Malgun Gothic", sans-serif',
        fontSize: '15px',
        fontStyle: 'bold',
        color: '#5a3b20',
      })
      .setOrigin(0.5)
    const companion = this.add
      .container(vw * 0.72, vh * 0.55, [companionWing, companionBody, companionName])
      .setDepth(ENGAGEMENT_DEPTH)
      .setScrollFactor(0)
      .setAlpha(0)
    const toastPanel = this.add
      .graphics()
      .setDepth(ENGAGEMENT_DEPTH + 1)
      .setScrollFactor(0)
    const toastText = this.add
      .text(vw / 2, vh * 0.15, '', {
        fontFamily: '"Pretendard", "Noto Sans KR", "Malgun Gothic", sans-serif',
        fontSize: `${Math.max(16, Math.round(Math.min(vw, vh) * 0.021))}px`,
        fontStyle: 'bold',
        color: '#3d2a18',
        align: 'center',
        wordWrap: { width: Math.min(vw * 0.68, 760), useAdvancedWrap: true },
      })
      .setOrigin(0.5)
      .setDepth(ENGAGEMENT_DEPTH + 2)
      .setScrollFactor(0)
      .setAlpha(0)
    const skipText = this.add
      .text(vw - 24, 24, '\uAC74\uB108\uB6F0\uAE30', {
        fontFamily: '"Pretendard", "Noto Sans KR", "Malgun Gothic", sans-serif',
        fontSize: '15px',
        color: '#fff8ec',
        backgroundColor: '#4b341faa',
        padding: { x: 10, y: 6 },
      })
      .setOrigin(1, 0)
      .setDepth(ENGAGEMENT_DEPTH + 3)
      .setScrollFactor(0)
      .setAlpha(0)
      .setInteractive({ useHandCursor: true })
    skipText.on('pointerdown', () => this.skipEngagementAnimation())

    const activityText = this.add
      .text(vw / 2, vh * 0.29, '', {
        fontFamily: '"Pretendard", "Noto Sans KR", "Malgun Gothic", sans-serif',
        fontSize: `${Math.max(20, Math.round(Math.min(vw, vh) * 0.03))}px`,
        fontStyle: 'bold',
        color: '#fff9de',
        stroke: '#4b2e14',
        strokeThickness: 5,
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(ENGAGEMENT_DEPTH + 3)
      .setScrollFactor(0)
      .setAlpha(0)

    this.engagementUi = {
      light,
      environment,
      companion,
      companionBody,
      companionWing,
      companionName,
      toastPanel,
      toastText,
      skipText,
      activityText,
    }
  }

  private createPostcardUi() {
    const { width: vw, height: vh } = this.scale
    const overlay = this.add
      .rectangle(vw / 2, vh / 2, vw, vh, 0x1f211f, 0.34)
      .setDepth(POSTCARD_DEPTH - 1)
      .setScrollFactor(0)
      .setVisible(false)
      .setAlpha(0)
    const panel = this.add.graphics()
    const title = this.add
      .text(0, -120, postcardConfig.title, {
        fontFamily: '"Pretendard", "Noto Sans KR", "Malgun Gothic", sans-serif',
        fontSize: '28px',
        fontStyle: 'bold',
        color: '#3d2815',
      })
      .setOrigin(0.5)
    const body = this.add
      .text(0, -35, '', {
        fontFamily: '"Pretendard", "Noto Sans KR", "Malgun Gothic", sans-serif',
        fontSize: '24px',
        color: '#4b341f',
        align: 'center',
        wordWrap: { width: Math.min(vw * 0.48, 520), useAdvancedWrap: true },
      })
      .setOrigin(0.5)
    const decor = this.add
      .text(0, 42, '', {
        fontFamily: '"Pretendard", "Noto Sans KR", "Malgun Gothic", sans-serif',
        fontSize: '18px',
        color: '#6d4a27',
      })
      .setOrigin(0.5)
    const savedText = this.add
      .text(0, 77, '', {
        fontFamily: '"Pretendard", "Noto Sans KR", "Malgun Gothic", sans-serif',
        fontSize: '17px',
        fontStyle: 'bold',
        color: '#4f7a38',
      })
      .setOrigin(0.5)
    const saveButton = this.add
      .text(-95, 115, postcardConfig.actions[0].text, this.createPostcardButtonStyle())
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
    const closeButton = this.add
      .text(95, 115, postcardConfig.actions[1].text, this.createPostcardButtonStyle())
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
    const container = this.add
      .container(vw / 2, vh / 2, [panel, title, body, decor, savedText, saveButton, closeButton])
      .setDepth(POSTCARD_DEPTH)
      .setScrollFactor(0)
      .setVisible(false)
      .setAlpha(0)

    saveButton.on('pointerdown', () => {
      this.closePostcard(true)
    })
    closeButton.on('pointerdown', () => this.closePostcard(false))

    this.postcardUi = {
      container,
      overlay,
      panel,
      title,
      body,
      decor,
      savedText,
      saveButton,
      closeButton,
    }
    this.drawPostcardPanel()
  }

  private createPostcardButtonStyle(): Phaser.Types.GameObjects.Text.TextStyle {
    return {
      fontFamily: '"Pretendard", "Noto Sans KR", "Malgun Gothic", sans-serif',
      fontSize: '18px',
      fontStyle: 'bold',
      color: '#fff8ec',
      backgroundColor: '#6d4a27',
      padding: { x: 14, y: 9 },
    }
  }

  private drawPostcardPanel() {
    const width = Math.min(this.scale.width * 0.58, 620)
    const height = 310
    const left = -width / 2
    const top = -height / 2
    const panel = this.postcardUi.panel
    panel.clear()
    panel.fillStyle(0x2b1b10, 0.28)
    panel.fillRoundedRect(left + 8, top + 10, width, height, 8)
    panel.fillStyle(0xfff5dd, 1)
    panel.lineStyle(4, 0x8a6339, 1)
    panel.fillRoundedRect(left, top, width, height, 8)
    panel.strokeRoundedRect(left, top, width, height, 8)
  }

  private drawSystemPromptPanel() {
    const { width: vw } = this.scale
    const panel = this.systemPrompt
    const left = vw / 2 - panel.width / 2
    const top = panel.baseY - panel.height / 2

    panel.panel.clear()
    panel.panel.fillStyle(0x2b1b10, 0.28)
    panel.panel.fillRoundedRect(
      left + 6,
      top + 7,
      panel.width,
      panel.height,
      SYSTEM_PROMPT_PANEL.radius,
    )
    panel.panel.fillStyle(0xfff3d4, 0.98)
    panel.panel.lineStyle(4, 0x6d4a27, 1)
    panel.panel.fillRoundedRect(left, top, panel.width, panel.height, SYSTEM_PROMPT_PANEL.radius)
    panel.panel.strokeRoundedRect(left, top, panel.width, panel.height, SYSTEM_PROMPT_PANEL.radius)
    panel.panel.lineStyle(2, 0xf7d894, 1)
    panel.panel.strokeRoundedRect(left + 8, top + 8, panel.width - 16, panel.height - 16, 5)
  }

  private updateYoungcheolConversation() {
    if (this.isTransitioning) return

    const isNearYoungcheol = this.isNearYoungcheol(this.player.x, this.player.y)

    setInteractionIconActive(this.talkIcon, false)

    if (!isNearYoungcheol) {
      this.dialogDismissed = false
      this.interactionHint.hide()
      return
    }

    if (!this.isDialogVisible && !this.dialogDismissed) {
      this.interactionHint.hide()
      this.startYoungcheolConversation()
      return
    }

    if (!this.isDialogVisible && !this.dialogDismissed) {
      this.interactionHint.show(
        this.youngcheolAnchor.x,
        this.youngcheolAnchor.y - 86,
        '등대지기 영철',
      )
      return
    }

    this.interactionHint.hide()
  }

  private isNearYoungcheol(x: number, y: number) {
    return (
      Phaser.Math.Distance.Between(x, y, this.youngcheolAnchor.x, this.youngcheolAnchor.y) <=
      this.youngcheolInteractionRadius
    )
  }

  private validateDialogueGraphForDevelopment() {
    if (!import.meta.env.DEV) return
    const issues = validateDialogueGraph()
    if (issues.length > 0) {
      console.warn('[lighthouse-dialogue] validation issues', issues)
    }
    logDialogueGraphForReview()
  }

  private startYoungcheolConversation() {
    this.resetEmotionCheckinSession()
    this.isEmotionCheckinActive = true
    this.isBackendEmotionDialogueOpen = true
    this.isDialogVisible = true
    this.dialogDismissed = false
    this.dialogPhase = 'closed'
    this.uiMode = 'NPC_DIALOGUE'
    this.cancelEngagementAnimation()
    this.hidePostcardImmediately()
    this.resetChoiceButtonsForReuse()
    setInteractionIconActive(this.talkIcon, true)
    this.interactionHint.hide()
    setCenteredDialogText(this.dialog, '등대지기가 불빛을 살피고 있어요...')
    fadeSimpleDialog(this, this.dialog, 1, 120)
    this.game.events.emit('lighthouse-emotion:open')
  }

  private loadEmotionScene(sceneId: string) {
    const scene = getLighthouseEmotionScene(sceneId)
    if (!scene) {
      console.warn('[EmotionCheckin] Missing scene:', sceneId)
      this.finishEmotionCheckin({ reason: 'error_fallback' })
      return
    }

    this.clearReplyTimer()
    this.currentScene = scene
    this.pendingChoice = null
    this.uiMode = 'NPC_DIALOGUE'
    this.dialogPhase = 'scene-lines'
    this.hideChoiceButtons()
    this.hideSystemPrompt()
    setCenteredDialogText(this.dialog, scene.npcLines.join('\n'))

    if (scene.mode === 'NPC_DIALOGUE' && scene.onComplete?.action === 'FINISH_EMOTION_CHECKIN') {
      this.analysis = createEmotionCheckinAnalysis(
        this.sessionId,
        this.selectedChoiceEvents,
        this.selectedWaveMeterCard,
      )
      this.updateCaregiverDebug()
    }
  }

  private advanceDialog() {
    if (!this.isDialogVisible) return
    if (this.isBackendEmotionDialogueOpen) return

    if (this.dialogPhase === 'scene-lines') {
      if (!this.currentScene) {
        this.finishEmotionCheckin({ reason: 'error_fallback' })
        return
      }
      if (this.currentScene.mode === 'PLAYER_CHOICE') {
        this.showPlayerChoice(
          getVisibleChoices(this.currentScene),
          getQuestionDisplayText(this.currentScene),
        )
        return
      }

      if (this.currentScene.onComplete?.action === 'FINISH_EMOTION_CHECKIN') {
        this.finishEmotionCheckin({
          reason: this.currentScene.id === LIGHTHOUSE_REST_CLOSING_SCENE_ID ? 'rest' : 'completed',
        })
        return
      }

      this.closeDialog(true)
      return
    }

    if (this.dialogPhase === 'choosing' || this.dialogPhase === 'wave-meter') return
    if (this.dialogPhase === 'selected') {
      this.showYoungcheolReply()
      return
    }
    if (this.dialogPhase === 'reply') {
      this.continueAfterReply()
      return
    }
    if (this.dialogPhase === 'summary') this.closeDialog(true)
  }

  private showPlayerChoice(choices: LighthouseEmotionChoice[], prompt: string) {
    this.clearReplyTimer()
    this.uiMode = 'PLAYER_CHOICE'
    this.dialogPhase = prompt === WAVE_METER_PROMPT ? 'wave-meter' : 'choosing'
    const secondaryAction =
      this.dialogPhase === 'choosing' && this.currentScene
        ? getSecondaryAction(this.currentScene)
        : null
    this.activeChoices = secondaryAction ? [...choices, secondaryAction] : choices
    this.focusedChoiceIndex = 0
    this.isChoiceTransitioning = false
    fadeSimpleDialog(this, this.dialog, 0, 120)
    this.showSystemPrompt(prompt)
    this.showChoiceButtons()
  }

  private showChoiceButtons() {
    this.hideChoiceButtons()

    const { width: vw, height: vh } = this.scale
    const isWaveMeter = this.dialogPhase === 'wave-meter'
    const buttonWidth = isWaveMeter
      ? Math.min(vw * 0.25, 280)
      : Math.min(vw * CHOICE_BUTTON.widthRatio, CHOICE_BUTTON.maxWidth)
    const buttonHeight = isWaveMeter ? 54 : CHOICE_BUTTON.height
    const restButtonWidth = buttonWidth
    const secondaryAction = this.currentScene ? getSecondaryAction(this.currentScene) : null
    const visibleMainCount = this.activeChoices.filter(
      choice => choice.id !== secondaryAction?.id,
    ).length
    const totalHeight =
      visibleMainCount * buttonHeight +
      Math.max(0, visibleMainCount - 1) * CHOICE_BUTTON.gap +
      (this.hasRestButton() ? buttonHeight + CHOICE_BUTTON.gap : 0)
    const startX = vw / 2
    const promptBottom = this.systemPrompt.baseY + this.systemPrompt.height / 2
    const startY = Math.min(
      promptBottom + 26 + buttonHeight / 2,
      vh - SYSTEM_PROMPT_PANEL.bottomMargin - totalHeight + buttonHeight / 2,
    )
    const fontSize = Math.max(16, Math.round(Math.min(vw, vh) * 0.022))

    this.activeChoices.forEach((choice, index) => {
      const button = this.choiceButtons[index] ?? this.createChoiceButton(choice, index)
      const isRestButton = choice.id === secondaryAction?.id
      const mainIndex = this.activeChoices
        .slice(0, index)
        .filter(option => option.id !== secondaryAction?.id).length
      const resolvedHeight = buttonHeight
      const resolvedWidth = isRestButton ? restButtonWidth : buttonWidth
      const y = isRestButton
        ? startY + visibleMainCount * (buttonHeight + CHOICE_BUTTON.gap) + 8
        : startY + mainIndex * (buttonHeight + CHOICE_BUTTON.gap)

      button.choice = choice
      button.index = index
      button.isRestButton = isRestButton
      button.width = resolvedWidth
      button.height = resolvedHeight
      button.baseY = y
      button.disabled = false
      button.container.setPosition(startX, y)
      button.container.setSize(resolvedWidth, resolvedHeight)
      button.container.input!.hitArea = new Phaser.Geom.Rectangle(
        -resolvedWidth / 2,
        -resolvedHeight / 2,
        resolvedWidth,
        resolvedHeight,
      )
      button.label.setText(getChoiceDisplayText(choice))
      button.label.setStyle({
        fontSize: `${fontSize}px`,
        wordWrap: {
          width: resolvedWidth - CHOICE_BUTTON.paddingX * 2,
          useAdvancedWrap: true,
        },
      })
      button.container.setVisible(true).setAlpha(0)
      this.tweens.killTweensOf(button.container)
      this.setChoiceButtonState(button, index === this.focusedChoiceIndex ? 'focused' : 'normal')
      this.tweens.add({
        targets: button.container,
        alpha: 1,
        y: button.baseY - 4,
        duration: 180,
        delay: index * 35,
        ease: 'Sine.easeOut',
      })
    })
  }

  private createChoiceButton(choice: LighthouseEmotionChoice, index: number) {
    const background = this.add.graphics()
    const marker = this.add
      .text(0, 0, '▶', {
        fontFamily: '"Pretendard", "Noto Sans KR", "Malgun Gothic", sans-serif',
        fontSize: '20px',
        fontStyle: 'bold',
        color: '#6b401c',
      })
      .setOrigin(0.5)
      .setVisible(false)
    const label = this.add
      .text(0, 0, getChoiceDisplayText(choice), {
        fontFamily: '"Pretendard", "Noto Sans KR", "Malgun Gothic", sans-serif',
        fontSize: '24px',
        color: '#4b341f',
        align: 'left',
      })
      .setOrigin(0, 0.5)
    const container = this.add
      .container(0, 0, [background, marker, label])
      .setDepth(CHOICE_BUTTON_DEPTH)
      .setScrollFactor(0)
      .setSize(1, 1)
      .setVisible(false)

    container.setInteractive(
      new Phaser.Geom.Rectangle(-1, -1, 2, 2),
      Phaser.Geom.Rectangle.Contains,
    )
    container.on('pointerover', () => {
      this.focusedChoiceIndex = index
      this.refreshChoiceButtonStates('hover')
      this.input.setDefaultCursor('pointer')
    })
    container.on('pointerout', () => {
      this.refreshChoiceButtonStates()
      this.input.setDefaultCursor('default')
    })
    container.on(
      'pointerdown',
      (
        _pointer: Phaser.Input.Pointer,
        _x: number,
        _y: number,
        event: Phaser.Types.Input.EventData,
      ) => {
        event.stopPropagation()
        this.pressChoiceButton(index)
      },
    )

    const button = {
      container,
      background,
      marker,
      label,
      baseY: 0,
      choice,
      isRestButton: false,
      disabled: false,
      state: 'normal' as ChoiceButtonVisualState,
      index,
      width: 1,
      height: 1,
    }
    this.choiceButtons.push(button)
    return button
  }

  private setChoiceButtonState(button: ChoiceButton, state: ChoiceButtonVisualState) {
    const isFocused = state === 'focused' || state === 'hover'
    const isPressed = state === 'pressed'
    const isDisabled = state === 'disabled'
    const yOffset = isPressed ? 2 : 0
    const shadowOffset = isPressed ? 3 : 5
    const fillColor = isDisabled ? 0xd7c8ad : isPressed || isFocused ? 0xfff0c8 : 0xfff3d4
    const strokeColor = isDisabled ? 0x9d927e : isFocused ? 0x5a3516 : 0x7a5630
    const innerStrokeColor = isFocused ? 0xffffff : 0xf7d894
    const left = -button.width / 2
    const top = -button.height / 2

    button.state = state
    button.container.y = button.baseY + yOffset
    button.container.setAlpha(isDisabled ? 0.55 : 1)
    button.marker.setVisible(isFocused && !isDisabled)
    button.marker.setPosition(left + 23, 0)
    button.label.setPosition(left + CHOICE_BUTTON.paddingX, 0)
    button.label.setColor(isDisabled ? '#8d806c' : isFocused ? '#24180f' : '#4b341f')

    button.background.clear()
    button.background.fillStyle(0x2b1b10, isDisabled ? 0.12 : 0.26)
    button.background.fillRoundedRect(
      left + 5,
      top + shadowOffset,
      button.width,
      button.height,
      CHOICE_BUTTON.radius,
    )
    button.background.fillStyle(fillColor, 1)
    button.background.lineStyle(button.isRestButton ? 3 : 4, strokeColor, 1)
    button.background.fillRoundedRect(left, top, button.width, button.height, CHOICE_BUTTON.radius)
    button.background.strokeRoundedRect(
      left,
      top,
      button.width,
      button.height,
      CHOICE_BUTTON.radius,
    )
    button.background.lineStyle(2, innerStrokeColor, isFocused ? 0.95 : 0.8)
    button.background.strokeRoundedRect(
      left + 7,
      top + 7,
      button.width - 14,
      button.height - 14,
      Math.max(3, CHOICE_BUTTON.radius - 4),
    )
  }

  private refreshChoiceButtonStates(hoverState?: ChoiceButtonVisualState) {
    this.choiceButtons.forEach((button, index) => {
      if (!button.container.visible) return
      const state = button.disabled
        ? 'disabled'
        : index === this.focusedChoiceIndex
          ? (hoverState ?? 'focused')
          : 'normal'
      this.setChoiceButtonState(button, state)
    })
  }

  private moveChoiceFocus(direction: 1 | -1) {
    if (this.activeChoices.length === 0) return
    this.focusedChoiceIndex = Phaser.Math.Wrap(
      this.focusedChoiceIndex + direction,
      0,
      this.activeChoices.length,
    )
    this.refreshChoiceButtonStates()
  }

  private selectFocusedChoice() {
    this.pressChoiceButton(this.focusedChoiceIndex)
  }

  private pressChoiceButton(index: number) {
    const button = this.choiceButtons[index]
    if (
      !button ||
      button.disabled ||
      this.isChoiceTransitioning ||
      this.isEmotionCheckinFinishing ||
      (this.dialogPhase !== 'choosing' && this.dialogPhase !== 'wave-meter')
    ) {
      return
    }

    this.isChoiceTransitioning = true
    this.focusedChoiceIndex = index
    this.setChoiceButtonState(button, 'pressed')
    this.disableChoiceButtons()
    this.time.delayedCall(emotionCheckinEffectConfig.choicePressDurationMs, () =>
      this.handleChoiceSelected(button.choice),
    )
  }

  private showSystemPrompt(line: string) {
    this.uiMode = 'PLAYER_CHOICE'
    this.systemPrompt.text.setText(line)
    this.drawSystemPromptPanel()
    this.tweens.killTweensOf([this.systemPrompt.panel, this.systemPrompt.text])
    this.systemPrompt.panel.setVisible(true)
    this.systemPrompt.text.setVisible(true)
    this.tweens.add({
      targets: [this.systemPrompt.panel, this.systemPrompt.text],
      alpha: 1,
      duration: 160,
      ease: 'Sine.easeOut',
    })
  }

  private hideSystemPrompt() {
    this.tweens.killTweensOf([this.systemPrompt.panel, this.systemPrompt.text])
    this.systemPrompt.panel.setAlpha(0).setVisible(false)
    this.systemPrompt.text.setAlpha(0).setVisible(false)
  }

  private handleChoiceSelected(choice: LighthouseEmotionChoice) {
    if (
      !this.isDialogVisible ||
      this.isEmotionCheckinFinishing ||
      (this.dialogPhase !== 'choosing' && this.dialogPhase !== 'wave-meter')
    ) {
      return
    }

    const wasWaveMeter = this.dialogPhase === 'wave-meter'
    this.clearReplyTimer()
    this.uiMode = 'SYSTEM_PROMPT'
    this.dialogPhase = 'selected'
    this.pendingChoice = choice

    if (wasWaveMeter) {
      this.selectedWaveMeterCard = waveMeterCards.find(card => card.id === choice.id)
      this.markWaveMeterShownToday()
    } else if (this.currentScene) {
      const isSecondaryAction = choice.id === this.currentScene.secondaryAction?.id
      this.selectedChoiceSceneCount += isSecondaryAction ? 0 : 1
      this.selectedChoiceEvents.push({
        sessionId: this.sessionId,
        sceneId: this.currentScene.id,
        choiceId: choice.id,
        timestamp: Date.now(),
        emotionWeights: choice.emotionWeights,
        intensity: choice.intensity,
        concernFlags: choice.concernFlags ?? [],
        protectiveFactors: choice.protectiveFactors ?? [],
      })
      this.recordPlayEvent('choice_selected', {
        sceneId: this.currentScene.id,
        choiceId: choice.id,
      })
    }

    this.hideSystemPrompt()
    this.fadeOutChoiceButtons()
    fadeSimpleDialog(this, this.dialog, 1, 120)
    setCenteredDialogText(this.dialog, '...')

    if (!wasWaveMeter && this.currentScene?.engagement?.afterChoiceFeedback) {
      this.playAfterChoiceEngagement(choice, () => this.showYoungcheolReply())
      return
    }

    this.replyTimer = this.time.delayedCall(CHILD_REPLY_DELAY_MS, () => {
      this.replyTimer = undefined
      this.showYoungcheolReply()
    })
  }

  private showYoungcheolReply() {
    if (!this.isDialogVisible || this.dialogPhase !== 'selected' || !this.pendingChoice) return

    this.clearReplyTimer()
    this.uiMode = 'NPC_DIALOGUE'
    this.dialogPhase = 'reply'
    this.isChoiceTransitioning = false
    this.hideSystemPrompt()
    setCenteredDialogText(this.dialog, this.pendingChoice.npcResponse.join('\n'))
  }

  private continueAfterReply() {
    const nextSceneId = this.pendingChoice?.followUpPromptId ?? null
    if (!nextSceneId) {
      this.finishEmotionCheckin({
        reason: this.selectedWaveMeterCard ? 'completed' : 'missing_followup',
      })
      return
    }

    const nextScene = getLighthouseEmotionScene(nextSceneId)
    if (!nextScene) {
      console.warn('[EmotionCheckin] Missing followUpPromptId:', nextSceneId)
      this.finishEmotionCheckin({ reason: 'error_fallback' })
      return
    }

    const isClosingScene = nextScene.onComplete?.action === 'FINISH_EMOTION_CHECKIN'
    if (this.selectedChoiceSceneCount >= LIGHTHOUSE_MAX_QUESTION_SCENES && !isClosingScene) {
      this.loadEmotionScene(LIGHTHOUSE_EMOTION_CLOSING_SCENE_ID)
      return
    }

    this.loadEmotionScene(nextSceneId)
  }

  private showWaveMeter() {
    this.currentScene = null
    this.pendingChoice = null
    this.showPlayerChoice(waveMeterCards.map(createWaveMeterChoice), WAVE_METER_PROMPT)
  }

  private shouldShowWaveMeter() {
    if (this.selectedWaveMeterCard) return false
    const enabled = import.meta.env.VITE_LIGHTHOUSE_ENABLE_WAVE_METER === 'true'
    const gatedMode =
      import.meta.env.VITE_LIGHTHOUSE_CAREGIVER_DEBUG === 'true' ||
      import.meta.env.VITE_LIGHTHOUSE_RESEARCH_MODE === 'true'
    return enabled && gatedMode && !this.wasWaveMeterShownToday()
  }

  private wasWaveMeterShownToday() {
    try {
      return window.localStorage.getItem(WAVE_METER_LAST_SHOWN_KEY) === getTodayKey()
    } catch {
      return true
    }
  }

  private markWaveMeterShownToday() {
    try {
      window.localStorage.setItem(WAVE_METER_LAST_SHOWN_KEY, getTodayKey())
    } catch {
      // Ignore storage failures; the meter is optional and stores no child data.
    }
  }

  private finishEmotionCheckin({
    reason = 'completed',
  }: { reason?: FinishEmotionCheckinReason } = {}) {
    if (!this.isEmotionCheckinActive || this.isEmotionCheckinFinishing) return
    if (reason === 'completed' && this.shouldShowWaveMeter()) {
      this.showWaveMeter()
      return
    }
    this.isEmotionCheckinFinishing = true
    this.isChoiceTransitioning = true
    this.analysis = createEmotionCheckinAnalysis(
      this.sessionId,
      this.selectedChoiceEvents,
      this.selectedWaveMeterCard,
    )
    this.updateCaregiverDebug()
    this.lockAndHideDialogueBeforePostcard(() => {
      if (
        emotionCheckinConfig.showPostcardOnComplete &&
        postcardConfig.enabled &&
        !this.hasPostcardBeenShown
      ) {
        this.hasPostcardBeenShown = true
        this.showPostcard(reason)
        return
      }
      this.endEmotionCheckinAndReturnToGameplay()
    })
  }

  private lockAndHideDialogueBeforePostcard(onHidden: () => void) {
    this.isChoiceTransitioning = true
    this.clearReplyTimer()
    this.hideChoiceButtons()
    this.hideSystemPrompt()
    this.cancelEngagementAnimation()

    if (!emotionCheckinConfig.hideDialogueBeforePostcard) {
      onHidden()
      return
    }

    fadeSimpleDialog(this, this.dialog, 0, 180)
    this.time.delayedCall(180, () => {
      this.hideDialogueUiImmediately()
      onHidden()
    })
  }

  private hideDialogueUiImmediately() {
    this.dialog.frame.setAlpha(0)
    this.dialog.text.setAlpha(0)
    this.dialog.nameLabel?.setAlpha(0)
    this.hideChoiceButtons()
    this.hideSystemPrompt()
  }

  private showPostcard(reason: FinishEmotionCheckinReason) {
    if (!postcardConfig.enabled || this.postcardUi.container.visible) return
    this.uiMode = 'POSTCARD'
    this.dialogPhase = 'summary'
    this.isDialogVisible = true
    this.isChoiceTransitioning = false
    this.hideDialogueUiImmediately()

    const decor = getDecorRewardForSession(this.sessionId)
    this.recordPlayEvent('postcard_shown', {
      rewardId: neutralCheckinReward.id,
      decorId: decor.id,
      reason,
    })
    this.postcardUi.body.setText(this.getPostcardBodyText())
    this.postcardUi.decor.setText(`\uB4F1\uB300 \uB3C4\uC7A5 · ${decor.displayName}`)
    this.postcardUi.decor.setText(`등대 도장 · ${decor.displayName}`)
    this.postcardUi.decor.setText(`\uB4F1\uB300 \uB3C4\uC7A5 \u00B7 ${decor.displayName}`)
    this.postcardUi.savedText.setText('')
    this.focusedPostcardActionIndex = postcardConfig.focusFirstAction ? 0 : 1
    this.refreshPostcardButtonFocus()

    const duration = childComfortSettings.reduceMotion ? 0 : 180
    this.postcardUi.overlay.setVisible(true).setAlpha(0)
    this.postcardUi.container
      .setVisible(true)
      .setAlpha(0)
      .setScale(1)
      .setY(this.scale.height / 2 + (childComfortSettings.reduceMotion ? 0 : 6))
    this.tweens.add({
      targets: this.postcardUi.overlay,
      alpha: 1,
      duration,
      ease: 'Sine.easeOut',
    })
    this.tweens.add({
      targets: this.postcardUi.container,
      alpha: 1,
      y: this.scale.height / 2,
      duration,
      ease: 'Sine.easeOut',
    })
  }

  private closePostcard(shouldSave: boolean) {
    if (!this.postcardUi.container.visible) return
    if (shouldSave) {
      const message = this.getPostcardBodyText()
      this.savedPostcards.push({
        sessionId: this.sessionId,
        message,
        savedAt: Date.now(),
      })
      this.recordPlayEvent('postcard_saved', {
        rewardId: neutralCheckinReward.id,
      })
      this.postcardUi.savedText.setText('\uAC04\uC9C1\uD588\uC5B4\uC694')
      this.getPostcardButtons().forEach(button => button.disableInteractive())
      this.time.delayedCall(320, () => this.hidePostcardAndReturnToGameplay())
      return
    }
    this.hidePostcardAndReturnToGameplay()
  }

  private hidePostcardAndReturnToGameplay() {
    if (!this.postcardUi.container.visible) {
      this.returnToGameplayAfterPostcard()
      return
    }

    const duration = childComfortSettings.reduceMotion ? 0 : 140
    this.tweens.killTweensOf([this.postcardUi.container, this.postcardUi.overlay])
    this.tweens.add({
      targets: [this.postcardUi.container, this.postcardUi.overlay],
      alpha: 0,
      duration,
      ease: 'Sine.easeIn',
      onComplete: () => {
        this.hidePostcardImmediately()
        this.returnToGameplayAfterPostcard()
      },
    })
  }

  private getPostcardBodyText() {
    return (
      this.analysis?.summary.childFacingReflection ??
      '\uC624\uB298 \uB9D0\uD574\uC918\uC11C \uACE0\uB9C8\uC6CC.'
    )
  }

  private hidePostcardImmediately() {
    this.tweens.killTweensOf([this.postcardUi.container, this.postcardUi.overlay])
    this.postcardUi.container.setVisible(false).setAlpha(0).setScale(1)
    this.postcardUi.overlay.setVisible(false).setAlpha(0)
    this.postcardUi.savedText.setText('')
    this.getPostcardButtons().forEach(button => button.setInteractive({ useHandCursor: true }))
  }

  private returnToGameplayAfterPostcard() {
    this.endEmotionCheckinAndReturnToGameplay()
  }

  private endEmotionCheckinAndReturnToGameplay() {
    this.isEmotionCheckinActive = false
    this.isEmotionCheckinFinishing = false
    this.isDialogVisible = false
    this.dialogDismissed = true
    this.uiMode = 'GAMEPLAY'
    this.dialogPhase = 'closed'
    this.currentScene = null
    this.activeChoices = []
    this.pendingChoice = null
    this.isChoiceTransitioning = false
    setInteractionIconActive(this.talkIcon, false)
  }

  private getPostcardButtons() {
    return [this.postcardUi.saveButton, this.postcardUi.closeButton]
  }

  private movePostcardFocus(direction: 1 | -1) {
    if (this.uiMode !== 'POSTCARD') return
    this.focusedPostcardActionIndex = Phaser.Math.Wrap(
      this.focusedPostcardActionIndex + direction,
      0,
      this.getPostcardButtons().length,
    )
    this.refreshPostcardButtonFocus()
  }

  private activateFocusedPostcardAction() {
    if (this.uiMode !== 'POSTCARD') return
    this.closePostcard(this.focusedPostcardActionIndex === 0)
  }

  private refreshPostcardButtonFocus() {
    this.getPostcardButtons().forEach((button, index) => {
      const focused = index === this.focusedPostcardActionIndex
      button.setText(`${focused ? '\u25B6 ' : ''}${postcardConfig.actions[index].text}`)
      button.setStyle({
        ...this.createPostcardButtonStyle(),
        backgroundColor: focused ? '#8a6339' : '#6d4a27',
      })
    })
  }

  private updateCaregiverDebug() {
    if (!this.caregiverDebugText || !this.analysis) return

    this.caregiverDebugText.setText(
      [
        '보호자/전문가용 debug view',
        '표시 내용은 진단이 아니라 관찰된 선택 경향입니다.',
        `distressSignalLevel: ${this.analysis.summary.distressSignalLevel}`,
        `topEmotions: ${this.analysis.summary.topEmotions.join(', ') || 'none'}`,
        `playEvents: ${this.playEvents.length}`,
        this.analysis.summary.caregiverFacingNote,
      ].join('\n'),
    )
  }

  private playAfterChoiceEngagement(choice: LighthouseEmotionChoice, onComplete: () => void) {
    this.clearEngagementTimers()
    this.engagementInProgress = true
    this.pendingAfterEngagement = onComplete
    const feedback = getMicroFeedback(choice.id)
    const companionReaction = getCompanionReaction(choice.id)

    this.recordPlayEvent('micro_feedback_played', {
      choiceId: choice.id,
      animationKey: feedback.animationKey,
      lighthousePulseIntensity: emotionCheckinEffectConfig.lighthousePulseIntensity,
      companionId: emotionCheckinEffectConfig.enableCompanionReaction
        ? companionReaction.characterId
        : undefined,
      reactionKey: emotionCheckinEffectConfig.enableCompanionReaction
        ? companionReaction.reactionKey
        : undefined,
    })
    this.recordPlayEvent('neutral_reward_given', {
      rewardId: neutralCheckinReward.id,
      amount: neutralCheckinReward.amount,
      choiceId: choice.id,
    })

    if (emotionCheckinEffectConfig.enableLighthousePulse) {
      this.playSubtleLighthousePulse()
    }

    this.engagementTimers.push(this.time.delayedCall(360, () => this.finishEngagementAnimation()))
  }

  private playSubtleLighthousePulse() {
    this.engagementUi.light.setAlpha(0).setScale(0.82)
    this.tweens.add({
      targets: this.engagementUi.light,
      alpha: { from: 0, to: 0.32 },
      scale: { from: 0.82, to: 1.04 },
      duration: 180,
      yoyo: true,
      ease: 'Sine.easeInOut',
    })
  }

  private skipEngagementAnimation() {
    if (!this.engagementInProgress) return
    this.recordPlayEvent('micro_activity_skipped')
    this.cancelEngagementAnimation()
  }

  private finishEngagementAnimation() {
    if (!this.engagementInProgress) return
    const next = this.pendingAfterEngagement
    this.clearEngagementTimers()
    this.engagementInProgress = false
    this.pendingAfterEngagement = null
    this.tweens.killTweensOf([
      this.engagementUi.light,
      this.engagementUi.environment,
      this.engagementUi.companion,
      this.engagementUi.toastPanel,
      this.engagementUi.toastText,
      this.engagementUi.skipText,
      this.engagementUi.activityText,
    ])
    this.engagementUi.light.setAlpha(0)
    this.engagementUi.environment.setAlpha(0)
    this.engagementUi.companion.setAlpha(0)
    this.engagementUi.toastPanel.clear().setAlpha(0)
    this.engagementUi.toastText.setAlpha(0)
    this.engagementUi.skipText.setAlpha(0)
    this.engagementUi.activityText.setAlpha(0)
    next?.()
  }

  private clearEngagementTimers() {
    this.engagementTimers.forEach(timer => timer.remove(false))
    this.engagementTimers = []
  }

  private cancelEngagementAnimation() {
    if (!this.engagementUi) return
    this.clearEngagementTimers()
    this.engagementInProgress = false
    this.pendingAfterEngagement = null
    this.tweens.killTweensOf([
      this.engagementUi.light,
      this.engagementUi.environment,
      this.engagementUi.companion,
      this.engagementUi.toastPanel,
      this.engagementUi.toastText,
      this.engagementUi.skipText,
      this.engagementUi.activityText,
    ])
    this.engagementUi.light.setAlpha(0)
    this.engagementUi.environment.setAlpha(0)
    this.engagementUi.companion.setAlpha(0)
    this.engagementUi.toastPanel.clear().setAlpha(0)
    this.engagementUi.toastText.setAlpha(0)
    this.engagementUi.skipText.setAlpha(0)
    this.engagementUi.activityText.setAlpha(0)
  }

  private recordPlayEvent(
    eventType: LighthousePlayEvent['eventType'],
    metadata?: Record<string, unknown>,
  ) {
    this.playEvents.push(createLighthousePlayEvent(this.sessionId, eventType, metadata))
  }

  private disableChoiceButtons() {
    this.choiceButtons.forEach(button => {
      button.disabled = true
      if (button.container.visible) this.setChoiceButtonState(button, 'disabled')
    })
  }

  private hideChoiceButtons() {
    this.choiceButtons.forEach(button => {
      this.tweens.killTweensOf(button.container)
      button.container.setVisible(false).setAlpha(0)
    })
  }

  private resetChoiceButtonsForReuse() {
    this.choiceButtons.forEach(button => {
      this.tweens.killTweensOf(button.container)
      button.disabled = false
      button.container.setVisible(false).setAlpha(0).setY(button.baseY)
      this.setChoiceButtonState(button, 'normal')
    })
  }

  private fadeOutChoiceButtons() {
    this.choiceButtons.forEach(button => {
      if (!button.container.visible) return
      this.tweens.add({
        targets: button.container,
        alpha: 0,
        duration: emotionCheckinEffectConfig.choiceFadeOutDurationMs,
        ease: 'Sine.easeOut',
        onComplete: () => button.container.setVisible(false),
      })
    })
  }

  private hasRestButton() {
    const secondaryAction = this.currentScene ? getSecondaryAction(this.currentScene) : null
    return this.activeChoices.some(choice => choice.id === secondaryAction?.id)
  }

  private getChoiceButtonBounds(button: ChoiceButton) {
    return new Phaser.Geom.Rectangle(
      button.container.x - button.width / 2,
      button.container.y - button.height / 2,
      button.width,
      button.height,
    )
  }

  private updateGamepadChoiceInput() {
    if (!this.isDialogVisible || this.uiMode !== 'PLAYER_CHOICE') return
    if (this.time.now < this.gamepadChoiceInputAvailableAt) return

    const gamepad = this.input.gamepad
    if (!gamepad || gamepad.total <= 0) return

    const pad = gamepad.getPad(0) as unknown as {
      up?: boolean
      down?: boolean
      A?: boolean
      buttons?: Array<{ pressed?: boolean }>
      leftStick?: { y?: number }
      axes?: Array<{ getValue?: () => number }>
    }
    const vertical = pad.leftStick?.y ?? pad.axes?.[1]?.getValue?.() ?? 0
    const wantsUp = Boolean(pad.up || pad.buttons?.[12]?.pressed || vertical < -0.55)
    const wantsDown = Boolean(pad.down || pad.buttons?.[13]?.pressed || vertical > 0.55)
    const wantsConfirm = Boolean(pad.A || pad.buttons?.[0]?.pressed)

    if (wantsUp) {
      this.moveChoiceFocus(-1)
      this.gamepadChoiceInputAvailableAt = this.time.now + 180
      return
    }

    if (wantsDown) {
      this.moveChoiceFocus(1)
      this.gamepadChoiceInputAvailableAt = this.time.now + 180
      return
    }

    if (wantsConfirm) {
      this.selectFocusedChoice()
      this.gamepadChoiceInputAvailableAt = this.time.now + 220
    }
  }

  private handleLighthouseEmotionText({ text }: { text: string }) {
    if (!this.isDialogVisible || !this.isBackendEmotionDialogueOpen) return
    setCenteredDialogText(this.dialog, text)
  }

  private handleLighthouseEmotionClosed() {
    this.closeDialog(true, false)
  }

  private closeDialog(markDismissed: boolean, notifyReact = true) {
    if (this.isBackendEmotionDialogueOpen) {
      this.isBackendEmotionDialogueOpen = false
      if (notifyReact) this.game.events.emit('lighthouse-emotion:force-close')
    }
    if (markDismissed && this.isEmotionCheckinActive && !this.isEmotionCheckinFinishing) {
      if (!this.currentScene) {
        this.isEmotionCheckinActive = false
      } else {
        this.finishEmotionCheckin({ reason: 'completed' })
        return
      }
    }
    this.clearReplyTimer()
    this.isDialogVisible = false
    this.dialogDismissed = markDismissed
    this.uiMode = 'NPC_DIALOGUE'
    this.dialogPhase = 'closed'
    this.currentScene = null
    this.activeChoices = []
    this.pendingChoice = null
    setInteractionIconActive(this.talkIcon, false)
    this.cancelEngagementAnimation()
    this.hideChoiceButtons()
    this.hideSystemPrompt()
    this.hidePostcardImmediately()
    fadeSimpleDialog(this, this.dialog, 0, 180)
    if (!this.isEmotionCheckinFinishing) {
      this.isEmotionCheckinActive = false
      this.isEmotionCheckinFinishing = false
    }
  }

  private clearReplyTimer() {
    this.replyTimer?.remove(false)
    this.replyTimer = undefined
  }

  private resetEmotionCheckinSession() {
    this.sessionId = `lighthouse-emotion-${Date.now()}-${Math.random().toString(36).slice(2)}`
    this.currentScene = null
    this.activeChoices = []
    this.pendingChoice = null
    this.selectedChoiceEvents = []
    this.playEvents = []
    this.selectedChoiceSceneCount = 0
    this.isChoiceTransitioning = false
    this.isEmotionCheckinActive = false
    this.isBackendEmotionDialogueOpen = false
    this.hasPostcardBeenShown = false
    this.isEmotionCheckinFinishing = false
    this.selectedWaveMeterCard = undefined
    this.analysis = null
    this.caregiverDebugText?.setText('')
  }

  private returnToVillage() {
    if (this.isTransitioning) return

    this.isTransitioning = true
    this.target = null
    this.player.setVelocity(0, 0)
    this.cancelEngagementAnimation()
    this.hidePostcardImmediately()

    if (this.isDialogVisible) this.closeDialog(false)

    fadeToScene(this, 'VillageScene', {
      duration: 250,
      data: {
        spawn: LIGHTHOUSE_RETURN_SPAWN,
        portalCooldownMs: 250,
      },
    })
  }
}

function createWaveMeterChoice(card: WaveMeterCard): LighthouseEmotionChoice {
  return {
    id: card.id,
    text: card.text,
    iconKey: card.iconKey,
    emotionWeights:
      card.distressSignalLevelHint === 'support_recommended'
        ? { anxietyFear: 2 }
        : card.distressSignalLevelHint === 'watch'
          ? { anxietyFear: 1 }
          : { hopeJoy: 1 },
    intensity: card.distressSignalLevelHint === 'support_recommended' ? 2 : 0,
    concernFlags:
      card.distressSignalLevelHint === 'low' ? [] : [`wave_meter_${card.distressSignalLevelHint}`],
    protectiveFactors: ['wave_meter_answered'],
    npcResponse:
      card.distressSignalLevelHint === 'support_recommended'
        ? ['오늘 파도가 높게 느껴졌구나.']
        : card.distressSignalLevelHint === 'watch'
          ? ['오늘 파도가 조금 흔들렸구나.']
          : ['오늘 파도가 잔잔했구나.'],
    followUpPromptId: null,
  }
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10)
}
