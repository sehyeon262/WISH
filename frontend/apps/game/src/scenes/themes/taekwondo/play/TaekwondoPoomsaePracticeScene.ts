import Phaser from 'phaser'
import { playSceneBgm } from '@/game/systems/sceneBgm'
import { assetPath } from '@/game/assets/assetPath'
import { fadeToScene } from '@/game/systems/sceneTransition'
import { addCoverBackground } from '@/game/world/background'
import {
  resolvePatientProfileId,
  resolvePatientProfileIdOrFetch,
} from '@/features/exerciseSessions/patientProfile'
import {
  CameraSuccessEffect,
  type CameraSuccessEffectOptions,
} from '../effects/cameraSuccessEffect'
import {
  BELT_PROMOTION_DECORATION_KEYS,
  BELT_PROMOTION_TEXTURE_KEYS,
  getTaekwondoBeltLabel,
} from '../effects/beltPromotionOverlay'
import { createPoomsaeProgressView, type PoomsaeProgressView } from './poomsaeProgress'
import { createTaekwondoRoundedPanel } from './taekwondoPracticePanel'
import {
  startMusicRecording as startScreenRecording,
  type MusicRecorderHandle as ScreenRecorderHandle,
} from '@/game/systems/musicRecorder'
import {
  analyzeTaegeuk1Motion,
  createTaekwondoSession,
  createTaekwondoSessionMotion,
  DEFAULT_TAEKWONDO_BELT_COLOR,
  getTaekwondoPoomsaeNumber,
  getTaekwondoProgress,
  listTaekwondoMotions,
  normalizeTaekwondoBeltColor,
  requestPresignedUploadUrls,
  toCreateTaekwondoSessionMotionRequest,
  uploadToPresignedUrl,
  type CreateTaekwondoSessionMotionRequest,
  type Poomsae,
  type TaegeukAnalyzeResponse,
  type TaekwondoBeltColor,
  type TaekwondoMotion,
  type TaekwondoProgressResponse,
} from '@wish/api-client'
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'
import { mediaPipe33ToAihub29 } from '@/game/motion/aihubPoseMapping'
import { toAiMovementName } from '@/game/motion/taekwondoMovementName'

type TaekwondoPoomsaePracticeData = {
  poomsaeId?: string
  poomsaeName?: string
  poomsae?: Poomsae
  beltColor?: TaekwondoBeltColor
}

type GuideVideoBounds = {
  x: number
  y: number
  width: number
  height: number
  radius?: number
}

const ASSET_KEYS = {
  background: 'taekwondo-practice-background',
  deleteButton: 'taekwondo-practice-delete-button',
  feedback: 'taekwondo-practice-feedback',
  guide: 'taekwondo-practice-guide',
  guideMagnifier: 'taekwondo-practice-guide-magnifier',
  guidePose: 'taekwondo-practice-guide-pose',
  seokjae: 'taekwondo-practice-seokjae',
  seokjaeProgress: 'taekwondo-practice-seokjae-progress',
  seokjaeProgressActive: 'taekwondo-practice-seokjae-progress-active',
  userCamera: 'taekwondo-practice-user-camera',
} as const

const FADE_DURATION = 220
const OVERLAY_ALPHA = 0.08
const TEXT_COLOR = '#3a2110'
const DEFAULT_TOTAL_STEP_COUNT = 9
const DEFAULT_PRACTICE_STEP_COUNT = DEFAULT_TOTAL_STEP_COUNT - 1
const DEFAULT_CURRENT_MOTION_NAME = '동작 준비중'
const DEFAULT_MOTION_COMPLETE_FEEDBACK = '동작 완료'
const DEFAULT_FEEDBACK_MESSAGE = '실시간 피드백'
const MOTION_LOAD_ERROR_MESSAGE = '품새 동작 정보를 불러오지 못했어요.'
const CAMERA_DENIED_MESSAGE = '카메라를 사용할 수 없어요.'
const GUIDE_VIDEO_PENDING_MESSAGE = '영상을 준비 중입니다.'

const MAX_CAPTURE_DURATION_MS = 10000
const ANALYSIS_WINDOW_FRAMES = 60
const MIN_ANALYSIS_INTERVAL_MS = 500
const MIN_FRAMES_FOR_FIRST_ANALYSIS = 30
const CAPTURE_RESULT_TO_ADVANCE_DELAY_MS = 1500
const AI_PASS_THRESHOLD = 80
const AI_ADVANCE_THRESHOLD = 60
const MOTION_COUNTDOWN_FROM = 3
const MOTION_COUNTDOWN_TICK_MS = 1000
const MOTION_COUNTDOWN_READY_FEEDBACK = '곧 시작해요!'
const READY_TUTORIAL_DURATION_SEC = 3
const READY_TUTORIAL_MOTION_LABEL = '카메라 준비'
const READY_TUTORIAL_FEEDBACK = '전신이 보이게 서주세요'
const MOTION_CAPTURING_FEEDBACK = '동작 확인 중...'
const GUIDE_VIDEO_OBJECT_POSITION = '50% 90%'
const SIDE_GUIDE_VIDEO_OBJECT_POSITION = '50% 90%'
const SIDE_GUIDE_VIDEO_SCALE = 1.25
const SIDE_GUIDE_VIDEO_TRANSLATE_X = '0%'
const SIDE_GUIDE_VIDEO_TRANSLATE_Y = '-5%'
const ENCOURAGEMENT_SUCCESS_MESSAGES = [
  '정확해요!',
  '멋져요!',
  '잘하고 있어요!',
  '완벽해요!',
] as const
const ENCOURAGEMENT_RETRY_MESSAGES = [
  '좋아요, 다음으로 가볼까요?',
  '계속 도전해요!',
  '잘 따라했어요!',
] as const
const ENCOURAGEMENT_FORCE_ADVANCE_MESSAGES = [
  '잘했어요! 다음 동작도 힘차게!',
  '멋졌어요! 다음으로 넘어가볼까요?',
  '좋아요! 다음 동작도 해볼까요?',
] as const

const MEDIAPIPE_VERSION = '0.10.21'
const POSE_WASM_BASE_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`
const POSE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task'

function pickRandom<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]
}
const IMAGE_ASPECT = {
  deleteButton: 344 / 336,
  feedback: 852 / 330,
  guide: 1086 / 1449,
  seokjae: 617 / 890,
  userCamera: 1448 / 1086,
} as const

export class TaekwondoPoomsaePracticeScene extends Phaser.Scene {
  private mediaStream: MediaStream | null = null
  private videoElement: HTMLVideoElement | null = null
  private guideVideoElement?: HTMLVideoElement
  private guideVideoWrapper?: HTMLDivElement
  private guideVideoResizeHandler?: () => void
  private sideGuideVideoBounds?: GuideVideoBounds
  private sideGuideStatusText?: Phaser.GameObjects.Text
  private sideGuideMagnifierElement?: HTMLButtonElement
  private sideGuideMagnifierResizeHandler?: () => void
  private cameraCanvas: HTMLCanvasElement | null = null
  private cameraContext: CanvasRenderingContext2D | null = null
  private cameraTexture: Phaser.Textures.CanvasTexture | null = null
  private cameraSuccessEffect?: CameraSuccessEffect
  private feedbackText?: Phaser.GameObjects.Text
  private currentMotionText?: Phaser.GameObjects.Text
  private progressView?: PoomsaeProgressView
  private motionIntroOverlay?: Phaser.GameObjects.Container
  private guideVideoExpandOverlay?: Phaser.GameObjects.Container
  private beltPromotionOverlay?: Phaser.GameObjects.Container
  private sessionResultPanel?: Phaser.GameObjects.Container
  private finishButton?: Phaser.GameObjects.Container
  private motionIntroCountdownElement: HTMLDivElement | null = null
  private motions: TaekwondoMotion[] = []
  private motionResults: CreateTaekwondoSessionMotionRequest[] = []
  private recordedMotionIndexes = new Set<number>()
  private motionRecorderHandle: ScreenRecorderHandle | null = null
  private pendingMotionUploads: Promise<void>[] = []
  private taekwondoSessionIdPromise: Promise<number> | null = null
  private pendingBeltPromotion: {
    fromBelt: TaekwondoBeltColor
    toBelt: TaekwondoBeltColor
  } | null = null
  private currentMotionIndex = 0
  private practiceStartedAtMs = 0
  private motionStartedAtMs = 0
  private isWaitingMotionStart = false
  private isAiJudgementPaused = false
  private shouldRestartCaptureAfterGuideOverlay = false
  private hasSubmittedSession = false
  private isSavingSession = false
  private isSceneShuttingDown = false
  private poseLandmarker: PoseLandmarker | null = null
  private isPoseLandmarkerLoading = false
  private capturedSequence: number[][][] = []
  private isCapturing = false
  private captureTimer: Phaser.Time.TimerEvent | null = null
  private sessionId = ''
  private bestAiAnalysis: TaegeukAnalyzeResponse | null = null
  private analysisInFlight = false
  private lastAnalysisStartedAtMs = 0
  private hasTriggeredSuccess = false
  private lastPoseDetectTimeMs = -1
  private countdownText?: Phaser.GameObjects.Text
  private countdownDim?: Phaser.GameObjects.Graphics
  private countdownTimer: Phaser.Time.TimerEvent | null = null
  private hasDrawnCameraPlaceholder = false
  private lastVideoTime = -1
  private poomsaeId = 'taegeuk-1'
  private poomsae?: Poomsae
  private beltColor: TaekwondoBeltColor = DEFAULT_TAEKWONDO_BELT_COLOR

  private readonly handleEscDown = () => {
    if (this.sessionResultPanel) {
      this.closeSessionResultPanel()
      return
    }

    if (this.beltPromotionOverlay) {
      this.closeBeltPromotionOverlay()
      return
    }

    if (this.guideVideoExpandOverlay) {
      this.hideGuideVideoExpandOverlay()
      return
    }

    void this.finishPracticeSession(false)
  }

  constructor() {
    super({ key: 'TaekwondoPoomsaePracticeScene' })
  }

  init(data: TaekwondoPoomsaePracticeData = {}) {
    this.poomsaeId = data.poomsaeId ?? 'taegeuk-1'
    this.poomsae = data.poomsae
    this.beltColor = data.beltColor ?? DEFAULT_TAEKWONDO_BELT_COLOR
    this.motions = []
    this.motionResults = []
    this.recordedMotionIndexes.clear()
    this.currentMotionIndex = 0
    this.practiceStartedAtMs = 0
    this.motionStartedAtMs = 0
    this.isWaitingMotionStart = false
    this.isAiJudgementPaused = false
    this.shouldRestartCaptureAfterGuideOverlay = false
    this.hasSubmittedSession = false
    this.isSavingSession = false
    this.isSceneShuttingDown = false
    this.capturedSequence = []
    this.isCapturing = false
    this.captureTimer = null
    this.bestAiAnalysis = null
    this.countdownTimer = null
    this.lastPoseDetectTimeMs = -1
    this.taekwondoSessionIdPromise = null
    this.pendingBeltPromotion = null
    this.sessionId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `taekwondo-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`
  }

  preload() {
    this.load.image(
      ASSET_KEYS.background,
      assetPath('images/themes/taekwondo/background/taekwondo_inside.png'),
    )
    this.load.image(ASSET_KEYS.deleteButton, assetPath('images/themes/taekwondo/ui/delete_btn.png'))
    this.load.image(ASSET_KEYS.feedback, assetPath('images/themes/taekwondo/ui/feedback.png'))
    this.load.image(ASSET_KEYS.guide, assetPath('images/themes/taekwondo/ui/guide.png'))
    this.load.image(
      ASSET_KEYS.guideMagnifier,
      assetPath('images/themes/taekwondo/ui/magnifier.png'),
    )
    this.load.image(
      ASSET_KEYS.guidePose,
      assetPath(`images/themes/taekwondo/characters/poomsae_${this.getPoomsaeNumber()}.png`),
    )
    this.load.image(
      BELT_PROMOTION_DECORATION_KEYS.banner,
      assetPath('images/themes/taekwondo/ui/banner.png'),
    )
    this.load.image(
      BELT_PROMOTION_DECORATION_KEYS.complete,
      assetPath('images/themes/taekwondo/ui/complete.png'),
    )
    this.load.image(
      BELT_PROMOTION_DECORATION_KEYS.background,
      assetPath('images/themes/taekwondo/ui/promotion_bg.png'),
    )
    this.load.image(
      BELT_PROMOTION_DECORATION_KEYS.podium,
      assetPath('images/themes/taekwondo/ui/promotion_podium.png'),
    )
    Object.entries(BELT_PROMOTION_TEXTURE_KEYS).forEach(([beltColor, textureKey]) => {
      if (!textureKey) {
        return
      }

      this.load.image(
        textureKey,
        assetPath(`images/themes/taekwondo/ui/belt_${beltColor.toLowerCase()}.png`),
      )
    })
    this.load.image(ASSET_KEYS.seokjae, assetPath('images/themes/taekwondo/characters/seokjae.png'))
    this.load.image(
      ASSET_KEYS.seokjaeProgress,
      assetPath('images/themes/taekwondo/ui/seokjae_icon.png'),
    )
    this.load.image(
      ASSET_KEYS.seokjaeProgressActive,
      assetPath('images/themes/taekwondo/ui/seokjae_icon_activate.png'),
    )
    this.load.image(ASSET_KEYS.userCamera, assetPath('images/themes/taekwondo/ui/user_camera.png'))
  }

  create() {
    playSceneBgm(this)
    const { width: vw, height: vh } = this.scale

    addCoverBackground(this, ASSET_KEYS.background)
    this.add.rectangle(vw / 2, vh / 2, vw, vh, 0x120d08, OVERLAY_ALPHA).setDepth(1)
    this.practiceStartedAtMs = Date.now()
    this.motionStartedAtMs = this.practiceStartedAtMs

    this.createCameraTexture()
    this.createTopStatus(vw, vh)
    this.createPracticeLayout(vw, vh)
    this.startCamera()
    void this.loadPracticeMotions()
    void this.initPoseLandmarker()

    this.input.keyboard?.on('keydown-ESC', this.handleEscDown)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup())
    this.cameras.main.fadeIn(FADE_DURATION, 0, 0, 0)
    this.createFinishButton(vw)
  }

  private createFinishButton(vw: number) {
    if (this.finishButton) return
    const btnW = 116
    const btnH = 50
    const radius = 14
    const container = this.add.container(vw - 28, 28).setDepth(40)
    const shadow = this.add.graphics()
    shadow.fillStyle(0x2d1b10, 0.3)
    shadow.fillRoundedRect(-btnW + 2, 4, btnW, btnH, radius)
    const bg = this.add.graphics()
    bg.fillStyle(0xfff5dc, 0.97)
    bg.fillRoundedRect(-btnW, 0, btnW, btnH, radius)
    bg.lineStyle(3, 0xd7a750, 0.95)
    bg.strokeRoundedRect(-btnW, 0, btnW, btnH, radius)
    const label = this.add
      .text(-btnW / 2, btnH / 2 - 1, '종료', {
        fontFamily: 'sans-serif',
        fontSize: '22px',
        color: '#7a471c',
        fontStyle: '800',
      })
      .setOrigin(0.5)
    const hitArea = this.add
      .rectangle(-btnW / 2, btnH / 2, btnW, btnH, 0xffffff, 0)
      .setInteractive({ useHandCursor: true })
    hitArea.on('pointerdown', () => {
      if (
        this.hasSubmittedSession ||
        this.isSavingSession ||
        this.sessionResultPanel ||
        this.beltPromotionOverlay
      ) {
        return
      }
      void this.finishPracticeSession(true)
    })
    hitArea.on('pointerover', () => container.setScale(1.04))
    hitArea.on('pointerout', () => container.setScale(1))
    container.add([shadow, bg, label, hitArea])
    this.finishButton = container
  }

  private showSessionResultPanel(
    motionCount: number,
    averageAccuracy: number,
    monstersDefeated: number,
    beltPromotion: { fromBelt: TaekwondoBeltColor; toBelt: TaekwondoBeltColor } | null,
    progress: TaekwondoProgressResponse | null,
  ): boolean {
    if (this.isSceneShuttingDown) return false
    this.finishButton?.setVisible(false)

    const { width: vw, height: vh } = this.scale
    const overlay = this.add.container(vw / 2, vh / 2).setDepth(46)
    const dim = this.add.rectangle(0, 0, vw, vh, 0x1b1209, 0.6).setInteractive()
    const panelWidth = Math.min(vw * 0.5, 520)
    const panelHeight = Math.min(vh * 0.55, 480)
    const panel = createTaekwondoRoundedPanel(this, 0, 0, panelWidth, panelHeight, {
      depth: 0,
      fillColor: 0xfff5dc,
      fillAlpha: 0.98,
      strokeColor: 0xd7a750,
      strokeAlpha: 0.95,
      strokeWidth: 4,
      radius: 24,
    })
    const title = this.add
      .text(0, -panelHeight * 0.36, '연습 결과', {
        fontFamily: 'sans-serif',
        fontSize: '32px',
        color: '#5a3517',
        fontStyle: '800',
      })
      .setOrigin(0.5)
    const lines = [
      `완료한 동작  ${motionCount}개`,
      `평균 정확도  ${Math.round(averageAccuracy * 100)}%`,
      `처치한 몬스터  ${monstersDefeated}마리`,
    ]
    if (beltPromotion) {
      lines.push(
        `🎉 띠 승급  ${getTaekwondoBeltLabel(beltPromotion.fromBelt)} → ${getTaekwondoBeltLabel(beltPromotion.toBelt)}`,
      )
    } else if (progress) {
      if (progress.nextBelt && progress.monstersUntilNextPromotion !== null) {
        lines.push(
          `현재 ${getTaekwondoBeltLabel(progress.currentBelt)} · ${getTaekwondoBeltLabel(progress.nextBelt)}까지 ${progress.monstersUntilNextPromotion}마리`,
        )
      } else if (!progress.nextBelt) {
        lines.push(`🏆 최고 단계 ${getTaekwondoBeltLabel(progress.currentBelt)} 달성!`)
      }
    }
    const stats = this.add
      .text(0, -panelHeight * 0.06, lines.join('\n'), {
        fontFamily: 'sans-serif',
        fontSize: '22px',
        color: '#4d2d18',
        align: 'center',
        lineSpacing: 14,
      })
      .setOrigin(0.5)
    const confirmBtn = this.add
      .text(0, panelHeight * 0.35, '확인', {
        fontFamily: 'sans-serif',
        fontSize: '26px',
        color: '#ffffff',
        backgroundColor: '#4d9b5d',
        padding: { left: 36, right: 36, top: 10, bottom: 10 },
        fontStyle: '700',
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
    confirmBtn.on('pointerdown', () => this.closeSessionResultPanel())

    overlay.add([dim, panel, title, stats, confirmBtn])
    this.sessionResultPanel = overlay
    return true
  }

  private closeSessionResultPanel() {
    const overlay = this.sessionResultPanel
    this.sessionResultPanel = undefined
    overlay?.destroy(true)
    this.stopPractice()
  }

  private async initPoseLandmarker() {
    if (this.poseLandmarker || this.isPoseLandmarkerLoading) {
      return
    }
    this.isPoseLandmarkerLoading = true
    try {
      const vision = await FilesetResolver.forVisionTasks(POSE_WASM_BASE_URL)
      if (this.isSceneShuttingDown) {
        return
      }
      this.poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: POSE_MODEL_URL,
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numPoses: 1,
        minPoseDetectionConfidence: 0.3,
        minPosePresenceConfidence: 0.3,
        minTrackingConfidence: 0.3,
      })
    } catch (error) {
      console.warn('[TaekwondoPoomsaePracticeScene] Failed to init PoseLandmarker.', error)
    } finally {
      this.isPoseLandmarkerLoading = false
    }
  }

  update() {
    this.drawCameraFrame()
    this.detectPoseIfCapturing()
    this.maybeRunRealtimeAnalysis()
  }

  private detectPoseIfCapturing() {
    if (
      !this.isCapturing ||
      this.isAiJudgementPaused ||
      !this.poseLandmarker ||
      !this.videoElement
    ) {
      return
    }
    if (this.videoElement.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      return
    }
    const timestampMs = performance.now()
    if (this.videoElement.currentTime === this.lastPoseDetectTimeMs) {
      return
    }
    this.lastPoseDetectTimeMs = this.videoElement.currentTime
    try {
      const detection = this.poseLandmarker.detectForVideo(this.videoElement, timestampMs)
      const landmarks = detection.landmarks?.[0]
      if (landmarks && landmarks.length > 0) {
        this.capturedSequence.push(mediaPipe33ToAihub29(landmarks))
      }
    } catch (error) {
      console.warn('[TaekwondoPoomsaePracticeScene] Pose detection failed.', error)
    }
  }

  private createCameraTexture() {
    this.cameraCanvas = document.createElement('canvas')
    this.cameraCanvas.width = 960
    this.cameraCanvas.height = 720

    const context = this.cameraCanvas.getContext('2d')
    if (!context) {
      throw new Error('Taekwondo camera canvas context is not available.')
    }
    this.cameraContext = context

    const textureKey = `${this.scene.key}-camera`
    if (this.textures.exists(textureKey)) {
      this.textures.remove(textureKey)
    }

    const texture = this.textures.addCanvas(textureKey, this.cameraCanvas)
    if (!texture) {
      throw new Error('Taekwondo camera texture is not available.')
    }
    this.cameraTexture = texture
  }

  private getPoomsaeNumber() {
    if (this.poomsae) {
      return String(getTaekwondoPoomsaeNumber(this.poomsae))
    }

    const match = this.poomsaeId.match(/\d+$/)
    return match?.[0] ?? '1'
  }

  private getPoomsaeForApi(): Poomsae {
    if (this.poomsae) {
      return this.poomsae
    }

    const poomsaeNumber = Phaser.Math.Clamp(Number(this.getPoomsaeNumber()), 1, 8)
    return `TAEGEUK_${poomsaeNumber}` as Poomsae
  }

  private async loadPracticeMotions() {
    this.setCurrentMotionName(DEFAULT_CURRENT_MOTION_NAME)

    try {
      const poomsae = this.getPoomsaeForApi()
      console.log('[TaekwondoPoomsaePracticeScene] Loading taekwondo motions.', { poomsae })

      const response = await listTaekwondoMotions(poomsae)
      console.log('[TaekwondoPoomsaePracticeScene] Loaded taekwondo motions.', response)

      if (this.isSceneShuttingDown) {
        return
      }

      this.motions = [...(response.data ?? [])].sort(
        (left, right) => left.routineOrder - right.routineOrder,
      )
      console.log('[TaekwondoPoomsaePracticeScene] Sorted taekwondo motions.', {
        poomsae,
        motionCount: this.motions.length,
        motions: this.motions.map(motion => ({
          id: motion.id,
          name: motion.name,
          routineOrder: motion.routineOrder,
        })),
      })
      this.currentMotionIndex = 0
      this.setCurrentMotionName(this.getCurrentMotionDisplayName())
      this.updatePoomsaeProgress()
      // side guide 영상은 motion intro 가 닫히는 startCurrentMotion 단계에서 표시.
      // 인트로와 동시 호출하면 같은 guideVideoElement 를 서로 덮어써서 play() 가 abort 됨.
      this.showMotionIntroOverlay()
    } catch (error) {
      console.warn('[TaekwondoPoomsaePracticeScene] Failed to load taekwondo motions.', error)
      if (!this.isSceneShuttingDown) {
        this.motions = []
        this.currentMotionIndex = 0
        this.setCurrentMotionName(MOTION_LOAD_ERROR_MESSAGE)
        this.showFeedback(MOTION_LOAD_ERROR_MESSAGE)
        this.updatePoomsaeProgress()
      }
    }
  }

  private getCurrentMotionName() {
    return this.motions[this.currentMotionIndex]?.name ?? DEFAULT_CURRENT_MOTION_NAME
  }

  private getCurrentMotionDisplayName() {
    const motion = this.motions[this.currentMotionIndex]
    return this.isReadyTutorialMotion(motion)
      ? READY_TUTORIAL_MOTION_LABEL
      : this.getCurrentMotionName()
  }

  private getCurrentGuideVideoUrl() {
    return this.motions[this.currentMotionIndex]?.demoVideoUrl?.trim() || null
  }

  private getCurrentMotionDescription() {
    return this.motions[this.currentMotionIndex]?.description?.trim() || ''
  }

  private isReadyTutorialMotion(motion: TaekwondoMotion | undefined) {
    if (!motion) {
      return false
    }

    if (motion.routineOrder === 1) {
      return true
    }

    return toAiMovementName(motion.name) === '기본준비'
  }

  private getPracticeMotionCount() {
    if (this.motions.length === 0) {
      return DEFAULT_PRACTICE_STEP_COUNT
    }

    const count = this.motions.filter(motion => !this.isReadyTutorialMotion(motion)).length
    return count > 0 ? count : this.motions.length
  }

  private setCurrentMotionName(name: string) {
    this.currentMotionText?.setText(name)
  }

  private showMotionIntroOverlay() {
    if (
      this.motions.length === 0 ||
      this.isSceneShuttingDown ||
      this.hasSubmittedSession ||
      this.isSavingSession ||
      this.sessionResultPanel
    ) {
      return
    }

    this.bestAiAnalysis = null

    this.motionIntroOverlay?.destroy(true)
    this.destroyGuideVideoElement()
    this.setSideGuideMagnifierVisible(false)

    if (this.isReadyTutorialMotion(this.motions[this.currentMotionIndex])) {
      // 카메라 준비 단계 카운트다운/안내 제거 — 바로 다음 실제 동작으로 진입.
      this.advanceToNextMotion()
      return
    }

    const { width: vw, height: vh } = this.scale
    const overlay = this.add.container(vw / 2, vh / 2).setDepth(20)
    const dim = this.add.rectangle(0, 0, vw, vh, 0x000000, 0.45).setInteractive()
    const panelWidth = vw * 0.8
    const panelHeight = vh * 0.78
    const panel = createTaekwondoRoundedPanel(this, 0, 0, panelWidth, panelHeight, {
      depth: 0,
      radius: Math.round(Math.min(panelWidth, panelHeight) * 0.08),
    })

    const outerPad = panelWidth * 0.025
    const gap = panelWidth * 0.025
    const boxWidth = (panelWidth - outerPad * 2 - gap) / 2
    const boxHeight = panelHeight - outerPad * 2
    const videoBoxX = -(gap / 2 + boxWidth / 2)
    const descBoxX = gap / 2 + boxWidth / 2
    const contentY = 0
    const boxRadius = Math.round(boxHeight * 0.05)

    const videoBox = createTaekwondoRoundedPanel(this, videoBoxX, contentY, boxWidth, boxHeight, {
      depth: 0,
      fillColor: 0xfffbf1,
      fillAlpha: 0.96,
      strokeColor: 0xe6c47f,
      strokeAlpha: 0.85,
      strokeWidth: 3,
      radius: boxRadius,
    })
    const pendingText = this.add
      .text(videoBoxX, contentY, GUIDE_VIDEO_PENDING_MESSAGE, {
        fontFamily: 'sans-serif',
        fontSize: `${Math.round(Phaser.Math.Clamp(panelHeight * 0.055, 28, 40))}px`,
        color: TEXT_COLOR,
        fontStyle: '700',
        align: 'center',
      })
      .setOrigin(0.5)
    const guideVideoUrl = this.getCurrentGuideVideoUrl()
    const guideStatusText = guideVideoUrl
      ? GUIDE_VIDEO_PENDING_MESSAGE
      : '등록된 가이드 영상이 없어요.'
    pendingText.setText(guideStatusText)

    const descBox = createTaekwondoRoundedPanel(this, descBoxX, contentY, boxWidth, boxHeight, {
      depth: 0,
      fillColor: 0xfffbf1,
      fillAlpha: 0.96,
      strokeColor: 0xe6c47f,
      strokeAlpha: 0.85,
      strokeWidth: 3,
      radius: boxRadius,
    })
    const innerPadX = boxWidth * 0.08
    const titleText = this.add
      .text(descBoxX, contentY - boxHeight * 0.28, this.getCurrentMotionDisplayName(), {
        fontFamily: 'sans-serif',
        fontSize: `${Math.round(Phaser.Math.Clamp(boxHeight * 0.085, 32, 56))}px`,
        color: TEXT_COLOR,
        fontStyle: '700',
        align: 'center',
        wordWrap: { width: boxWidth - innerPadX * 2, useAdvancedWrap: true },
      })
      .setOrigin(0.5)
    const goalLabelX = descBoxX - boxWidth / 2 + innerPadX
    const goalLabel = this.add
      .text(goalLabelX, contentY - boxHeight * 0.1, '목표', {
        fontFamily: 'sans-serif',
        fontSize: `${Math.round(Phaser.Math.Clamp(boxHeight * 0.034, 16, 22))}px`,
        color: '#7a4d24',
        fontStyle: '700',
      })
      .setOrigin(0, 0)
    const goalDescription = this.getCurrentMotionDescription() || '설명이 등록되어 있지 않아요.'
    const goalText = this.add
      .text(goalLabelX, goalLabel.y + goalLabel.displayHeight + boxHeight * 0.02, goalDescription, {
        fontFamily: 'sans-serif',
        fontSize: `${Math.round(Phaser.Math.Clamp(boxHeight * 0.04, 20, 26))}px`,
        color: TEXT_COLOR,
        fontStyle: '700',
        align: 'left',
        wordWrap: { width: boxWidth - innerPadX * 2, useAdvancedWrap: true },
      })
      .setOrigin(0, 0)
      .setLineSpacing(8)

    overlay.add([dim, panel, videoBox, pendingText, descBox, titleText, goalLabel, goalText])
    overlay.setAlpha(0)
    this.tweens.add({
      targets: overlay,
      alpha: 1,
      duration: 160,
      ease: 'Sine.easeOut',
    })

    this.isWaitingMotionStart = true
    this.motionIntroOverlay = overlay

    // 시범 영상이 로드되면 카운트다운 시작. fallback 3초 뒤 영상 안 떠도 강제 시작.
    if (guideVideoUrl) {
      this.createGuideVideoElement(
        {
          x: vw / 2 + videoBoxX - boxWidth / 2,
          y: vh / 2 + contentY - boxHeight / 2,
          width: boxWidth,
          height: boxHeight,
          radius: boxRadius,
        },
        guideVideoUrl,
        pendingText,
        25,
        { loop: false, onReady: () => this.startMotionIntroCountdown() },
      )
      this.time.delayedCall(3000, () => {
        if (this.motionIntroOverlay && !this.countdownTimer) {
          this.startMotionIntroCountdown()
        }
      })
    } else {
      this.startMotionIntroCountdown()
    }
  }

  private startMotionIntroCountdown() {
    if (
      this.isSceneShuttingDown ||
      this.hasSubmittedSession ||
      this.isSavingSession ||
      this.sessionResultPanel ||
      this.countdownTimer
    )
      return
    this.destroyMotionIntroCountdownElement()

    // 시범 영상이 HTML video element 라 Phaser depth 로 못 덮음.
    // 카운트다운도 HTML element 로 만들어 영상 wrapper(z-index 25) 위 (z-index 50) 에 올린다.
    const overlay = document.createElement('div')
    overlay.style.position = 'fixed'
    overlay.style.top = '50%'
    overlay.style.left = '50%'
    overlay.style.transform = 'translate(-50%, -50%) scale(0.85)'
    overlay.style.zIndex = '50'
    overlay.style.pointerEvents = 'none'
    overlay.style.fontFamily = 'sans-serif'
    overlay.style.fontWeight = '900'
    overlay.style.color = '#ffffff'
    overlay.style.fontSize = '180px'
    overlay.style.lineHeight = '1'
    overlay.style.textShadow = '0 6px 16px rgba(0,0,0,0.8)'
    ;(overlay.style as CSSStyleDeclaration & { webkitTextStroke?: string }).webkitTextStroke =
      '5px #3a2110'
    overlay.style.transition = 'transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1)'
    overlay.textContent = String(MOTION_COUNTDOWN_FROM)
    document.body.appendChild(overlay)
    this.motionIntroCountdownElement = overlay
    // 한 프레임 뒤에 scale(1.1) 로 페이드 인.
    requestAnimationFrame(() => {
      overlay.style.transform = 'translate(-50%, -50%) scale(1.1)'
    })

    let remaining = MOTION_COUNTDOWN_FROM
    this.countdownTimer = this.time.addEvent({
      delay: MOTION_COUNTDOWN_TICK_MS,
      repeat: MOTION_COUNTDOWN_FROM - 1,
      callback: () => {
        if (
          this.isSceneShuttingDown ||
          this.hasSubmittedSession ||
          this.isSavingSession ||
          this.sessionResultPanel
        ) {
          this.countdownTimer = null
          this.destroyMotionIntroCountdownElement()
          return
        }
        remaining -= 1
        if (remaining > 0) {
          overlay.textContent = String(remaining)
          overlay.style.transform = 'translate(-50%, -50%) scale(0.85)'
          requestAnimationFrame(() => {
            overlay.style.transform = 'translate(-50%, -50%) scale(1.1)'
          })
          return
        }
        this.countdownTimer = null
        this.destroyMotionIntroCountdownElement()
        this.startCurrentMotion(true)
      },
    })
  }

  private destroyMotionIntroCountdownElement() {
    if (this.motionIntroCountdownElement) {
      this.motionIntroCountdownElement.remove()
      this.motionIntroCountdownElement = null
    }
  }

  private startCurrentMotion(skipCountdown = false) {
    if (!this.isWaitingMotionStart) {
      return
    }
    if (this.hasSubmittedSession || this.isSavingSession || this.sessionResultPanel) {
      return
    }

    this.isWaitingMotionStart = false
    this.motionStartedAtMs = Date.now()
    const isReadyTutorial = this.isReadyTutorialMotion(this.motions[this.currentMotionIndex])
    const overlay = this.motionIntroOverlay
    this.motionIntroOverlay = undefined
    this.destroyGuideVideoElement()
    this.setSideGuideMagnifierVisible(false)

    if (isReadyTutorial) {
      this.startReadyTutorialCountdown()
    } else if (skipCountdown) {
      // intro 카운트다운이 이미 화면에 진행됐으므로 캡쳐를 바로 시작.
      this.showSideGuideVideo()
      this.motionRecorderHandle = startScreenRecording({ scene: this })
      this.beginMotionCapture()
    } else {
      this.showSideGuideVideo()
      this.motionRecorderHandle = startScreenRecording({ scene: this })
      this.startMotionCountdown()
    }

    if (!overlay) {
      return
    }

    this.tweens.add({
      targets: overlay,
      alpha: 0,
      duration: 120,
      ease: 'Sine.easeIn',
      onComplete: () => {
        overlay.destroy(true)
      },
    })
  }

  private startReadyTutorialCountdown() {
    if (this.isSceneShuttingDown) {
      return
    }

    this.stopCaptureLoop()
    this.capturedSequence = []
    this.bestAiAnalysis = null
    this.analysisInFlight = false
    this.hasTriggeredSuccess = false
    this.motionRecorderHandle?.cancel()
    this.motionRecorderHandle = null
    this.countdownTimer?.remove(false)
    this.countdownTimer = null
    this.destroyCountdownText()

    this.setCurrentMotionName(READY_TUTORIAL_MOTION_LABEL)
    this.showFeedback(READY_TUTORIAL_FEEDBACK)
    this.showSideGuideVideo()
    this.setSideGuideMagnifierVisible(true)

    const { width: vw, height: vh } = this.scale
    const fontSize = Math.round(Phaser.Math.Clamp(vh * 0.18, 86, 190))
    const text = this.add
      .text(vw / 2, vh * 0.47, String(READY_TUTORIAL_DURATION_SEC), {
        fontFamily: 'sans-serif',
        fontSize: `${fontSize}px`,
        color: '#ffffff',
        fontStyle: '900',
        stroke: '#3a2110',
        strokeThickness: 8,
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(12)
    text.setShadow(0, 5, '#000000', 10, false, true)
    this.countdownText = text
    this.playCountdownTextTween(text)

    let remaining = READY_TUTORIAL_DURATION_SEC
    this.countdownTimer = this.time.addEvent({
      delay: MOTION_COUNTDOWN_TICK_MS,
      repeat: READY_TUTORIAL_DURATION_SEC - 1,
      callback: () => {
        if (this.isSceneShuttingDown) {
          return
        }

        remaining -= 1
        if (remaining > 0) {
          this.countdownText?.setText(String(remaining))
          if (this.countdownText) {
            this.playCountdownTextTween(this.countdownText)
          }
          return
        }

        this.countdownTimer = null
        this.destroyCountdownText()
        this.advanceToNextMotion()
      },
    })
  }

  private startMotionCountdown(onComplete: () => void = () => this.beginMotionCapture()) {
    if (this.isSceneShuttingDown) {
      return
    }
    this.countdownTimer?.remove(false)
    this.countdownTimer = null
    this.destroyCountdownText()

    this.showFeedback(MOTION_COUNTDOWN_READY_FEEDBACK)

    const { width: vw, height: vh } = this.scale

    const dim = this.add.graphics().setDepth(30)
    dim.fillStyle(0x000000, 0.55)
    dim.fillRect(0, 0, vw, vh)
    this.countdownDim = dim

    const fontSize = Math.round(Phaser.Math.Clamp(vh * 0.22, 100, 240))
    const text = this.add
      .text(vw / 2, vh / 2, String(MOTION_COUNTDOWN_FROM), {
        fontFamily: 'sans-serif',
        fontSize: `${fontSize}px`,
        color: '#ffffff',
        fontStyle: '900',
        stroke: '#ffefc0',
        strokeThickness: 6,
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(31)
    text.setShadow(0, 6, '#000000', 12, false, true)
    this.countdownText = text
    this.playCountdownTextTween(text)

    let remaining = MOTION_COUNTDOWN_FROM
    this.countdownTimer = this.time.addEvent({
      delay: MOTION_COUNTDOWN_TICK_MS,
      repeat: MOTION_COUNTDOWN_FROM - 1,
      callback: () => {
        if (this.isSceneShuttingDown) {
          return
        }
        remaining -= 1
        if (remaining > 0) {
          this.countdownText?.setText(String(remaining))
          if (this.countdownText) {
            this.playCountdownTextTween(this.countdownText)
          }
        } else {
          this.countdownTimer = null
          this.destroyCountdownText()
          this.setSideGuideMagnifierVisible(true)
          this.showSideGuideVideo()
          onComplete()
        }
      },
    })
  }

  private playCountdownTextTween(text: Phaser.GameObjects.Text) {
    text.setScale(0.6).setAlpha(0)
    this.tweens.add({
      targets: text,
      scale: 1,
      alpha: 1,
      duration: 240,
      ease: 'Back.easeOut',
    })
  }

  private destroyCountdownText() {
    this.countdownText?.destroy()
    this.countdownText = undefined
    this.countdownDim?.destroy()
    this.countdownDim = undefined
  }

  private beginMotionCapture() {
    this.capturedSequence = []
    this.lastPoseDetectTimeMs = -1
    this.bestAiAnalysis = null
    this.spawnNextMotionEnemies()
    this.isCapturing = true
    this.analysisInFlight = false
    this.lastAnalysisStartedAtMs = 0
    this.hasTriggeredSuccess = false
    this.showFeedback(MOTION_CAPTURING_FEEDBACK)
    this.captureTimer?.remove(false)
    this.captureTimer = this.time.delayedCall(MAX_CAPTURE_DURATION_MS, () => {
      this.captureTimer = null
      this.handleCaptureTimeout()
    })
  }

  private maybeRunRealtimeAnalysis() {
    if (
      !this.isCapturing ||
      this.isAiJudgementPaused ||
      this.analysisInFlight ||
      this.isSceneShuttingDown
    ) {
      return
    }
    if (this.capturedSequence.length < MIN_FRAMES_FOR_FIRST_ANALYSIS) {
      return
    }
    const now = performance.now()
    if (now - this.lastAnalysisStartedAtMs < MIN_ANALYSIS_INTERVAL_MS) {
      return
    }
    this.analysisInFlight = true
    this.lastAnalysisStartedAtMs = now
    void this.runRealtimeAnalysis()
  }

  private async runRealtimeAnalysis() {
    const movementName = this.getCurrentMotionName()
    const aiMovementName = toAiMovementName(movementName)
    const buffer = this.capturedSequence
    const start = Math.max(0, buffer.length - ANALYSIS_WINDOW_FRAMES)
    const window = buffer.slice(start)

    try {
      const response = await analyzeTaegeuk1Motion({
        session_id: this.sessionId,
        movement_name: aiMovementName,
        sequence: window,
        input_normalized: false,
        pass_threshold: AI_PASS_THRESHOLD,
      })

      if (this.isSceneShuttingDown || this.isAiJudgementPaused || this.guideVideoExpandOverlay) {
        return
      }

      if (!this.bestAiAnalysis || response.score > this.bestAiAnalysis.score) {
        this.bestAiAnalysis = response
      }

      if (this.isCapturing && response.passed && !this.hasTriggeredSuccess) {
        this.hasTriggeredSuccess = true
        this.stopCaptureLoop()
        this.triggerSuccessEffect()
        this.showFeedback(pickRandom(ENCOURAGEMENT_SUCCESS_MESSAGES))
        this.scheduleAdvanceAfterResult()
      }
    } catch {
      // 분석 실패는 무시 — 다음 호출에서 재시도
    } finally {
      this.analysisInFlight = false
    }
  }

  private showMotionAdvanceText(label: string) {
    if (this.isSceneShuttingDown) return
    const { width: vw, height: vh } = this.scale
    const fontSize = Math.round(Phaser.Math.Clamp(vh * 0.16, 80, 200))
    const text = this.add
      .text(vw / 2, vh / 2, label, {
        fontFamily: 'sans-serif',
        fontSize: `${fontSize}px`,
        color: '#ffefc0',
        fontStyle: '900',
        stroke: '#5a3517',
        strokeThickness: 10,
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(42)
      .setAlpha(0)
      .setScale(0.7)
    text.setShadow(0, 5, '#000000', 12, false, true)
    this.tweens.add({
      targets: text,
      alpha: 1,
      scale: 1.12,
      duration: 180,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: text,
          alpha: 0,
          scale: 1,
          delay: 500,
          duration: 200,
          ease: 'Sine.easeIn',
          onComplete: () => text.destroy(),
        })
      },
    })
  }

  private stopCaptureLoop() {
    this.isCapturing = false
    this.captureTimer?.remove(false)
    this.captureTimer = null
  }

  private handleCaptureTimeout() {
    if (
      this.hasTriggeredSuccess ||
      this.isSceneShuttingDown ||
      this.isAiJudgementPaused ||
      this.guideVideoExpandOverlay
    ) {
      return
    }
    this.isCapturing = false

    const best = this.bestAiAnalysis
    if (best && best.score >= AI_ADVANCE_THRESHOLD) {
      this.showFeedback(pickRandom(ENCOURAGEMENT_RETRY_MESSAGES))
    } else {
      this.showFeedback(pickRandom(ENCOURAGEMENT_FORCE_ADVANCE_MESSAGES))
    }
    this.scheduleAdvanceAfterResult()
  }

  private scheduleAdvanceAfterResult() {
    if (
      this.isSceneShuttingDown ||
      this.hasSubmittedSession ||
      this.isSavingSession ||
      this.sessionResultPanel
    ) {
      return
    }
    this.showMotionAdvanceText('성공!')
    this.time.delayedCall(CAPTURE_RESULT_TO_ADVANCE_DELAY_MS, () => {
      if (
        this.isSceneShuttingDown ||
        this.isAiJudgementPaused ||
        this.guideVideoExpandOverlay ||
        this.hasSubmittedSession ||
        this.isSavingSession ||
        this.sessionResultPanel
      ) {
        return
      }
      this.advanceToNextMotion()
    })
  }

  private advanceToNextMotion() {
    if (this.hasSubmittedSession || this.isSavingSession || this.sessionResultPanel) {
      return
    }
    if (this.isWaitingMotionStart) {
      return
    }

    if (this.motions.length === 0) {
      this.setCurrentMotionName(DEFAULT_CURRENT_MOTION_NAME)
      return
    }

    this.recordCurrentMotionResult()

    const nextMotionIndex = this.currentMotionIndex + 1
    if (nextMotionIndex >= this.motions.length) {
      void this.finishPracticeSession(false)
      return
    }

    this.currentMotionIndex = nextMotionIndex
    this.setCurrentMotionName(this.getCurrentMotionDisplayName())
    this.showMotionIntroOverlay()
  }

  private recordCurrentMotionResult() {
    const motion = this.motions[this.currentMotionIndex]
    if (!motion || this.recordedMotionIndexes.has(this.currentMotionIndex)) {
      return
    }

    if (this.isReadyTutorialMotion(motion)) {
      return
    }

    const now = Date.now()
    const durationSec = Math.max(1, Math.round((now - this.motionStartedAtMs) / 1000))
    this.recordedMotionIndexes.add(this.currentMotionIndex)
    const analysis = this.bestAiAnalysis
    const motionResult: CreateTaekwondoSessionMotionRequest = toCreateTaekwondoSessionMotionRequest(
      {
        taekwondoMotionId: motion.id,
        durationSec,
        targetReps: motion.targetReps,
        analysis,
        feedbackFallback: DEFAULT_MOTION_COMPLETE_FEEDBACK,
      },
    )
    this.motionResults.push(motionResult)
    this.bestAiAnalysis = null

    const handle = this.motionRecorderHandle
    this.motionRecorderHandle = null
    const persistPromise = (async () => {
      if (handle) {
        try {
          const rec = await handle.stop()
          const presigned = await requestPresignedUploadUrls({
            videoContentType: rec.videoMimeType,
            thumbContentType: rec.thumbMimeType,
            purpose: 'TAEKWONDO_PERFORMANCE',
          })
          const { video, thumb } = presigned.data
          await Promise.all([
            uploadToPresignedUrl(video, rec.videoBlob),
            uploadToPresignedUrl(thumb, rec.thumbBlob),
          ])
          motionResult.videoKey = video.key
          motionResult.thumbKey = thumb.key
        } catch (err) {
          console.warn('[TaekwondoPoomsaePracticeScene] motion recording upload failed', err)
        }
      }
      try {
        const sessionId = await this.ensureTaekwondoSessionId()
        const response = await createTaekwondoSessionMotion(sessionId, motionResult)
        if (response.beltPromotion) {
          const fromBelt = normalizeTaekwondoBeltColor(response.beltPromotion.fromBelt)
          const toBelt = normalizeTaekwondoBeltColor(response.beltPromotion.toBelt)
          if (fromBelt && toBelt) {
            // 다단계 점프(여러 동작에 걸쳐): 첫 응답의 fromBelt 를 유지하고 마지막 toBelt 로 누적.
            this.pendingBeltPromotion = {
              fromBelt: this.pendingBeltPromotion?.fromBelt ?? fromBelt,
              toBelt,
            }
            this.beltColor = toBelt
          }
        }
      } catch (err) {
        console.warn('[TaekwondoPoomsaePracticeScene] motion persist failed', err)
      }
    })()
    this.pendingMotionUploads.push(persistPromise)

    this.updatePoomsaeProgress()
  }

  private ensureTaekwondoSessionId(): Promise<number> {
    if (!this.taekwondoSessionIdPromise) {
      this.taekwondoSessionIdPromise = (async () => {
        const patientProfileId = await resolvePatientProfileIdOrFetch()
        if (!patientProfileId) {
          throw new Error('환자 정보가 올바르지 않습니다.')
        }
        const session = await createTaekwondoSession({
          patientProfileId,
          poomsae: this.getPoomsaeForApi(),
        })
        return session.id
      })()
    }
    return this.taekwondoSessionIdPromise
  }

  private async finishPracticeSession(recordCurrentMotion: boolean) {
    console.log('[TaekwondoPoomsaePracticeScene] Finish practice requested.', {
      recordCurrentMotion,
      hasSubmittedSession: this.hasSubmittedSession,
      isSavingSession: this.isSavingSession,
      currentMotionIndex: this.currentMotionIndex,
      loadedMotionCount: this.motions.length,
      recordedMotionCount: this.motionResults.length,
      patientProfileId: resolvePatientProfileId(),
    })

    if (this.hasSubmittedSession || this.isSavingSession) {
      return
    }

    // 종료 처리: 진행 중인 모든 타이머/캡쳐/AI 분석을 즉시 멈추고 영상도 정리.
    // 결과 패널이 떠 있는 동안 뒤에서 다음 동작/카운트다운이 계속 진행되어 정신없는 문제 방지.
    // hasSubmittedSession 을 즉시 set 해서 진행 중 delayedCall/Promise resolve 가 다음 advance 트리거하는 race 차단.
    this.hasSubmittedSession = true
    this.isAiJudgementPaused = true
    this.stopCaptureLoop()
    this.countdownTimer?.remove(false)
    this.countdownTimer = null
    this.destroyCountdownText()
    this.motionIntroOverlay?.destroy(true)
    this.motionIntroOverlay = undefined
    this.guideVideoExpandOverlay?.destroy(true)
    this.guideVideoExpandOverlay = undefined
    this.destroyGuideVideoElement()
    this.destroyMotionIntroCountdownElement()
    this.isWaitingMotionStart = false

    if (recordCurrentMotion) {
      this.recordCurrentMotionResult()
    }

    if (this.motionResults.length === 0 && !this.taekwondoSessionIdPromise) {
      console.warn(
        '[TaekwondoPoomsaePracticeScene] Skip taekwondo session save: no motion results.',
        {
          loadedMotionCount: this.motions.length,
          currentMotionIndex: this.currentMotionIndex,
        },
      )
      this.stopPractice()
      return
    }

    this.isSavingSession = true
    this.hasSubmittedSession = true
    this.showFeedback('저장 중')
    let shouldStopPractice = true

    try {
      // 동작 단건 저장이 fire-and-forget 으로 진행되므로 남은 persist 만 대기. 별도 세션 종료 API 호출 없음.
      await this.ensureTaekwondoSessionId()
      if (this.pendingMotionUploads.length > 0) {
        await Promise.allSettled(this.pendingMotionUploads)
        this.pendingMotionUploads = []
      }
      this.showFeedback('저장 완료')
      const motionCount = this.motionResults.length
      const monstersDefeated = this.motionResults.reduce((sum, m) => sum + m.monstersDefeated, 0)
      const averageAccuracy =
        motionCount === 0
          ? 0
          : this.motionResults.reduce((sum, m) => sum + m.accuracy, 0) / motionCount
      const promotion = this.pendingBeltPromotion
      this.pendingBeltPromotion = null

      // 띠 승급이 없을 때만 진행도(다음 띠까지 N마리) 를 노출. 승급 시점에는 승급 줄로 이미 충분.
      let progress: TaekwondoProgressResponse | null = null
      if (!promotion) {
        const patientProfileId = resolvePatientProfileId()
        if (patientProfileId) {
          try {
            progress = await getTaekwondoProgress(patientProfileId)
          } catch (err) {
            console.warn('[TaekwondoPoomsaePracticeScene] progress fetch failed', err)
          }
        }
      }

      const shown = this.showSessionResultPanel(
        motionCount,
        averageAccuracy,
        monstersDefeated,
        promotion,
        progress,
      )
      shouldStopPractice = !shown
    } catch (error) {
      this.hasSubmittedSession = false
      console.warn('[TaekwondoPoomsaePracticeScene] Failed to finalize taekwondo session.', {
        error,
        apiBaseUrl: import.meta.env.VITE_API_BASE_URL,
        hasAccessToken: Boolean(window.localStorage.getItem('wish_access_token')),
        patientProfileId: resolvePatientProfileId(),
        motionResults: this.motionResults,
      })
      this.showFeedback('저장 실패')
    } finally {
      this.isSavingSession = false
      if (shouldStopPractice) {
        this.stopPractice()
      }
    }
  }

  private closeBeltPromotionOverlay(shouldReturnToSelectOnClose = true) {
    const overlay = this.beltPromotionOverlay
    this.beltPromotionOverlay = undefined

    if (!overlay) {
      if (shouldReturnToSelectOnClose) {
        this.stopPractice()
      }
      return
    }

    this.tweens.add({
      targets: overlay,
      alpha: 0,
      duration: 140,
      ease: 'Sine.easeIn',
      onComplete: () => {
        overlay.destroy(true)
        if (shouldReturnToSelectOnClose) {
          this.stopPractice()
        }
      },
    })
  }

  private createTopStatus(vw: number, vh: number) {
    const topY = vh * 0.116
    const progressWidth = vw * 0.45
    const progressHeight = vh * 0.074
    const currentHeight = progressHeight
    const visualTopY = topY
    const currentY = topY
    const currentWidth = vw * 0.3

    this.createCurrentMotionPanel(vw * 0.23, currentY, currentWidth, currentHeight)

    this.currentMotionText = this.add
      .text(vw * 0.23, currentY - currentHeight * 0.02, DEFAULT_CURRENT_MOTION_NAME, {
        fontFamily: 'sans-serif',
        fontSize: `${Math.round(Phaser.Math.Clamp(currentHeight * 0.3, 22, 32))}px`,
        color: TEXT_COLOR,
        fontStyle: '700',
        align: 'center',
        wordWrap: { width: currentWidth * 0.78, useAdvancedWrap: true },
      })
      .setOrigin(0.5)
      .setDepth(5)

    this.createPoomsaeProgress(vw * 0.63, visualTopY, progressWidth, progressHeight)
  }

  private createCurrentMotionPanel(x: number, y: number, width: number, height: number) {
    createTaekwondoRoundedPanel(this, x, y, width, height, {
      depth: 4,
      radius: Math.round(height * 0.48),
    })
  }

  private createPracticeLayout(vw: number, vh: number) {
    const cameraWidth = vw * 0.51
    const cameraHeight = vh * 0.732
    const cameraX = vw * 0.334
    const cameraY = vh * 0.548
    const rightX = vw * 0.754
    const rightWidth = vw * 0.286
    const guideY = vh * 0.396
    const guideHeight = vh * 0.437
    const feedbackY = vh * 0.783
    const feedbackHeight = vh * 0.25

    this.createCameraPanel(cameraX, cameraY, cameraWidth, cameraHeight)
    this.createGuideVideoPanel(rightX, guideY, rightWidth, guideHeight)
    this.createFeedbackPanel(rightX, feedbackY, rightWidth, feedbackHeight)
  }

  private createCameraPanel(x: number, y: number, width: number, height: number) {
    const radius = Math.round(Math.min(width, height) * 0.04)
    const frame = createTaekwondoRoundedPanel(this, x, y, width, height, { radius })

    const cameraWidth = width
    const cameraHeight = height
    const cameraX = x
    const cameraY = y
    this.resizeCameraTexture(cameraWidth, cameraHeight)

    if (!this.cameraTexture) {
      return frame
    }

    const cameraImage = this.add
      .image(cameraX, cameraY, this.cameraTexture.key)
      .setDisplaySize(cameraWidth, cameraHeight)
      .setDepth(4)

    const maskShape = this.add.graphics()
    maskShape
      .fillStyle(0xffffff, 1)
      .fillRoundedRect(
        cameraX - cameraWidth / 2,
        cameraY - cameraHeight / 2,
        cameraWidth,
        cameraHeight,
        radius,
      )
      .setVisible(false)
    cameraImage.setMask(maskShape.createGeometryMask())
    this.cameraSuccessEffect?.destroy()
    this.cameraSuccessEffect = new CameraSuccessEffect(this, {
      bounds: { x: cameraX, y: cameraY, width: cameraWidth, height: cameraHeight, radius },
      depth: 5,
      onSuccessFeedback: message => this.showFeedback(message),
    })

    return frame
  }

  triggerSuccessEffect(options: CameraSuccessEffectOptions = {}) {
    if (this.isAiJudgementPaused) {
      return
    }

    this.cameraSuccessEffect?.triggerSuccess(options)
  }

  spawnNextMotionEnemies() {
    if (this.isAiJudgementPaused) {
      return
    }

    this.cameraSuccessEffect?.spawnNextMotionEnemies()
  }

  private createGuideVideoPanel(x: number, y: number, width: number, height: number) {
    const radius = Math.round(Math.min(width, height) * 0.08)
    createTaekwondoRoundedPanel(this, x, y, width, height, { radius })

    this.sideGuideStatusText = this.add
      .text(x, y, GUIDE_VIDEO_PENDING_MESSAGE, {
        fontFamily: 'sans-serif',
        fontSize: `${Math.round(Phaser.Math.Clamp(height * 0.055, 18, 26))}px`,
        color: TEXT_COLOR,
        fontStyle: '700',
        align: 'center',
        wordWrap: { width: width * 0.72, useAdvancedWrap: true },
      })
      .setOrigin(0.5)
      .setDepth(5)

    const videoInset = 4
    this.sideGuideVideoBounds = {
      x: x - width / 2 + videoInset,
      y: y - height / 2 + videoInset,
      width: width - videoInset * 2,
      height: height - videoInset * 2,
      radius,
    }

    const buttonSize = Math.round(Phaser.Math.Clamp(width * 0.11, 34, 48))
    this.createGuideMagnifierElement(
      {
        x: x + width / 2 - buttonSize * 0.72,
        y: y - height / 2 + buttonSize * 0.72,
        size: buttonSize,
      },
      () => this.showGuideVideoExpandOverlay(),
    )
  }

  private setSideGuideMagnifierVisible(visible: boolean) {
    if (this.sideGuideMagnifierElement) {
      this.sideGuideMagnifierElement.style.visibility = visible ? 'visible' : 'hidden'
    }
  }

  private createGuideMagnifierElement(
    bounds: { x: number; y: number; size: number },
    onClick: () => void,
  ) {
    this.destroyGuideMagnifierElement()

    const button = document.createElement('button')
    button.type = 'button'
    button.style.position = 'fixed'
    button.style.padding = '0'
    button.style.border = 'none'
    button.style.background = 'transparent'
    button.style.cursor = 'pointer'
    button.style.zIndex = '16'
    button.style.transition = 'transform 120ms ease'

    const img = document.createElement('img')
    img.src = assetPath('images/themes/taekwondo/ui/magnifier.png')
    img.style.width = '100%'
    img.style.height = '100%'
    img.style.display = 'block'
    img.style.pointerEvents = 'none'
    img.draggable = false
    button.appendChild(img)

    const positionButton = () => {
      const canvasRect = this.game.canvas.getBoundingClientRect()
      const scaleX = canvasRect.width / this.scale.width
      const scaleY = canvasRect.height / this.scale.height
      const renderedSize = bounds.size * Math.min(scaleX, scaleY)
      button.style.left = `${canvasRect.left + bounds.x * scaleX - renderedSize / 2}px`
      button.style.top = `${canvasRect.top + bounds.y * scaleY - renderedSize / 2}px`
      button.style.width = `${renderedSize}px`
      button.style.height = `${renderedSize}px`
    }

    button.addEventListener('click', onClick)
    button.addEventListener('mouseenter', () => {
      button.style.transform = 'scale(1.08)'
    })
    button.addEventListener('mouseleave', () => {
      button.style.transform = 'scale(1)'
    })

    positionButton()
    document.body.appendChild(button)
    this.sideGuideMagnifierElement = button
    this.sideGuideMagnifierResizeHandler = positionButton
    window.addEventListener('resize', positionButton)
  }

  private destroyGuideMagnifierElement() {
    if (this.sideGuideMagnifierResizeHandler) {
      window.removeEventListener('resize', this.sideGuideMagnifierResizeHandler)
      this.sideGuideMagnifierResizeHandler = undefined
    }
    this.sideGuideMagnifierElement?.remove()
    this.sideGuideMagnifierElement = undefined
  }

  private showGuideVideoExpandOverlay() {
    if (this.guideVideoExpandOverlay || this.isSceneShuttingDown) {
      return
    }

    this.shouldRestartCaptureAfterGuideOverlay = this.isCapturing
    this.pauseAiJudgement()
    this.destroyGuideVideoElement()
    this.setSideGuideMagnifierVisible(false)

    const { width: vw, height: vh } = this.scale
    const overlay = this.add.container(vw / 2, vh / 2).setDepth(30)
    const dim = this.add.rectangle(0, 0, vw, vh, 0x000000, 0.45).setInteractive()
    const panelWidth = vw * 0.8
    const panelHeight = vh * 0.78
    const panel = createTaekwondoRoundedPanel(this, 0, 0, panelWidth, panelHeight, {
      depth: 0,
      radius: Math.round(Math.min(panelWidth, panelHeight) * 0.08),
    })

    const outerPad = panelWidth * 0.025
    const gap = panelWidth * 0.025
    const boxWidth = (panelWidth - outerPad * 2 - gap) / 2
    const boxHeight = panelHeight - outerPad * 2
    const videoBoxX = -(gap / 2 + boxWidth / 2)
    const descBoxX = gap / 2 + boxWidth / 2
    const contentY = 0
    const boxRadius = Math.round(boxHeight * 0.05)

    const videoBox = createTaekwondoRoundedPanel(this, videoBoxX, contentY, boxWidth, boxHeight, {
      depth: 0,
      fillColor: 0xfffbf1,
      fillAlpha: 0.96,
      strokeColor: 0xe6c47f,
      strokeAlpha: 0.85,
      strokeWidth: 3,
      radius: boxRadius,
    })
    const pendingText = this.add
      .text(videoBoxX, contentY, GUIDE_VIDEO_PENDING_MESSAGE, {
        fontFamily: 'sans-serif',
        fontSize: `${Math.round(Phaser.Math.Clamp(panelHeight * 0.055, 28, 40))}px`,
        color: TEXT_COLOR,
        fontStyle: '700',
        align: 'center',
      })
      .setOrigin(0.5)
    const guideVideoUrl = this.getCurrentGuideVideoUrl()
    const guideStatusText = guideVideoUrl
      ? GUIDE_VIDEO_PENDING_MESSAGE
      : '등록된 가이드 영상이 없어요.'
    pendingText.setText(guideStatusText)

    const descBox = createTaekwondoRoundedPanel(this, descBoxX, contentY, boxWidth, boxHeight, {
      depth: 0,
      fillColor: 0xfffbf1,
      fillAlpha: 0.96,
      strokeColor: 0xe6c47f,
      strokeAlpha: 0.85,
      strokeWidth: 3,
      radius: boxRadius,
    })
    const innerPadX = boxWidth * 0.08
    const titleText = this.add
      .text(descBoxX, contentY - boxHeight * 0.28, this.getCurrentMotionName(), {
        fontFamily: 'sans-serif',
        fontSize: `${Math.round(Phaser.Math.Clamp(boxHeight * 0.085, 32, 56))}px`,
        color: TEXT_COLOR,
        fontStyle: '700',
        align: 'center',
        wordWrap: { width: boxWidth - innerPadX * 2, useAdvancedWrap: true },
      })
      .setOrigin(0.5)
    const goalLabelX = descBoxX - boxWidth / 2 + innerPadX
    const goalLabel = this.add
      .text(goalLabelX, contentY - boxHeight * 0.1, '목표', {
        fontFamily: 'sans-serif',
        fontSize: `${Math.round(Phaser.Math.Clamp(boxHeight * 0.034, 16, 22))}px`,
        color: '#7a4d24',
        fontStyle: '700',
      })
      .setOrigin(0, 0)
    const goalDescription = this.getCurrentMotionDescription() || '설명이 등록되어 있지 않아요.'
    const goalText = this.add
      .text(goalLabelX, goalLabel.y + goalLabel.displayHeight + boxHeight * 0.02, goalDescription, {
        fontFamily: 'sans-serif',
        fontSize: `${Math.round(Phaser.Math.Clamp(boxHeight * 0.04, 20, 26))}px`,
        color: TEXT_COLOR,
        fontStyle: '700',
        align: 'left',
        wordWrap: { width: boxWidth - innerPadX * 2, useAdvancedWrap: true },
      })
      .setOrigin(0, 0)
      .setLineSpacing(8)

    const closeSize = Math.round(Phaser.Math.Clamp(vh * 0.075, 54, 72))
    const closeX = panelWidth / 2 - closeSize * 0.95
    const closeY = -panelHeight / 2 + closeSize * 0.95
    const closeButton = this.add
      .image(closeX, closeY, ASSET_KEYS.deleteButton)
      .setDisplaySize(closeSize * IMAGE_ASPECT.deleteButton, closeSize)
    const closeHitArea = this.add
      .rectangle(closeX, closeY, closeSize * IMAGE_ASPECT.deleteButton, closeSize, 0xffffff, 0)
      .setInteractive({ useHandCursor: true })
    closeHitArea.on('pointerdown', () => this.hideGuideVideoExpandOverlay())
    closeHitArea.on('pointerover', () => closeButton.setTint(0xffefc4))
    closeHitArea.on('pointerout', () => closeButton.clearTint())

    overlay.add([
      dim,
      panel,
      videoBox,
      pendingText,
      descBox,
      titleText,
      goalLabel,
      goalText,
      closeButton,
      closeHitArea,
    ])
    overlay.setAlpha(0)
    this.tweens.add({
      targets: overlay,
      alpha: 1,
      duration: 160,
      ease: 'Sine.easeOut',
    })

    this.guideVideoExpandOverlay = overlay

    if (guideVideoUrl) {
      this.createGuideVideoElement(
        {
          x: vw / 2 + videoBoxX - boxWidth / 2,
          y: vh / 2 + contentY - boxHeight / 2,
          width: boxWidth,
          height: boxHeight,
          radius: boxRadius,
        },
        guideVideoUrl,
        pendingText,
        35,
      )
    }
  }

  private hideGuideVideoExpandOverlay() {
    const overlay = this.guideVideoExpandOverlay
    this.guideVideoExpandOverlay = undefined

    if (!overlay) {
      this.setSideGuideMagnifierVisible(true)
      this.resumeAiJudgement()
      return
    }

    this.destroyGuideVideoElement()
    const shouldRestartCapture = this.shouldRestartCaptureAfterGuideOverlay
    this.shouldRestartCaptureAfterGuideOverlay = false
    this.tweens.add({
      targets: overlay,
      alpha: 0,
      duration: 120,
      ease: 'Sine.easeIn',
      onComplete: () => {
        overlay.destroy(true)
        if (shouldRestartCapture) {
          this.startMotionCountdown(() => {
            this.resumeAiJudgement()
            this.beginMotionCapture()
          })
        } else {
          this.setSideGuideMagnifierVisible(true)
          this.showSideGuideVideo()
          this.resumeAiJudgement()
        }
      },
    })
  }

  private pauseAiJudgement() {
    this.isAiJudgementPaused = true
    if (this.captureTimer) {
      this.captureTimer.remove(false)
      this.captureTimer = null
    }
  }

  private resumeAiJudgement() {
    this.isAiJudgementPaused = false
    if (this.captureTimer) {
      this.captureTimer.paused = false
    }
  }

  private createFeedbackPanel(x: number, y: number, width: number, height: number) {
    const radius = Math.round(Math.min(width, height) * 0.12)
    createTaekwondoRoundedPanel(this, x, y, width, height, { radius })

    this.feedbackText = this.add
      .text(x, y, DEFAULT_FEEDBACK_MESSAGE, {
        fontFamily: 'sans-serif',
        fontSize: `${Math.round(Phaser.Math.Clamp(height * 0.16, 22, 34))}px`,
        color: TEXT_COLOR,
        fontStyle: '700',
        align: 'center',
        wordWrap: { width: width * 0.78, useAdvancedWrap: true },
      })
      .setOrigin(0.5)
      .setDepth(5)
  }

  private showSideGuideVideo() {
    if (!this.sideGuideVideoBounds || this.isSceneShuttingDown) {
      return
    }
    if (this.hasSubmittedSession || this.isSavingSession || this.sessionResultPanel) {
      return
    }

    const guideVideoUrl = this.getCurrentGuideVideoUrl()
    if (!guideVideoUrl) {
      this.destroyGuideVideoElement()
      this.sideGuideStatusText?.setText('등록된 가이드 영상이 없어요.').setVisible(true)
      return
    }

    this.sideGuideStatusText?.setText(GUIDE_VIDEO_PENDING_MESSAGE).setVisible(true)
    this.createGuideVideoElement(
      this.sideGuideVideoBounds,
      guideVideoUrl,
      this.sideGuideStatusText,
      15,
      {
        objectFit: 'contain',
        objectPosition: SIDE_GUIDE_VIDEO_OBJECT_POSITION,
        scale: SIDE_GUIDE_VIDEO_SCALE,
        translateX: SIDE_GUIDE_VIDEO_TRANSLATE_X,
        translateY: SIDE_GUIDE_VIDEO_TRANSLATE_Y,
      },
    )
  }

  private createGuideVideoElement(
    bounds: GuideVideoBounds,
    videoUrl: string,
    loadingText?: Phaser.GameObjects.Text,
    zIndex = 15,
    options?: {
      loop?: boolean
      onEnded?: () => void
      onReady?: () => void
      objectFit?: 'cover' | 'contain'
      objectPosition?: string
      scale?: number
      translateX?: string
      translateY?: string
    },
  ) {
    if (this.hasSubmittedSession || this.isSavingSession || this.sessionResultPanel) {
      // 종료 흐름 진입 후엔 새 가이드 영상 element 를 절대 만들지 않는다.
      // race condition (delayedCall / Promise resolve) 로 finish 후 호출되어도 차단.
      return
    }
    this.destroyGuideVideoElement()

    const wrapper = document.createElement('div')
    wrapper.style.position = 'fixed'
    wrapper.style.overflow = 'hidden'
    wrapper.style.pointerEvents = 'none'
    wrapper.style.borderRadius = `${bounds.radius ?? 18}px`
    wrapper.style.backgroundColor = '#fffbf1'
    wrapper.style.zIndex = String(zIndex)

    const video = document.createElement('video')
    video.src = videoUrl
    video.muted = true
    video.loop = options?.loop ?? true
    video.autoplay = true
    video.playsInline = true
    video.preload = 'auto'
    if (options?.onEnded) {
      video.addEventListener('ended', options.onEnded)
    }
    video.style.width = '100%'
    video.style.height = '100%'
    video.style.objectFit = options?.objectFit ?? 'cover'
    video.style.objectPosition = options?.objectPosition ?? GUIDE_VIDEO_OBJECT_POSITION
    video.style.pointerEvents = 'none'
    const scale = options?.scale ?? 1
    const translateX = options?.translateX ?? '0%'
    const translateY = options?.translateY ?? '0%'
    const hasTranslate = translateX !== '0%' || translateY !== '0%'
    if (scale !== 1 || hasTranslate) {
      const parts: string[] = []
      if (scale !== 1) parts.push(`scale(${scale})`)
      if (hasTranslate) parts.push(`translate(${translateX}, ${translateY})`)
      video.style.transform = parts.join(' ')
      video.style.transformOrigin = 'center'
    }
    wrapper.appendChild(video)

    const positionWrapper = () => {
      const canvasRect = this.game.canvas.getBoundingClientRect()
      const scaleX = canvasRect.width / this.scale.width
      const scaleY = canvasRect.height / this.scale.height

      wrapper.style.left = `${canvasRect.left + bounds.x * scaleX}px`
      wrapper.style.top = `${canvasRect.top + bounds.y * scaleY}px`
      wrapper.style.width = `${bounds.width * scaleX}px`
      wrapper.style.height = `${bounds.height * scaleY}px`
    }

    let readyHandled = false
    const handleReady = () => {
      if (readyHandled) return
      readyHandled = true
      loadingText?.setVisible(false)
      options?.onReady?.()
    }
    video.addEventListener('loadeddata', handleReady)
    video.addEventListener('canplay', handleReady)
    video.addEventListener('playing', handleReady)
    video.addEventListener(
      'error',
      () => {
        console.warn('[TaekwondoPoomsaePracticeScene] guide video load error', {
          src: video.src,
          mediaError: video.error,
        })
        loadingText?.setText('가이드 영상을 재생할 수 없어요.').setVisible(true)
      },
      { once: true },
    )

    positionWrapper()
    document.body.appendChild(wrapper)
    this.guideVideoElement = video
    this.guideVideoWrapper = wrapper
    this.guideVideoResizeHandler = positionWrapper
    window.addEventListener('resize', positionWrapper)

    console.log('[TaekwondoPoomsaePracticeScene] guide video play attempt', {
      src: video.src,
      readyState: video.readyState,
    })
    void video.play().catch(err => {
      console.warn('[TaekwondoPoomsaePracticeScene] guide video play rejected', err)
      loadingText?.setText('가이드 영상을 불러오는 중입니다.').setVisible(true)
    })
  }

  private destroyGuideVideoElement() {
    if (this.guideVideoResizeHandler) {
      window.removeEventListener('resize', this.guideVideoResizeHandler)
      this.guideVideoResizeHandler = undefined
    }

    if (!this.guideVideoElement) {
      return
    }

    this.guideVideoElement.pause()
    this.guideVideoElement.removeAttribute('src')
    this.guideVideoElement.load()
    this.guideVideoElement = undefined

    if (this.guideVideoWrapper) {
      this.guideVideoWrapper.remove()
      this.guideVideoWrapper = undefined
    }
  }

  private resizeCameraTexture(displayWidth: number, displayHeight: number) {
    if (!this.cameraCanvas || !this.cameraTexture) {
      return
    }

    const canvasWidth = 960
    const canvasHeight = Math.max(1, Math.round(canvasWidth * (displayHeight / displayWidth)))

    if (this.cameraCanvas.width === canvasWidth && this.cameraCanvas.height === canvasHeight) {
      return
    }

    this.cameraCanvas.width = canvasWidth
    this.cameraCanvas.height = canvasHeight

    const context = this.cameraCanvas.getContext('2d')
    if (!context) {
      throw new Error('Taekwondo camera canvas context is not available.')
    }
    this.cameraContext = context
    this.cameraTexture.refresh()
    this.hasDrawnCameraPlaceholder = false
    this.lastVideoTime = -1
  }

  private createPoomsaeProgress(x: number, y: number, width: number, height: number) {
    this.progressView?.destroy()
    this.progressView = createPoomsaeProgressView(this, {
      x,
      y,
      width,
      height,
      inactiveIconKey: ASSET_KEYS.seokjaeProgress,
      activeIconKey: ASSET_KEYS.seokjaeProgressActive,
      defaultTotalStepCount: DEFAULT_TOTAL_STEP_COUNT,
    })
    this.updatePoomsaeProgress()
  }

  private updatePoomsaeProgress() {
    this.progressView?.update(this.getPracticeMotionCount(), this.motionResults.length)
  }

  private showFeedback(message: string) {
    this.feedbackText?.setText(message)
  }

  private async startCamera() {
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 960 },
          height: { ideal: 720 },
        },
        audio: false,
      })

      this.videoElement = document.createElement('video')
      this.videoElement.srcObject = this.mediaStream
      this.videoElement.muted = true
      this.videoElement.playsInline = true
      await this.videoElement.play()
    } catch {
      this.mediaStream = null
      this.videoElement = null
      this.hasDrawnCameraPlaceholder = false
      this.showFeedback(CAMERA_DENIED_MESSAGE)
    }
  }

  private canReadCameraFrame() {
    return Boolean(
      this.videoElement &&
      this.videoElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
      this.mediaStream?.active,
    )
  }

  private drawCameraFrame() {
    if (!this.cameraCanvas || !this.cameraContext || !this.cameraTexture) {
      return
    }

    if (this.canReadCameraFrame() && this.videoElement) {
      if (this.videoElement.currentTime === this.lastVideoTime) {
        return
      }

      this.lastVideoTime = this.videoElement.currentTime
      this.hasDrawnCameraPlaceholder = false
    } else if (this.hasDrawnCameraPlaceholder) {
      return
    }

    this.cameraContext.clearRect(0, 0, this.cameraCanvas.width, this.cameraCanvas.height)

    if (this.canReadCameraFrame() && this.videoElement) {
      const videoWidth = this.videoElement.videoWidth || this.cameraCanvas.width
      const videoHeight = this.videoElement.videoHeight || this.cameraCanvas.height
      const canvasAspect = this.cameraCanvas.width / this.cameraCanvas.height
      const videoAspect = videoWidth / videoHeight
      let sourceX = 0
      let sourceY = 0
      let sourceWidth = videoWidth
      let sourceHeight = videoHeight

      if (videoAspect > canvasAspect) {
        sourceWidth = videoHeight * canvasAspect
        sourceX = (videoWidth - sourceWidth) / 2
      } else {
        sourceHeight = videoWidth / canvasAspect
        sourceY = (videoHeight - sourceHeight) / 2
      }

      this.cameraContext.save()
      this.cameraContext.translate(this.cameraCanvas.width, 0)
      this.cameraContext.scale(-1, 1)
      this.cameraContext.drawImage(
        this.videoElement,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        0,
        0,
        this.cameraCanvas.width,
        this.cameraCanvas.height,
      )
      this.cameraContext.restore()
    } else {
      const gradient = this.cameraContext.createLinearGradient(0, 0, 0, this.cameraCanvas.height)
      gradient.addColorStop(0, '#f8d49a')
      gradient.addColorStop(1, '#8b4f1f')
      this.cameraContext.fillStyle = gradient
      this.cameraContext.fillRect(0, 0, this.cameraCanvas.width, this.cameraCanvas.height)
      this.cameraContext.fillStyle = 'rgba(46, 24, 8, 0.78)'
      this.cameraContext.font = 'bold 42px sans-serif'
      this.cameraContext.textAlign = 'center'
      this.cameraContext.textBaseline = 'middle'
      this.cameraContext.fillText(
        '카메라를 준비하는 중이에요.',
        this.cameraCanvas.width / 2,
        this.cameraCanvas.height / 2,
      )
      this.hasDrawnCameraPlaceholder = true
    }

    this.cameraTexture.refresh()
  }

  private returnToPoomsaeSelect() {
    fadeToScene(this, 'TaekwondoPoomsaeSelectScene', {
      duration: FADE_DURATION,
      data: { beltColor: this.beltColor },
    })
  }

  private stopPractice() {
    this.stopCamera()
    this.returnToPoomsaeSelect()
  }

  private stopCamera() {
    this.mediaStream?.getTracks().forEach(track => track.stop())
    this.mediaStream = null

    if (this.videoElement) {
      this.videoElement.pause()
      this.videoElement.srcObject = null
    }
    this.videoElement = null
    this.lastVideoTime = -1
    this.hasDrawnCameraPlaceholder = false
  }

  private cleanupCameraEffects() {
    this.cameraSuccessEffect?.destroy()
    this.cameraSuccessEffect = undefined
  }

  private cleanup() {
    this.isSceneShuttingDown = true
    this.input.keyboard?.off('keydown-ESC', this.handleEscDown)
    this.feedbackText = undefined
    this.currentMotionText = undefined
    this.motionIntroOverlay?.destroy(true)
    this.motionIntroOverlay = undefined
    this.guideVideoExpandOverlay?.destroy(true)
    this.guideVideoExpandOverlay = undefined
    this.destroyGuideVideoElement()
    this.destroyGuideMagnifierElement()
    this.destroyMotionIntroCountdownElement()
    this.beltPromotionOverlay?.destroy(true)
    this.beltPromotionOverlay = undefined
    this.sessionResultPanel?.destroy(true)
    this.sessionResultPanel = undefined
    this.finishButton?.destroy()
    this.finishButton = undefined
    this.isWaitingMotionStart = false
    this.isAiJudgementPaused = false
    this.shouldRestartCaptureAfterGuideOverlay = false
    this.isCapturing = false
    this.analysisInFlight = false
    this.hasTriggeredSuccess = false
    this.lastAnalysisStartedAtMs = 0
    this.capturedSequence = []
    this.captureTimer?.remove(false)
    this.captureTimer = null
    this.countdownTimer?.remove(false)
    this.countdownTimer = null
    this.destroyCountdownText()
    this.bestAiAnalysis = null
    this.poseLandmarker?.close()
    this.poseLandmarker = null
    this.progressView?.destroy()
    this.progressView = undefined
    this.motions = []
    this.motionResults = []
    this.recordedMotionIndexes.clear()
    this.motionRecorderHandle?.cancel()
    this.motionRecorderHandle = null
    this.pendingMotionUploads = []
    this.taekwondoSessionIdPromise = null
    this.pendingBeltPromotion = null
    this.stopCamera()
    this.cleanupCameraEffects()

    if (this.cameraTexture) {
      this.textures.remove(this.cameraTexture.key)
      this.cameraTexture = null
    }

    if (this.cameraCanvas) {
      this.cameraCanvas.remove()
      this.cameraCanvas = null
    }

    this.cameraContext = null
  }
}
