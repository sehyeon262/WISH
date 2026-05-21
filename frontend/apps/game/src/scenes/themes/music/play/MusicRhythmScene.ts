import Phaser from 'phaser'
import { playSceneBgm } from '@/game/systems/sceneBgm'
import {
  requestPresignedUploadUrls,
  saveMusicResult,
  uploadToPresignedUrl,
  type MusicResultRequest,
} from '@wish/api-client'
import { assetPath } from '@/game/assets/assetPath'
import { fadeToScene } from '@/game/systems/sceneTransition'
import { addCoverBackground } from '@/game/world/background'
import { createCameraBackground, type CameraBackground } from '@/game/world/cameraBackground'
import { HandTracker } from '@/game/motion/handTracker'
import { OneEuroPointFilter } from '@/game/motion/oneEuroFilter'
import { startMusicRecording, type MusicRecorderHandle } from '@/game/systems/musicRecorder'
import {
  DEFAULT_RHYTHM_CHART,
  getRhythmChart,
  type RhythmChart,
  type RhythmLane,
  type RhythmNote,
} from './rhythmCharts'
import { YouTubePlayerBridge } from '@/game/systems/youtubePlayer'

type MusicRhythmSceneData = {
  chartId?: string
}

const RHYTHM_BACKGROUND_BY_CHART: Record<string, string> = {
  'baby-shark': 'images/themes/music/background/babyshark.png',
  'twinkle-star': 'images/themes/music/background/littlestar.png',
  canon: 'images/themes/music/background/canon.png',
}

function getRhythmBackgroundPath(chartId: string): string {
  return RHYTHM_BACKGROUND_BY_CHART[chartId] ?? 'images/themes/music/background/background.png'
}

type JudgmentLabel = 'PERFECT' | 'GREAT' | 'GOOD'

type ActiveNote = {
  note: RhythmNote
  body: Phaser.GameObjects.Graphics
  resolved: boolean
  holdStartMs?: number
  holdLabel?: JudgmentLabel
}

type LaneView = {
  lane: RhythmLane
  color: number
  pad: Phaser.GameObjects.Graphics
}

type SeekableSound = Phaser.Sound.BaseSound & {
  seek?: number
}

const FONT_FAMILY = '"Pretendard", "Noto Sans KR", "Malgun Gothic", sans-serif'
const GAME_FONT = '"Arial Black", "Pretendard", "Noto Sans KR", "Malgun Gothic", sans-serif'
const LANE_COUNT = 4
const LANE_COLORS = [0x4fd8ff, 0x8b7cff, 0xffcf5d, 0xff6fbd] as const
const NOTE_LEAD_MS = 1_800
const PERFECT_WINDOW_MS = 45
const GREAT_WINDOW_MS = 90
const GOOD_WINDOW_MS = 150
const MISS_WINDOW_MS = 220
const HIT_LINE_RATIO = 0.78
const SPAWN_LINE_RATIO = 0.16

export class MusicRhythmScene extends Phaser.Scene {
  private chart: RhythmChart = DEFAULT_RHYTHM_CHART
  private chartId: string | undefined = undefined

  private get noteLeadMs(): number {
    return this.chart.noteLeadMs ?? NOTE_LEAD_MS
  }
  private lanes: LaneView[] = []
  private activeNotes: ActiveNote[] = []
  private keyBindings: Phaser.Input.Keyboard.Key[] = []
  private music: SeekableSound | null = null
  private scoreText!: Phaser.GameObjects.Text
  private comboText!: Phaser.GameObjects.Text
  private judgmentText!: Phaser.GameObjects.Text
  private progressFill!: Phaser.GameObjects.Graphics
  private startOverlay!: Phaser.GameObjects.Container
  private stageCenterX = 0
  private hitLineY = 0
  private spawnLineY = 0
  private playWidth = 0
  private playTopWidth = 0
  private noteHeight = 0
  private nextNoteIndex = 0
  private startTimeMs = 0
  private score = 0
  private combo = 0
  private maxCombo = 0
  private perfectCount = 0
  private greatCount = 0
  private goodCount = 0
  private missCount = 0
  private padRadius = 0
  private laneHeld: boolean[] = [false, false, false, false]
  private holdNotes: (ActiveNote | null)[] = [null, null, null, null]
  private isStarted = false
  private isFinished = false
  private isLeaving = false
  private recorder: MusicRecorderHandle | null = null
  private youtubePlayer: YouTubePlayerBridge | null = null
  private cameraBackground: CameraBackground | null = null
  private handTracker: HandTracker | null = null
  // 양손 손바닥 추적: handedness("Left"/"Right") 키로 손당 커서 + 필터 1개씩
  private handCursors: Map<string, Phaser.GameObjects.Graphics> = new Map()
  private palmFilters: Map<string, OneEuroPointFilter> = new Map()
  private lanePalmInside: boolean[] = [false, false, false, false]

  private readonly handleSpaceDown = () => {
    if (this.isFinished) {
      this.restartRound()
      return
    }

    if (!this.isStarted) {
      this.startRound()
    }
  }

  private readonly handleEscDown = () => {
    this.returnToMusicSelect()
  }

  // YouTube iframe 등으로 포커스가 빠져도 ESC 가 동작하도록 window 레벨 백업.
  private readonly handleWindowEscDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      this.returnToMusicSelect()
    }
  }

  private readonly handleRestartDown = () => {
    if (this.isStarted || this.isFinished) {
      this.restartRound()
    }
  }

  constructor() {
    super({ key: 'MusicRhythmScene' })
  }

  init(data?: MusicRhythmSceneData) {
    this.chartId = data?.chartId
    this.chart = getRhythmChart(this.chartId)
  }

  preload() {
    // unique texture key per chart — otherwise Phaser caches the first-loaded image
    // and reuses it for every other chart
    if (this.chart.youtubeVideoId) {
      // Use the YouTube thumbnail (always available, no CORS issue) as background
      const thumbUrl = `https://i.ytimg.com/vi/${this.chart.youtubeVideoId}/hqdefault.jpg`
      this.load.image(this.getRhythmBackgroundKey(), thumbUrl)
    } else {
      this.load.image(
        this.getRhythmBackgroundKey(),
        assetPath(getRhythmBackgroundPath(this.chart.id)),
      )
      this.load.audio(this.chart.audioKey, assetPath(this.chart.audioPath))
    }
  }

  private getRhythmBackgroundKey() {
    return `music-rhythm-background:${this.chart.id}`
  }

  create() {
    playSceneBgm(this)
    this.resetRoundState()

    const { width: vw, height: vh } = this.scale

    // ── 레이어 ──
    // depth 0: 일러스트 배경 (외곽에서 보임)
    // depth 1: 카메라 영상 (비네팅으로 가운데만 또렷)
    // depth 2: 어두운 틴트 (가독성)
    // depth 3+: 게임 UI (또렷)
    addCoverBackground(this, this.getRhythmBackgroundKey(), { depth: 0 }).setAlpha(1)

    // HandTracker가 비디오 + MediaPipe HandLandmarker 둘 다 관리 — 양손 추적
    this.handTracker = new HandTracker({ numHands: 2 })
    void this.handTracker.start().catch(err => {
      console.warn('[MusicRhythmScene] hand tracker start failed:', err)
    })

    this.cameraBackground = createCameraBackground(this, {
      getVideoElement: () => this.handTracker?.video ?? null,
      textureKey: 'music-rhythm-camera',
      depth: 1,
      alpha: 0.65,
      mirror: true,
      vignette: 0.95,
    })

    this.createStageBackdrop(vw, vh)

    this.stageCenterX = vw / 2
    this.hitLineY = vh * HIT_LINE_RATIO
    this.spawnLineY = vh * SPAWN_LINE_RATIO
    this.playWidth = Phaser.Math.Clamp(vw * 0.78, Math.min(360, vw * 0.9), 940)
    this.playTopWidth = Phaser.Math.Clamp(this.playWidth * 0.3, 170, 300)
    this.noteHeight = Phaser.Math.Clamp(vh * 0.034, 22, 34)

    this.createHeader(vw, vh)
    this.createLaneViews(vh)
    this.createLightBeams(vw, vh)
    this.createProgressBar(vw, vh)
    this.createStartOverlay(vw, vh)
    this.bindKeyboard()

    this.input.once('pointerdown', () => {
      if (!this.isStarted && !this.isFinished && !this.isLeaving) {
        this.startRound()
      }
    })

    // Pre-load YouTube player in the background so it's ready when user clicks start
    if (this.chart.youtubeVideoId) {
      this.youtubePlayer = new YouTubePlayerBridge(this.chart.youtubeVideoId)
      this.youtubePlayer.onEnded = () => this.finishRound()
      // Auto-resume if YouTube pauses mid-game (account conflict, autoplay policy, etc.)
      this.youtubePlayer.onPaused = () => {
        if (this.isStarted && !this.isFinished) {
          this.time.delayedCall(400, () => this.youtubePlayer?.play())
        }
      }
      this.youtubePlayer.load().catch(err => {
        console.warn('[MusicRhythmScene] YouTube player preload failed:', err)
      })
    }

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.stopMusic()
      this.cancelRecording()
      this.handTracker?.stop()
      this.handTracker = null
      this.cameraBackground?.destroy()
      this.cameraBackground = null
      this.handCursors.forEach(c => c.destroy())
      this.handCursors.clear()
      this.palmFilters.clear()
      this.keyBindings.forEach(key => key.removeAllListeners())
      this.input.keyboard?.off('keydown-SPACE', this.handleSpaceDown)
      this.input.keyboard?.off('keydown-ESC', this.handleEscDown)
      this.input.keyboard?.off('keydown-R', this.handleRestartDown)
      window.removeEventListener('keydown', this.handleWindowEscDown)
    })

    this.cameras.main.fadeIn(220, 0, 0, 0)
  }

  update() {
    // 카메라/손 추적은 게임 시작 전/후에도 항상 동작 (사용자가 본인 위치 확인)
    this.cameraBackground?.update()
    this.processHandInput()

    if (!this.isStarted || this.isFinished) {
      return
    }

    const elapsedMs = this.getSongTimeMs()
    this.spawnDueNotes(elapsedMs)
    this.checkHoldCompletions(elapsedMs)
    this.updateActiveNotes(elapsedMs)
    this.updateProgress(elapsedMs)

    if (this.shouldFinishRound(elapsedMs)) {
      this.finishRound()
    }
  }

  private processHandInput() {
    const tracker = this.handTracker
    if (!tracker || !tracker.isStarted) return

    const result = tracker.detect()

    if (result.hands.length === 0) {
      // 손이 모두 사라지면 모든 커서 숨김 + 모든 필터 리셋
      this.handCursors.forEach(cursor => cursor.setVisible(false))
      this.palmFilters.forEach(filter => filter.reset())
      this.lanePalmInside.fill(false)
      return
    }

    const { width: vw, height: vh } = this.scale
    const elapsedMs = this.getSongTimeMs()
    const activeHandIds = new Set<string>()
    const laneAggregate: boolean[] = [false, false, false, false]

    result.hands.forEach((hand, index) => {
      // handedness 가 안정적인 손 키 (Left/Right). 없으면 인덱스 fallback.
      const handId = hand.handedness ?? `hand-${index}`
      activeHandIds.add(handId)

      // 손바닥 중심 = 5/9/13/17 (검지·중지·약지·새끼 MCP) 평균
      const lm = hand.landmarks
      const a = lm[5]
      const b = lm[9]
      const c = lm[13]
      const d = lm[17]
      if (!a || !b || !c || !d) return

      const px = (a.x + b.x + c.x + d.x) / 4
      const py = (a.y + b.y + c.y + d.y) / 4

      // 카메라가 좌우 미러링되어 표시되므로 x 뒤집어서 화면 좌표에 맞춤
      const rawX = (1 - px) * vw
      const rawY = py * vh

      let filter = this.palmFilters.get(handId)
      if (!filter) {
        filter = new OneEuroPointFilter({ minCutoff: 0.5, beta: 0.02, dCutoff: 1 })
        this.palmFilters.set(handId, filter)
      }
      const smoothed = filter.filter({ x: rawX, y: rawY })
      const sx = smoothed.x
      const sy = smoothed.y

      this.drawHandCursor(handId, sx, sy)

      // 손바닥이 패드 위에 있고 그 레인에 판정 윈도우 안의 노트가 있으면 자동 탭
      for (let lane = 0; lane < LANE_COUNT; lane++) {
        const padX = this.getLaneCenterX(lane as RhythmLane, this.hitLineY)
        const padY = this.hitLineY
        const dx = sx - padX
        const dy = sy - padY
        const triggerR = this.padRadius * 1.8 // 손바닥 사이즈 + 정확도 보정
        const inside = dx * dx + dy * dy <= triggerR * triggerR
        if (!inside) continue

        laneAggregate[lane] = true

        const hasHittableNote = this.activeNotes.some(
          an =>
            !an.resolved &&
            an.note.lane === lane &&
            Math.abs(an.note.timeMs - elapsedMs) <= MISS_WINDOW_MS,
        )
        if (hasHittableNote) {
          this.handleLaneInput(lane as RhythmLane)
        }
      }
    })

    this.lanePalmInside = laneAggregate

    // 이 프레임에 보이지 않는 손은 커서 숨기고 필터 리셋
    this.handCursors.forEach((cursor, id) => {
      if (!activeHandIds.has(id)) cursor.setVisible(false)
    })
    this.palmFilters.forEach((filter, id) => {
      if (!activeHandIds.has(id)) filter.reset()
    })
  }

  private drawHandCursor(handId: string, x: number, y: number) {
    let g = this.handCursors.get(handId)
    if (!g) {
      g = this.add.graphics().setDepth(45).setScrollFactor(0)
      this.handCursors.set(handId, g)
    }
    // 손마다 색을 다르게 — Left=cyan, Right=magenta. 그 외는 cyan fallback.
    const tint = handId === 'Right' ? 0xff6fbd : 0x4fd8ff
    g.setVisible(true)
    g.clear()
    // 손바닥 사이즈 글로우 (검지 끝보다 크게)
    for (let i = 0; i < 8; i++) {
      g.fillStyle(tint, 0.035)
      g.fillCircle(x, y, 44 - i * 3)
    }
    // 손바닥 중앙 부드러운 fill
    g.fillStyle(tint, 0.18)
    g.fillCircle(x, y, 26)
    // 외곽 링
    g.lineStyle(2.5, tint, 0.95)
    g.strokeCircle(x, y, 26)
    // 중심 작은 점
    g.fillStyle(0xffffff, 0.95)
    g.fillCircle(x, y, 5)
  }

  private shouldFinishRound(elapsedMs: number) {
    const allNotesSpawned = this.nextNoteIndex >= this.chart.notes.length
    const noActiveNotes = this.activeNotes.length === 0 && this.holdNotes.every(note => !note)
    const playableEndMs = this.getLastNoteEndMs() + MISS_WINDOW_MS + 120

    return (
      allNotesSpawned &&
      noActiveNotes &&
      (elapsedMs >= this.chart.durationMs || elapsedMs >= playableEndMs)
    )
  }

  private resetRoundState() {
    this.lanes = []
    this.activeNotes = []
    this.keyBindings = []
    this.music = null
    this.nextNoteIndex = 0
    this.startTimeMs = 0
    this.score = 0
    this.combo = 0
    this.maxCombo = 0
    this.perfectCount = 0
    this.greatCount = 0
    this.goodCount = 0
    this.missCount = 0
    this.laneHeld = [false, false, false, false]
    this.holdNotes = [null, null, null, null]
    this.isStarted = false
    this.isFinished = false
    this.isLeaving = false
    this.cameraBackground = null
    this.handTracker = null
    this.handCursors = new Map()
    this.palmFilters = new Map()
    this.lanePalmInside = [false, false, false, false]
    this.youtubePlayer = null
  }

  private createStageBackdrop(vw: number, vh: number) {
    // 어두운 틴트를 가운데(카메라 영역)에만 깔고 가장자리는 일러스트가 또렷하게
    const tintKey = 'music-rhythm-center-tint'
    if (this.textures.exists(tintKey)) {
      this.textures.remove(tintKey)
    }
    const tintCanvas = document.createElement('canvas')
    tintCanvas.width = 960
    tintCanvas.height = 540
    const tintCtx = tintCanvas.getContext('2d')
    if (tintCtx) {
      const cx = tintCanvas.width / 2
      const cy = tintCanvas.height / 2
      const inner = Math.min(tintCanvas.width, tintCanvas.height) * 0.2
      const outer = Math.hypot(cx, cy)
      const grad = tintCtx.createRadialGradient(cx, cy, inner, cx, cy, outer)
      grad.addColorStop(0, 'rgba(5,6,14,0.42)')
      grad.addColorStop(0.7, 'rgba(5,6,14,0.18)')
      grad.addColorStop(1, 'rgba(5,6,14,0)')
      tintCtx.fillStyle = grad
      tintCtx.fillRect(0, 0, tintCanvas.width, tintCanvas.height)
      this.textures.addCanvas(tintKey, tintCanvas)
      this.add
        .image(vw / 2, vh / 2, tintKey)
        .setDisplaySize(vw, vh)
        .setDepth(2)
    }

    // stars
    Array.from({ length: 60 }, (_, index) => {
      const x = ((index * 137) % Math.max(1, Math.round(vw))) + 0.5
      const y = ((index * 89) % Math.max(1, Math.round(vh * 0.85))) + vh * 0.04
      const alpha = index % 3 === 0 ? 0.55 : 0.25
      const size = index % 5 === 0 ? 2.5 : 1.4
      this.add.rectangle(x, y, size, size, 0xffffff, alpha).setDepth(3)
    })
  }

  private createLightBeams(vw: number, vh: number) {
    const beams = this.add.graphics().setDepth(5).setScrollFactor(0)

    const leftX = this.stageCenterX - this.playWidth / 2
    const rightX = this.stageCenterX + this.playWidth / 2
    const focusY = this.hitLineY
    const STEPS = 10
    const STEP_ALPHA = 0.021

    // left beam: 10 uniform-alpha triangles from widest to narrowest → smooth cumulative gradient
    for (let i = 0; i < STEPS; i++) {
      const t = i / (STEPS - 1)
      const baseL = Phaser.Math.Linear(-vw * 0.22, leftX * 0.2, t)
      const baseR = Phaser.Math.Linear(vw * 0.08, leftX * 0.72, t)
      beams.fillStyle(0x2be7ff, STEP_ALPHA)
      beams.fillTriangle(leftX, focusY, baseL, vh + 40, baseR, vh + 40)
    }

    // right beam: same technique mirrored
    for (let i = 0; i < STEPS; i++) {
      const t = i / (STEPS - 1)
      const baseL = Phaser.Math.Linear(vw + vw * 0.22, rightX + (vw - rightX) * 0.28, t)
      const baseR = Phaser.Math.Linear(vw - vw * 0.08, rightX + (vw - rightX) * 0.8, t)
      beams.fillStyle(0xff59d6, STEP_ALPHA)
      beams.fillTriangle(rightX, focusY, baseL, vh + 40, baseR, vh + 40)
    }
  }

  private createHeader(vw: number, vh: number) {
    // score — top left
    this.scoreText = this.add
      .text(vw * 0.04, vh * 0.07, '0', {
        fontFamily: GAME_FONT,
        fontSize: `${Phaser.Math.Clamp(vh * 0.048, 34, 54)}px`,
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#00d4ff',
        strokeThickness: 3,
      })
      .setOrigin(0, 0.5)
      .setDepth(30)
      .setScrollFactor(0)

    this.add
      .text(vw * 0.04, vh * 0.12, 'SCORE', {
        fontFamily: FONT_FAMILY,
        fontSize: `${Phaser.Math.Clamp(vh * 0.018, 13, 18)}px`,
        color: '#88ccee',
        fontStyle: 'bold',
      })
      .setOrigin(0, 0.5)
      .setDepth(30)
      .setScrollFactor(0)

    // combo — right center, large
    this.comboText = this.add
      .text(vw * 0.93, vh * 0.44, '0', {
        fontFamily: GAME_FONT,
        fontSize: `${Phaser.Math.Clamp(vh * 0.13, 90, 140)}px`,
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#cc44ff',
        strokeThickness: 4,
        align: 'right',
      })
      .setOrigin(1, 0.5)
      .setDepth(30)
      .setScrollFactor(0)

    this.add
      .text(vw * 0.93, vh * 0.56, 'COMBO', {
        fontFamily: GAME_FONT,
        fontSize: `${Phaser.Math.Clamp(vh * 0.028, 20, 30)}px`,
        fontStyle: 'bold',
        color: '#cc44ff',
        stroke: '#44006a',
        strokeThickness: 4,
        align: 'right',
      })
      .setOrigin(1, 0.5)
      .setDepth(30)
      .setScrollFactor(0)

    this.judgmentText = this.add
      .text(vw * 0.5, vh * 0.38, '', {
        fontFamily: GAME_FONT,
        fontSize: `${Phaser.Math.Clamp(vh * 0.07, 48, 80)}px`,
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setDepth(55)
      .setAlpha(0)
      .setScrollFactor(0)

    this.createExitButton(vw, vh)
  }

  private createExitButton(vw: number, vh: number) {
    const size = Phaser.Math.Clamp(vh * 0.05, 34, 48)
    const cx = vw - size * 0.9
    const cy = size * 0.9

    const bg = this.add.graphics().setDepth(60).setScrollFactor(0)
    bg.fillStyle(0x000000, 0.55)
    bg.fillCircle(cx, cy, size / 2)
    bg.lineStyle(1.5, 0xffffff, 0.35)
    bg.strokeCircle(cx, cy, size / 2)

    const label = this.add
      .text(cx, cy, '✕', {
        fontFamily: GAME_FONT,
        fontSize: `${Math.floor(size * 0.55)}px`,
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(61)
      .setScrollFactor(0)

    const hit = this.add
      .zone(cx, cy, size * 1.2, size * 1.2)
      .setInteractive({ cursor: 'pointer' })
      .setDepth(62)
      .setScrollFactor(0)

    hit.on('pointerover', () => label.setColor('#ff6f9d'))
    hit.on('pointerout', () => label.setColor('#ffffff'))
    hit.on('pointerdown', () => this.returnToMusicSelect())
  }

  private createLaneViews(_vh: number) {
    // padRadius: note at hitLineY has same radius → perfect match
    this.padRadius = (this.playWidth / LANE_COUNT) * 0.26

    const track = this.add.graphics().setDepth(8).setScrollFactor(0)
    this.drawPerspectiveTrack(track)

    for (let index = 0; index < LANE_COUNT; index += 1) {
      const lane = index as RhythmLane
      const color = LANE_COLORS[index]
      const x = this.getLaneCenterX(lane, this.hitLineY)
      const pad = this.add.graphics().setDepth(22).setScrollFactor(0)

      this.drawPad(pad, x, this.hitLineY, this.padRadius, color, 0.65)

      const touchSize = this.padRadius * 2.4
      const zone = this.add
        .zone(x, this.hitLineY, touchSize, touchSize)
        .setInteractive({ cursor: 'pointer' })
        .setDepth(50)
        .setScrollFactor(0)
      zone.on('pointerdown', () => this.handleLaneInput(lane))
      zone.on('pointerup', () => this.handleLaneRelease(lane))
      zone.on('pointerout', () => this.handleLaneRelease(lane))

      this.lanes.push({ lane, color, pad })
    }
  }

  private drawPerspectiveTrack(track: Phaser.GameObjects.Graphics) {
    const topY = this.spawnLineY - this.noteHeight
    // fills slightly below hitLine for visual continuity; lines STOP at hitLine
    const fillBottomY = this.hitLineY + this.padRadius * 0.6
    const lineBottomY = this.hitLineY - this.padRadius * 0.05

    // base dark track
    track.clear()
    track.fillStyle(0x04060f, 0.75)
    this.fillTrackQuad(track, 0, LANE_COUNT, topY, fillBottomY)

    // lane color fills
    for (let lane = 0; lane < LANE_COUNT; lane += 1) {
      track.fillStyle(LANE_COLORS[lane], 0.22)
      this.fillTrackQuad(track, lane, lane + 1, topY, fillBottomY)
    }

    // horizontal scanlines
    const scanStep = 52
    for (let sy = topY + scanStep; sy < lineBottomY; sy += scanStep) {
      track.lineStyle(1, 0xffffff, 0.055)
      track.lineBetween(this.getLaneBoundaryX(0, sy), sy, this.getLaneBoundaryX(LANE_COUNT, sy), sy)
    }

    // lane divider lines — END at lineBottomY (above pad circles)
    for (let boundary = 0; boundary <= LANE_COUNT; boundary += 1) {
      const isEdge = boundary === 0 || boundary === LANE_COUNT
      if (isEdge) {
        track.lineStyle(2.5, 0xffffff, 0.5)
      } else {
        const leftColor = LANE_COLORS[boundary - 1]
        const rightColor = LANE_COLORS[boundary]
        const blendR = (((leftColor >> 16) & 0xff) + ((rightColor >> 16) & 0xff)) >> 1
        const blendG = (((leftColor >> 8) & 0xff) + ((rightColor >> 8) & 0xff)) >> 1
        const blendB = ((leftColor & 0xff) + (rightColor & 0xff)) >> 1
        track.lineStyle(1.5, (blendR << 16) | (blendG << 8) | blendB, 0.5)
      }
      track.lineBetween(
        this.getLaneBoundaryX(boundary, topY),
        topY,
        this.getLaneBoundaryX(boundary, lineBottomY),
        lineBottomY,
      )
    }

    // hit line glow
    const hlLeft = this.getLaneBoundaryX(0, this.hitLineY)
    const hlRight = this.getLaneBoundaryX(LANE_COUNT, this.hitLineY)
    const hlWidth = hlRight - hlLeft

    track.fillStyle(0xf363ff, 0.08)
    track.fillRect(hlLeft, this.hitLineY - 20, hlWidth, 40)
    track.fillStyle(0xf363ff, 0.25)
    track.fillRect(hlLeft, this.hitLineY - 5, hlWidth, 10)
    track.lineStyle(3, 0xf363ff, 1)
    track.lineBetween(hlLeft, this.hitLineY, hlRight, this.hitLineY)
    track.lineStyle(1, 0xffffff, 0.75)
    track.lineBetween(hlLeft, this.hitLineY, hlRight, this.hitLineY)
  }

  private fillTrackQuad(
    graphics: Phaser.GameObjects.Graphics,
    leftBoundary: number,
    rightBoundary: number,
    topY: number,
    bottomY: number,
  ) {
    graphics.beginPath()
    graphics.moveTo(this.getLaneBoundaryX(leftBoundary, topY), topY)
    graphics.lineTo(this.getLaneBoundaryX(rightBoundary, topY), topY)
    graphics.lineTo(this.getLaneBoundaryX(rightBoundary, bottomY), bottomY)
    graphics.lineTo(this.getLaneBoundaryX(leftBoundary, bottomY), bottomY)
    graphics.closePath()
    graphics.fillPath()
  }

  private drawPad(
    pad: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    radius: number,
    color: number,
    alpha: number,
  ) {
    pad.clear()
    // outer glow: 6 steps, smooth fade
    for (let g = 0; g < 6; g++) {
      pad.fillStyle(color, 0.022 * alpha)
      pad.fillCircle(x, y, radius * (1.55 - g * 0.1))
    }
    // dark base
    pad.fillStyle(0x06020f, 0.78)
    pad.fillCircle(x, y, radius)
    // colored tint
    pad.fillStyle(color, alpha * 0.35)
    pad.fillCircle(x, y, radius)
    // bright ring
    pad.lineStyle(3.5, color, alpha)
    pad.strokeCircle(x, y, radius)
    // inner subtle ring
    pad.lineStyle(1.2, 0xffffff, alpha * 0.25)
    pad.strokeCircle(x, y, radius * 0.62)
  }

  private createProgressBar(vw: number, vh: number) {
    const width = Math.min(vw * 0.58, 650)
    const height = Phaser.Math.Clamp(vh * 0.012, 8, 12)
    const x = vw / 2 - width / 2
    const y = vh * 0.12
    const frame = this.add.graphics().setDepth(29).setScrollFactor(0)
    frame.fillStyle(0xffffff, 0.16)
    frame.fillRoundedRect(x, y, width, height, height / 2)
    frame.lineStyle(2, 0xffffff, 0.28)
    frame.strokeRoundedRect(x, y, width, height, height / 2)

    this.progressFill = this.add.graphics().setDepth(30).setScrollFactor(0)
    this.progressFill.setData('x', x)
    this.progressFill.setData('y', y)
    this.progressFill.setData('width', width)
    this.progressFill.setData('height', height)
    this.updateProgress(0)
  }

  private createStartOverlay(vw: number, vh: number) {
    // soft warm dim
    const dim = this.add.rectangle(0, 0, vw, vh, 0x1a1530, 0.6).setOrigin(0.5)

    // ── card panel with proper glow + gradient ──
    const panelW = Phaser.Math.Clamp(vw * 0.38, 380, 480)
    const panelH = Phaser.Math.Clamp(vh * 0.5, 360, 440)
    const panel = this.drawGlowingPanel(panelW, panelH, 0xffc6e0)

    // ── top tag pill ──
    const tagText = '♪  플레이 준비'
    const tagFontSize = Phaser.Math.Clamp(vh * 0.02, 13, 16)
    const tagLabel = this.add
      .text(0, 0, tagText, {
        fontFamily: FONT_FAMILY,
        fontSize: `${tagFontSize}px`,
        fontStyle: 'bold',
        color: '#ffe9bf',
      })
      .setOrigin(0.5)
      .setLetterSpacing(3)
    const tagW = tagLabel.width + 28
    const tagH = 26
    const tagY = -panelH / 2 + 44
    const tagBg = this.add.graphics()
    tagBg.fillStyle(0xffb597, 0.18)
    tagBg.fillRoundedRect(-tagW / 2, tagY - tagH / 2, tagW, tagH, tagH / 2)
    tagBg.lineStyle(1, 0xffd6b3, 0.5)
    tagBg.strokeRoundedRect(-tagW / 2, tagY - tagH / 2, tagW, tagH, tagH / 2)
    tagLabel.setPosition(0, tagY)

    // ── title — generous breathing room from tag ──
    const titleY = tagY + 80
    const rawTitle = this.chart.title
    const displayTitle = rawTitle.length > 20 ? rawTitle.substring(0, 19) + '…' : rawTitle
    const titleFontSize =
      displayTitle.length > 14
        ? Phaser.Math.Clamp(vh * 0.038, 22, 30)
        : Phaser.Math.Clamp(vh * 0.06, 38, 54)
    const title = this.add
      .text(0, titleY, displayTitle, {
        fontFamily: FONT_FAMILY,
        fontSize: `${titleFontSize}px`,
        fontStyle: 'bold',
        color: '#fff8f0',
      })
      .setOrigin(0.5)
      .setShadow(0, 3, '#000000', 10, false, true)

    // soft pastel underline
    const underline = this.add.graphics()
    const ulW = 72
    underline.fillStyle(0xffc6e0, 0.85)
    underline.fillRoundedRect(-ulW / 2, titleY + 42, ulW, 3, 2)

    // ── guide message — sits close under the title ──
    const guideY = titleY + 88
    const guideMain = this.add
      .text(0, guideY, '블록이 선에 닿는 순간 박자에 맞춰 눌러주세요', {
        fontFamily: FONT_FAMILY,
        fontSize: `${Phaser.Math.Clamp(vh * 0.022, 14, 17)}px`,
        fontStyle: 'bold',
        color: '#dcd4ee',
        align: 'center',
      })
      .setOrigin(0.5)
      .setLetterSpacing(0.5)
      .setShadow(0, 2, '#000000', 6, false, true)

    // ── start button ──
    const playW = 200
    const playH = 50
    const playY = panelH / 2 - 80
    const playBg = this.add.graphics()
    // soft outer glow
    for (let g = 0; g < 8; g++) {
      playBg.fillStyle(0xffb6d9, 0.03)
      playBg.fillRoundedRect(
        -playW / 2 - 8 + g,
        playY - playH / 2 - 8 + g,
        playW + 16 - g * 2,
        playH + 16 - g * 2,
        playH / 2 + 8,
      )
    }
    playBg.fillStyle(0xffb6d9, 0.85)
    playBg.fillRoundedRect(-playW / 2, playY - playH / 2, playW, playH, playH / 2)
    // subtle inner highlight on button (top half)
    playBg.fillStyle(0xffffff, 0.12)
    playBg.fillRoundedRect(-playW / 2 + 3, playY - playH / 2 + 3, playW - 6, playH / 2, playH / 2)
    playBg.lineStyle(1.5, 0xfff0f6, 0.9)
    playBg.strokeRoundedRect(-playW / 2, playY - playH / 2, playW, playH, playH / 2)

    const playLabel = this.add
      .text(0, playY, '▶  시작하기', {
        fontFamily: FONT_FAMILY,
        fontSize: `${Phaser.Math.Clamp(vh * 0.024, 15, 19)}px`,
        fontStyle: 'bold',
        color: '#3d1d2e',
      })
      .setOrigin(0.5)
      .setLetterSpacing(2)

    const playHint = this.add
      .text(0, playY + playH / 2 + 22, 'SPACE  또는  화면 클릭', {
        fontFamily: FONT_FAMILY,
        fontSize: '11px',
        fontStyle: 'bold',
        color: '#9890b0',
      })
      .setOrigin(0.5)
      .setLetterSpacing(2)

    this.startOverlay = this.add
      .container(vw / 2, vh / 2, [
        dim,
        panel,
        tagBg,
        tagLabel,
        title,
        underline,
        guideMain,
        playBg,
        playLabel,
        playHint,
      ])
      .setDepth(60)
      .setScrollFactor(0)

    // gentle pulse on play button label
    this.tweens.add({
      targets: playLabel,
      alpha: 0.6,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })
  }

  // ── shared helper: a frosted dark panel with proper soft glow + vertical gradient depth ──
  private drawGlowingPanel(
    panelW: number,
    panelH: number,
    accentNum: number,
    options: { surfaceColor?: number; surfaceAlpha?: number } = {},
  ) {
    const surfaceColor = options.surfaceColor ?? 0x1f1a35
    const surfaceAlpha = options.surfaceAlpha ?? 0.94
    const g = this.add.graphics()

    // 1. wide soft outer aura — multiple expanding rounded rects, very low alpha
    for (let i = 0; i < 16; i++) {
      const spread = 28 - i * 1.6
      g.fillStyle(accentNum, 0.014)
      g.fillRoundedRect(
        -panelW / 2 - spread,
        -panelH / 2 - spread,
        panelW + spread * 2,
        panelH + spread * 2,
        30 + spread * 0.4,
      )
    }

    // 2. panel body — solid frosted surface (color is configurable so the
    // result overlay can use a brighter, friendlier shade than the in-game
    // pause panel)
    g.fillStyle(surfaceColor, surfaceAlpha)
    g.fillRoundedRect(-panelW / 2, -panelH / 2, panelW, panelH, 26)

    // 3. inner top→middle gradient (lighter top, fading down — sense of light source above)
    const gradSteps = 18
    const gradH = panelH * 0.55
    for (let i = 0; i < gradSteps; i++) {
      const t = i / (gradSteps - 1)
      const stripY = -panelH / 2 + i * (gradH / gradSteps)
      g.fillStyle(0xffffff, 0.05 * (1 - t))
      g.fillRect(-panelW / 2 + 6, stripY, panelW - 12, gradH / gradSteps + 1)
    }

    // 4. inner bottom shadow — adds depth at bottom
    const shadowSteps = 10
    const shadowH = panelH * 0.3
    for (let i = 0; i < shadowSteps; i++) {
      const t = i / (shadowSteps - 1)
      const stripY = panelH / 2 - shadowH + i * (shadowH / shadowSteps)
      g.fillStyle(0x000000, 0.04 * t)
      g.fillRect(-panelW / 2 + 6, stripY, panelW - 12, shadowH / shadowSteps + 1)
    }

    // 5. soft accent border with double-line glow
    g.lineStyle(2.5, accentNum, 0.18)
    g.strokeRoundedRect(-panelW / 2 - 1, -panelH / 2 - 1, panelW + 2, panelH + 2, 27)
    g.lineStyle(1.5, accentNum, 0.55)
    g.strokeRoundedRect(-panelW / 2, -panelH / 2, panelW, panelH, 26)

    return g
  }

  private bindKeyboard() {
    const keyboard = this.input.keyboard
    if (!keyboard) {
      return
    }

    const laneKeyCodes = [
      Phaser.Input.Keyboard.KeyCodes.A,
      Phaser.Input.Keyboard.KeyCodes.S,
      Phaser.Input.Keyboard.KeyCodes.D,
      Phaser.Input.Keyboard.KeyCodes.F,
    ]
    const arrowKeyCodes = [
      Phaser.Input.Keyboard.KeyCodes.LEFT,
      Phaser.Input.Keyboard.KeyCodes.DOWN,
      Phaser.Input.Keyboard.KeyCodes.UP,
      Phaser.Input.Keyboard.KeyCodes.RIGHT,
    ]

    laneKeyCodes.forEach((keyCode, index) => {
      const key = keyboard.addKey(keyCode)
      const lane = index as RhythmLane
      key.on('down', () => this.handleLaneInput(lane))
      key.on('up', () => this.handleLaneRelease(lane))
      this.keyBindings.push(key)
    })

    arrowKeyCodes.forEach((keyCode, index) => {
      const key = keyboard.addKey(keyCode)
      const lane = index as RhythmLane
      key.on('down', () => this.handleLaneInput(lane))
      key.on('up', () => this.handleLaneRelease(lane))
      this.keyBindings.push(key)
    })

    keyboard.on('keydown-SPACE', this.handleSpaceDown)
    keyboard.on('keydown-ESC', this.handleEscDown)
    keyboard.on('keydown-R', this.handleRestartDown)
    window.addEventListener('keydown', this.handleWindowEscDown)
  }

  private startRound() {
    if (this.isStarted || this.isFinished) {
      return
    }

    this.isStarted = true
    this.startTimeMs = this.time.now
    this.startOverlay.destroy()

    if (this.youtubePlayer) {
      // YouTube mode — play (or wait for load then play)
      if (this.youtubePlayer.isReady) {
        this.youtubePlayer.play()
      } else {
        this.youtubePlayer
          .load()
          .then(() => this.youtubePlayer?.play())
          .catch(err => console.warn('[MusicRhythmScene] YouTube play failed:', err))
      }
    } else {
      // Phaser audio mode
      this.music = this.sound.add(this.chart.audioKey, { volume: 0.78 }) as SeekableSound
      this.music.once('complete', () => this.finishRound())
      this.music.play()
    }

    this.recorder = startMusicRecording({ scene: this })
  }

  private spawnDueNotes(elapsedMs: number) {
    while (
      this.nextNoteIndex < this.chart.notes.length &&
      this.chart.notes[this.nextNoteIndex].timeMs - elapsedMs <= this.noteLeadMs
    ) {
      this.spawnNote(this.chart.notes[this.nextNoteIndex])
      this.nextNoteIndex += 1
    }
  }

  private spawnNote(note: RhythmNote) {
    const body = this.add.graphics().setDepth(24).setAlpha(0.98).setScrollFactor(0)
    this.activeNotes.push({ note, body, resolved: false })
  }

  private updateActiveNotes(elapsedMs: number) {
    this.activeNotes.forEach(activeNote => {
      if (activeNote.resolved) return

      if (activeNote.holdStartMs !== undefined) {
        this.drawHeldNote(activeNote, elapsedMs)
        return
      }

      const untilHitMs = activeNote.note.timeMs - elapsedMs
      const progress = Phaser.Math.Clamp(1 - untilHitMs / this.noteLeadMs, 0, 1.0)
      const y = Phaser.Math.Linear(this.spawnLineY, this.hitLineY, progress)

      // For hold notes: tail end Y = where the hold-end timestamp would visually be
      let tailEndY = y
      if (activeNote.note.durationMs && activeNote.note.durationMs > 150) {
        const tailUntilHit = activeNote.note.timeMs + activeNote.note.durationMs - elapsedMs
        const tailProgress = Phaser.Math.Clamp(1 - tailUntilHit / this.noteLeadMs, 0, 1.0)
        tailEndY = Phaser.Math.Linear(this.spawnLineY, this.hitLineY, tailProgress)
      }

      this.drawFallingNote(activeNote, y, progress, tailEndY)

      if (elapsedMs - activeNote.note.timeMs > MISS_WINDOW_MS) {
        this.resolveMiss(activeNote)
      }
    })

    this.activeNotes = this.activeNotes.filter(activeNote => !activeNote.resolved)
  }

  private drawFallingNote(
    activeNote: ActiveNote,
    y: number,
    _progress: number,
    tailEndY: number = y,
  ) {
    const { note, body } = activeNote
    const lc = this.lanes[note.lane].color
    const r = this.getLaneWidthAtY(y) * 0.26 // matches padRadius at hitLineY
    const x = this.getLaneCenterX(note.lane, y)
    body.clear()

    // ── Hold note tail (trapezoid that follows lane perspective) ──
    // tailEndY is the timing-based Y of where the hold END would be right now —
    // always ABOVE y (higher on screen = earlier in time)
    if (note.durationMs && note.durationMs > 150 && tailEndY < y - r) {
      const tailTopY = Math.max(tailEndY, -r * 2) // allow slightly above screen
      const tailBotY = y - r // just above circle top
      const tailH = tailBotY - tailTopY

      if (tailH > 4) {
        this.drawHoldTailTrapezoid(body, note.lane, tailTopY, tailBotY, lc, 0.62, 0.14)
      }
    }

    // ── 3D orb: solid base + transparent overlays ──

    // outer glow: 7 steps, each ~0.025 alpha → smooth fade, no visible rings
    for (let g = 0; g < 7; g++) {
      body.fillStyle(lc, 0.025)
      body.fillCircle(x, y, r * (1.72 - g * 0.1))
    }

    // drop shadow (offset → feels grounded)
    body.fillStyle(0x000000, 0.34)
    body.fillCircle(x + r * 0.1, y + r * 0.13, r * 0.92)

    // ① SOLID base: the lane color
    body.fillStyle(lc, 1)
    body.fillCircle(x, y, r)

    // ② Dark shading bottom-right: 7 steps at low alpha → smooth shadow, no visible ring edges
    for (let i = 0; i < 7; i++) {
      const t = i / 6
      body.fillStyle(0x000000, 0.048)
      body.fillCircle(x + r * (0.06 + 0.16 * t), y + r * (0.08 + 0.16 * t), r * (0.97 - 0.17 * t))
    }

    // ③ Bright overlay top-left: 7 steps at low alpha → smooth highlight, no visible ring edges
    for (let i = 0; i < 7; i++) {
      const t = i / 6
      body.fillStyle(0xffffff, 0.052)
      body.fillCircle(x - r * (0.04 + 0.12 * t), y - r * (0.05 + 0.16 * t), r * (0.9 - 0.2 * t))
    }

    // ④ Specular: 3 overlapping soft circles (largest→softest, smallest→hardest)
    body.fillStyle(0xffffff, 0.42)
    body.fillCircle(x - r * 0.29, y - r * 0.31, r * 0.28)
    body.fillStyle(0xffffff, 0.78)
    body.fillCircle(x - r * 0.31, y - r * 0.33, r * 0.14)
    body.fillStyle(0xffffff, 1)
    body.fillCircle(x - r * 0.33, y - r * 0.35, r * 0.055)

    // ⑤ Rim highlight
    body.lineStyle(1.8, 0xffffff, 0.45)
    body.strokeCircle(x, y, r)
  }

  private handleLaneInput(lane: RhythmLane) {
    if (this.isFinished) return
    if (!this.isStarted) {
      this.startRound()
      return
    }
    if (this.laneHeld[lane]) return

    this.flashPad(lane)
    const elapsedMs = this.getSongTimeMs()
    const candidates = this.activeNotes
      .filter(an => !an.resolved && an.holdStartMs === undefined && an.note.lane === lane)
      .map(an => ({
        activeNote: an,
        signedDiffMs: an.note.timeMs - elapsedMs,
        diffMs: Math.abs(an.note.timeMs - elapsedMs),
      }))
      .filter(c => c.diffMs <= MISS_WINDOW_MS)
      .sort((a, b) => a.diffMs - b.diffMs)

    const best = candidates[0]
    if (!best) {
      // 노트가 판정 범위 안에 없으면 빈 탭으로 간주 — MISS 처리하지 않음
      return
    }

    const isHold = Boolean(best.activeNote.note.durationMs && best.activeNote.note.durationMs > 150)

    let label: JudgmentLabel
    let color: string

    if (best.diffMs <= PERFECT_WINDOW_MS) {
      label = 'PERFECT'
      color = '#fff4a8'
    } else if (best.diffMs <= GREAT_WINDOW_MS) {
      label = 'GREAT'
      color = '#a7e5ff'
    } else if (best.diffMs <= GOOD_WINDOW_MS) {
      label = 'GOOD'
      color = '#a7f3d0'
    } else if (best.signedDiffMs > 0) {
      // 노트가 아직 도착 전인데 GOOD 밖에서 일찍 누른 경우 — 손 트래킹 떨림 보정: 빈 탭으로 무시
      return
    } else {
      // 노트가 판정선을 지난 뒤 늦게 누른 경우만 MISS
      this.resolveMiss(best.activeNote)
      return
    }

    if (isHold) {
      best.activeNote.holdStartMs = elapsedMs
      best.activeNote.holdLabel = label
      this.laneHeld[lane] = true
      this.holdNotes[lane] = best.activeNote
      this.combo += 1
      this.maxCombo = Math.max(this.maxCombo, this.combo)
      const baseScore = label === 'PERFECT' ? 500 : label === 'GREAT' ? 400 : 300
      this.score += baseScore + this.combo * 6
      if (label === 'PERFECT') this.perfectCount += 1
      else if (label === 'GREAT') this.greatCount += 1
      else this.goodCount += 1
      this.updateScoreHud()
      this.showJudgment(label, color)
      this.spawnBurst(this.getLaneCenterX(lane, this.hitLineY), this.hitLineY, lane)
    } else {
      const baseScore = label === 'PERFECT' ? 1_000 : label === 'GREAT' ? 850 : 650
      this.resolveHit(best.activeNote, label, baseScore, color)
    }
  }

  private handleLaneRelease(lane: RhythmLane) {
    if (!this.laneHeld[lane]) return
    this.laneHeld[lane] = false

    const holdNote = this.holdNotes[lane]
    if (!holdNote || holdNote.resolved) {
      this.holdNotes[lane] = null
      return
    }
    this.holdNotes[lane] = null

    const elapsedMs = this.getSongTimeMs()
    const holdDuration = elapsedMs - (holdNote.holdStartMs ?? elapsedMs)
    const targetDuration = holdNote.note.durationMs ?? 1
    const completion = Math.min(holdDuration / targetDuration, 1)
    const bonusScore = Math.floor(500 * completion)
    this.score += bonusScore
    this.updateScoreHud()

    holdNote.resolved = true
    this.tweens.add({
      targets: holdNote.body,
      alpha: 0,
      duration: 120,
      ease: 'Sine.easeOut',
      onComplete: () => holdNote.body.destroy(),
    })
  }

  private checkHoldCompletions(elapsedMs: number) {
    for (let i = 0; i < LANE_COUNT; i++) {
      const holdNote = this.holdNotes[i]
      if (!holdNote || holdNote.resolved || holdNote.holdStartMs === undefined) continue

      const holdEnd = holdNote.note.timeMs + (holdNote.note.durationMs ?? 0)
      if (elapsedMs < holdEnd) continue

      holdNote.resolved = true
      this.holdNotes[i] = null
      this.laneHeld[i] = false
      this.score += 500
      this.updateScoreHud()
      this.spawnBurst(
        this.getLaneCenterX(holdNote.note.lane, this.hitLineY),
        this.hitLineY,
        holdNote.note.lane,
      )
      this.tweens.add({
        targets: holdNote.body,
        alpha: 0,
        duration: 160,
        ease: 'Sine.easeOut',
        onComplete: () => holdNote.body.destroy(),
      })
    }
  }

  private drawHeldNote(activeNote: ActiveNote, elapsedMs: number) {
    const { note, body } = activeNote
    const laneColor = this.lanes[note.lane].color
    const holdEnd = note.timeMs + (note.durationMs ?? 0)
    const remainingMs = Math.max(0, holdEnd - elapsedMs)
    const totalMs = note.durationMs ?? 1
    const remainingRatio = remainingMs / totalMs

    const r = this.padRadius
    const trackHeight = this.hitLineY - this.spawnLineY
    const maxTail = Phaser.Math.Clamp(
      (totalMs / this.noteLeadMs) * trackHeight * 0.9,
      r * 2,
      trackHeight * 0.82,
    )
    const tailHeight = maxTail * remainingRatio
    const tailTopY = this.hitLineY - r - tailHeight
    const tailBotY = this.hitLineY - r

    body.clear()
    if (tailHeight > 4) {
      this.drawHoldTailTrapezoid(body, note.lane, tailTopY, tailBotY, laneColor, 0.65, 0.18)
    }
  }

  // Hold tail rendered as a trapezoid: top/bottom edges follow the lane perspective,
  // so the tail visually tracks the lane as it tapers toward the spawn line.
  private drawHoldTailTrapezoid(
    body: Phaser.GameObjects.Graphics,
    lane: RhythmLane,
    topY: number,
    botY: number,
    color: number,
    fillAlpha: number,
    glowAlpha: number,
  ) {
    const xTop = this.getLaneCenterX(lane, topY)
    const xBot = this.getLaneCenterX(lane, botY)
    const halfTop = this.getLaneWidthAtY(topY) * 0.26
    const halfBot = this.getLaneWidthAtY(botY) * 0.26
    const glowExpand = 5

    // outer soft glow (wider trapezoid)
    body.fillStyle(color, glowAlpha)
    body.beginPath()
    body.moveTo(xTop - halfTop - glowExpand, topY)
    body.lineTo(xTop + halfTop + glowExpand, topY)
    body.lineTo(xBot + halfBot + glowExpand, botY)
    body.lineTo(xBot - halfBot - glowExpand, botY)
    body.closePath()
    body.fillPath()

    // main fill (lane-aligned trapezoid)
    body.fillStyle(color, fillAlpha)
    body.beginPath()
    body.moveTo(xTop - halfTop, topY)
    body.lineTo(xTop + halfTop, topY)
    body.lineTo(xBot + halfBot, botY)
    body.lineTo(xBot - halfBot, botY)
    body.closePath()
    body.fillPath()

    // rim stroke
    body.lineStyle(1.5, 0xffffff, 0.4)
    body.beginPath()
    body.moveTo(xTop - halfTop, topY)
    body.lineTo(xTop + halfTop, topY)
    body.lineTo(xBot + halfBot, botY)
    body.lineTo(xBot - halfBot, botY)
    body.closePath()
    body.strokePath()
  }

  private resolveHit(
    activeNote: ActiveNote,
    label: JudgmentLabel,
    baseScore: number,
    color: string,
  ) {
    activeNote.resolved = true
    this.combo += 1
    this.maxCombo = Math.max(this.maxCombo, this.combo)
    this.score += baseScore + this.combo * 12

    if (label === 'PERFECT') {
      this.perfectCount += 1
    } else if (label === 'GREAT') {
      this.greatCount += 1
    } else {
      this.goodCount += 1
    }

    this.updateScoreHud()
    this.showJudgment(label, color)
    this.spawnBurst(
      this.getLaneCenterX(activeNote.note.lane, this.hitLineY),
      this.hitLineY,
      activeNote.note.lane,
    )
    this.tweens.add({
      targets: activeNote.body,
      alpha: 0,
      duration: 120,
      ease: 'Sine.easeOut',
      onComplete: () => activeNote.body.destroy(),
    })
  }

  private resolveMiss(activeNote: ActiveNote) {
    activeNote.resolved = true
    this.missCount += 1
    this.breakCombo()
    this.showJudgment('MISS', '#f87171')
    this.tweens.add({
      targets: activeNote.body,
      alpha: 0,
      duration: 140,
      ease: 'Sine.easeIn',
      onComplete: () => activeNote.body.destroy(),
    })
  }

  private breakCombo() {
    this.combo = 0
    this.updateScoreHud()
  }

  private flashPad(lane: RhythmLane) {
    const laneView = this.lanes[lane]
    const x = this.getLaneCenterX(lane, this.hitLineY)
    this.tweens.killTweensOf(laneView.pad)
    this.drawPad(laneView.pad, x, this.hitLineY, this.padRadius, laneView.color, 1)
    this.time.delayedCall(140, () => {
      if (!laneView.pad.active) return
      this.drawPad(laneView.pad, x, this.hitLineY, this.padRadius, laneView.color, 0.65)
    })
  }

  private spawnBurst(x: number, y: number, lane: RhythmLane) {
    const color = this.lanes[lane].color
    for (let index = 0; index < 10; index += 1) {
      const angle = (Math.PI * 2 * index) / 10
      const sparkle = this.add
        .rectangle(x, y, Phaser.Math.Between(5, 10), Phaser.Math.Between(5, 10), color, 0.9)
        .setDepth(42)
        .setScrollFactor(0)
      this.tweens.add({
        targets: sparkle,
        x: x + Math.cos(angle) * Phaser.Math.Between(30, 62),
        y: y + Math.sin(angle) * Phaser.Math.Between(22, 46),
        alpha: 0,
        scale: 0.28,
        duration: 260,
        ease: 'Sine.easeOut',
        onComplete: () => sparkle.destroy(),
      })
    }
  }

  private showJudgment(label: string, color: string) {
    this.tweens.killTweensOf(this.judgmentText)
    this.judgmentText
      .setText(label)
      .setColor(color)
      .setAlpha(1)
      .setScale(0.96)
      .setY(this.scale.height * 0.29)

    this.tweens.add({
      targets: this.judgmentText,
      y: this.scale.height * 0.25,
      alpha: 0,
      scale: 1.05,
      duration: 420,
      ease: 'Sine.easeOut',
    })
  }

  private updateScoreHud() {
    this.scoreText.setText(this.score.toLocaleString('ko-KR'))
    this.comboText.setText(`${this.combo}`)
  }

  private updateProgress(elapsedMs: number) {
    const x = this.progressFill.getData('x') as number
    const y = this.progressFill.getData('y') as number
    const width = this.progressFill.getData('width') as number
    const height = this.progressFill.getData('height') as number
    const progress = Phaser.Math.Clamp(elapsedMs / this.chart.durationMs, 0, 1)

    this.progressFill.clear()
    this.progressFill.fillStyle(0xffd166, 0.96)
    this.progressFill.fillRoundedRect(x, y, width * progress, height, height / 2)
  }

  private getLastNoteEndMs() {
    const lastNote = this.chart.notes[this.chart.notes.length - 1]
    if (!lastNote) {
      return 0
    }

    return lastNote.timeMs + (lastNote.durationMs ?? 0)
  }

  private getSongTimeMs() {
    if (this.youtubePlayer) {
      const ytMs = this.youtubePlayer.getCurrentTimeMs()
      if (ytMs > 0) return ytMs
      // Fall back to game clock while YouTube is buffering
      return this.time.now - this.startTimeMs
    }

    const seekSeconds = this.music?.seek
    if (typeof seekSeconds === 'number' && seekSeconds >= 0) {
      return seekSeconds * 1_000
    }

    return this.time.now - this.startTimeMs
  }

  private finishRound() {
    if (this.isFinished) {
      return
    }

    this.isFinished = true
    const playedDurationMs = Math.round(this.getSongTimeMs())
    this.resolvePendingNotesAsMisses()
    this.updateProgress(this.chart.durationMs)
    this.stopMusic()
    this.showResultOverlay()
    void this.finalizeAndSubmit(playedDurationMs)
  }

  private async finalizeAndSubmit(playedDurationMs: number) {
    // YouTube charts are not persisted to the backend (no server-side chart record)
    if (this.chart.youtubeVideoId) return

    const baseRequest: MusicResultRequest = {
      chartId: this.chart.id,
      score: this.score,
      maxCombo: this.maxCombo,
      perfectCount: this.perfectCount,
      greatCount: this.greatCount,
      goodCount: this.goodCount,
      missCount: this.missCount,
      totalNotes: this.chart.notes.length,
      playedDurationMs,
    }

    const handle = this.recorder
    this.recorder = null

    if (!handle) {
      await saveMusicResult(baseRequest).catch(err => {
        console.warn('[MusicRhythmScene] saveMusicResult failed', err)
      })
      return
    }

    try {
      const rec = await handle.stop()
      const presigned = await requestPresignedUploadUrls({
        videoContentType: rec.videoMimeType,
        thumbContentType: rec.thumbMimeType,
      })
      const { video, thumb } = presigned.data
      await Promise.all([
        uploadToPresignedUrl(video, rec.videoBlob),
        uploadToPresignedUrl(thumb, rec.thumbBlob),
      ])
      await saveMusicResult({
        ...baseRequest,
        videoKey: video.key,
        thumbKey: thumb.key,
      })
    } catch (err) {
      console.warn('[MusicRhythmScene] upload+save failed, retrying without video', err)
      await saveMusicResult(baseRequest).catch(saveErr => {
        console.warn('[MusicRhythmScene] saveMusicResult fallback failed', saveErr)
      })
    }
  }

  private resolvePendingNotesAsMisses() {
    let misses = 0

    this.activeNotes.forEach(activeNote => {
      if (!activeNote.resolved) {
        misses += 1
      }
      activeNote.resolved = true
      if (activeNote.body.active) {
        activeNote.body.destroy()
      }
    })
    this.activeNotes = []

    const unspawnedNotes = this.chart.notes.length - this.nextNoteIndex
    if (unspawnedNotes > 0) {
      misses += unspawnedNotes
      this.nextNoteIndex = this.chart.notes.length
    }

    this.holdNotes = [null, null, null, null]
    this.laneHeld = [false, false, false, false]

    if (misses > 0) {
      this.missCount += misses
      this.combo = 0
      this.updateScoreHud()
    }
  }

  private showResultOverlay() {
    const { width: vw, height: vh } = this.scale

    // softer dim — keeps the playfield visible behind, lighter mood overall
    const dim = this.add.rectangle(0, 0, vw, vh, 0x2a2350, 0.5).setOrigin(0.5)

    // pick a celebratory message tier from accuracy (still varied, but no visible rank)
    const totalNotes = this.perfectCount + this.greatCount + this.goodCount + this.missCount
    const accuracy =
      totalNotes > 0
        ? (this.perfectCount + this.greatCount * 0.85 + this.goodCount * 0.6) / totalNotes
        : 0
    const tier =
      accuracy >= 0.95 ? 0 : accuracy >= 0.85 ? 1 : accuracy >= 0.7 ? 2 : accuracy >= 0.5 ? 3 : 4

    const kickerMessage = [
      '최고예요!',
      '정말 잘했어요!',
      '잘했어요!',
      '수고했어요!',
      '조금만 더 연습해요!',
    ][tier]
    const accentHex = ['#ffd97d', '#b6f0c8', '#a7e5ff', '#ffc49b', '#ffadad'][tier]
    const accentNum = Phaser.Display.Color.HexStringToColor(accentHex).color

    // ── card panel: bigger, brighter shade so the screen feels lighter ──
    const panelW = Phaser.Math.Clamp(vw * 0.48, 460, 600)
    const panelH = Phaser.Math.Clamp(vh * 0.62, 460, 560)
    const panel = this.drawGlowingPanel(panelW, panelH, accentNum, {
      surfaceColor: 0x3a3168,
      surfaceAlpha: 0.92,
    })
    void kickerMessage // tier still drives accent color; message no longer rendered

    // ── HERO: SCORE (label + big value) ──
    const scoreLabelY = -panelH / 2 + 88
    const scoreLabel = this.add
      .text(0, scoreLabelY, 'SCORE', {
        fontFamily: FONT_FAMILY,
        fontSize: '14px',
        fontStyle: '700',
        color: accentHex,
      })
      .setOrigin(0.5)
      .setLetterSpacing(4)

    const scoreValueY = scoreLabelY + 64
    const scoreValue = this.add
      .text(0, scoreValueY, this.score.toLocaleString('ko-KR'), {
        fontFamily: GAME_FONT,
        fontSize: `${Phaser.Math.Clamp(vh * 0.075, 48, 68)}px`,
        color: '#fff8f0',
      })
      .setOrigin(0.5)
      .setShadow(0, 4, '#000000', 12, false, true)

    // soft pastel underline below score
    const underline = this.add.graphics()
    const ulW = 90
    underline.fillStyle(accentNum, 0.7)
    underline.fillRoundedRect(-ulW / 2, scoreValueY + 50, ulW, 3, 2)

    // ── 5 stat chips with rounded backgrounds ──
    const colStats = [
      { label: '콤보', value: `${this.maxCombo}`, color: 0xc4b5fd, hex: '#c4b5fd' },
      { label: '퍼펙트', value: `${this.perfectCount}`, color: 0xfff4a8, hex: '#fff4a8' },
      { label: '그레이트', value: `${this.greatCount}`, color: 0xa7e5ff, hex: '#a7e5ff' },
      { label: '굿', value: `${this.goodCount}`, color: 0xb6f0c8, hex: '#b6f0c8' },
      { label: '미스', value: `${this.missCount}`, color: 0xffadad, hex: '#ffadad' },
    ]
    const chipW = 76
    const chipH = 64
    const chipGap = 12
    const totalW = colStats.length * chipW + (colStats.length - 1) * chipGap
    const startX = -totalW / 2 + chipW / 2
    const colY = scoreValueY + 130
    const colNodes: Phaser.GameObjects.GameObject[] = []
    colStats.forEach((s, i) => {
      const cx = startX + i * (chipW + chipGap)
      const chipBg = this.add.graphics()
      chipBg.fillStyle(s.color, 0.16)
      chipBg.fillRoundedRect(cx - chipW / 2, colY - chipH / 2, chipW, chipH, 12)
      chipBg.lineStyle(1, s.color, 0.5)
      chipBg.strokeRoundedRect(cx - chipW / 2, colY - chipH / 2, chipW, chipH, 12)
      const value = this.add
        .text(cx, colY - 9, s.value, {
          fontFamily: GAME_FONT,
          fontSize: '22px',
          color: s.hex,
        })
        .setOrigin(0.5)
        .setShadow(0, 2, '#000000', 4, false, true)
      const label = this.add
        .text(cx, colY + 18, s.label, {
          fontFamily: FONT_FAMILY,
          fontSize: '12px',
          fontStyle: '700',
          color: '#cfc7e0',
        })
        .setOrigin(0.5)
      colNodes.push(chipBg, value, label)
    })

    // ── action buttons — pushed further apart so they breathe ──
    const btnY = panelH / 2 - 56
    const retry = this.makePillButton(-110, btnY, 180, 48, '다시하기', 0xffb6d9, () =>
      this.restartRound(),
    )
    const exit = this.makePillButton(110, btnY, 180, 48, '돌아가기', 0xa7e5ff, () =>
      this.returnToMusicSelect(),
    )

    const container = this.add
      .container(vw / 2, vh / 2, [
        dim,
        panel,
        scoreLabel,
        scoreValue,
        underline,
        ...colNodes,
        retry,
        exit,
      ])
      .setDepth(70)
      .setScrollFactor(0)

    // gentle pulse on the score
    this.tweens.add({
      targets: scoreValue,
      scale: 1.03,
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })

    // gentle entrance — fade + slight rise
    container.setAlpha(0)
    container.y = vh / 2 + 12
    this.tweens.add({
      targets: container,
      alpha: 1,
      y: vh / 2,
      duration: 320,
      ease: 'Sine.easeOut',
    })
  }

  private makePillButton(
    x: number,
    y: number,
    width: number,
    height: number,
    label: string,
    color: number,
    onClick: () => void,
  ) {
    const container = this.add.container(x, y)
    const bg = this.add.graphics()
    const text = this.add
      .text(0, 0, label, {
        fontFamily: FONT_FAMILY,
        fontSize: '16px',
        fontStyle: '700',
        color: '#2a1f3d',
      })
      .setOrigin(0.5)

    const draw = (hovered: boolean) => {
      bg.clear()
      // soft outer glow always
      for (let g = 0; g < (hovered ? 8 : 5); g++) {
        bg.fillStyle(color, hovered ? 0.035 : 0.022)
        bg.fillRoundedRect(
          -width / 2 - 6 + g,
          -height / 2 - 6 + g,
          width + 12 - g * 2,
          height + 12 - g * 2,
          height / 2 + 6,
        )
      }
      // solid filled button
      bg.fillStyle(color, hovered ? 1 : 0.92)
      bg.fillRoundedRect(-width / 2, -height / 2, width, height, height / 2)
      // top inner highlight (subtle gloss)
      bg.fillStyle(0xffffff, hovered ? 0.18 : 0.14)
      bg.fillRoundedRect(-width / 2 + 3, -height / 2 + 3, width - 6, height / 2, height / 2)
      // crisp border
      bg.lineStyle(1.5, 0xffffff, hovered ? 0.95 : 0.7)
      bg.strokeRoundedRect(-width / 2, -height / 2, width, height, height / 2)
    }
    draw(false)

    const zone = this.add.zone(0, 0, width, height).setInteractive({ cursor: 'pointer' })
    zone.on('pointerover', () => draw(true))
    zone.on('pointerout', () => draw(false))
    zone.on('pointerdown', onClick)

    container.add([bg, text, zone])
    return container
  }

  private getTrackProgressAtY(y: number) {
    return Phaser.Math.Clamp((y - this.spawnLineY) / (this.hitLineY - this.spawnLineY), 0, 1)
  }

  private getStageWidthAtY(y: number) {
    const progress = this.getTrackProgressAtY(y)
    const easedProgress = Math.pow(progress, 1.15)
    return Phaser.Math.Linear(this.playTopWidth, this.playWidth, easedProgress)
  }

  private getLaneBoundaryX(boundary: number, y: number) {
    const width = this.getStageWidthAtY(y)
    return this.stageCenterX - width / 2 + (width / LANE_COUNT) * boundary
  }

  private getLaneCenterX(lane: RhythmLane, y: number) {
    return (this.getLaneBoundaryX(lane, y) + this.getLaneBoundaryX(lane + 1, y)) / 2
  }

  private getLaneWidthAtY(y: number) {
    return this.getStageWidthAtY(y) / LANE_COUNT
  }

  private restartRound() {
    if (this.isLeaving) {
      return
    }

    this.stopMusic()
    this.cancelRecording()
    this.scene.restart({ chartId: this.chartId } satisfies MusicRhythmSceneData)
  }

  private returnToMusicSelect() {
    if (this.isLeaving) {
      return
    }

    this.isLeaving = true
    this.stopMusic()
    this.cancelRecording()
    fadeToScene(this, 'MusicSongSelectScene', { duration: 220 })
  }

  private cancelRecording() {
    const handle = this.recorder
    if (!handle) return
    this.recorder = null
    handle.cancel()
  }

  private stopMusic() {
    if (this.youtubePlayer) {
      this.youtubePlayer.stop()
      this.youtubePlayer.destroy()
      this.youtubePlayer = null
    }
    this.music?.stop()
    this.music?.destroy()
    this.music = null
  }
}
