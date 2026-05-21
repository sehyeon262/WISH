import Phaser from 'phaser'
import { playSceneBgm } from '@/game/systems/sceneBgm'
import {
  createArtwork,
  getQuizRoom,
  leaveQuizRoom,
  type PromptAssignment,
  type QuizMember,
  type QuizRoomSnapshot,
  type QuizStrokeMessage,
} from '@wish/api-client'
import { QuizRealtimeClient, type QuizRoomEvent } from '@/features/quiz-realtime'
import { assetPath } from '@/game/assets/assetPath'
import { fadeToScene } from '@/game/systems/sceneTransition'
import { addCoverBackground } from '@/game/world/background'

const FONT_FAMILY =
  '"Pretendard Variable", Pretendard, "Noto Sans KR", -apple-system, BlinkMacSystemFont, sans-serif'

// 톤: 어두운 네이비 → 밝은 미드네이비로 통일. 캔버스 우드 프레임(BOARD_FRAME) 과 어우러지게.
const PANEL_BG = 0x445d83
const PANEL_BORDER = 0x91a5c4
const CANVAS_BG = 0xfdfdfb
const CANVAS_BORDER = 0x8a5a2f
const BOARD_FRAME = 0xd7a158
const BOARD_FRAME_DARK = 0x8f592a
const PAPER_SHADOW = 0xcbbda5
const SLOT_BG = 0x5b7398
const SLOT_BG_ACTIVE = 0xf4b35f
const SLOT_BG_EMPTY = 0x435a7d
const TOOLBAR_BG = 0x3d557d
const CHIP_BG = 0xffe9c2
const STROKE_THROTTLE_MS = 60
const MIN_VISIBLE_PLAYER_SLOTS = 6
/** 추측 말풍선 표시 시간 — 정답/오답 동일. 너무 길면 화면 혼잡, 너무 짧으면 못 봄. */
const BUBBLE_TTL_MS = 3200

/**
 * 라운드 길이 (ms) — BE 의 `quiz.realtime.round-duration-seconds` 와 동기화. 60s.
 * 글자수 reveal 타이밍 계산에 사용. BE 설정이 바뀌면 같이 손봐야 함.
 */
const ROUND_DURATION_MS = 60_000

/**
 * 글자수 힌트가 추측자에게 노출되기까지 라운드 시작 후 대기하는 시간. 라운드 중반부 이후에만
 * 표시되도록 30s 로 둠. 너무 빠르면 힌트가 강해서 그림을 안 보게 되고, 너무 늦으면 무쓸모.
 */
const WORD_LENGTH_REVEAL_MS = 30_000

/**
 * 플레이어 슬롯 아바타 — themes/art/ui/char1~9.png 의 상반신만 setCrop 으로 잘라 노출.
 * roomId + joinOrder 기준으로 방마다 섞인 순서를 만들되, 모든 클라이언트가 같은 캐릭터를 보도록 고정 매핑한다.
 */
const SLOT_CHAR_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const
/** 이미지 상단에서 얼마만큼 잘라 상반신만 보일지 — 헤더/머리/어깨까지 포함. */
const SLOT_CHAR_CROP_RATIO = 0.55
const SLOT_CHAR_STEPS = [1, 2, 4, 5, 7, 8] as const

function slotCharKey(charNumber: number): string {
  return `quiz-avatar-char${charNumber}`
}

function slotCharPath(charNumber: number): string {
  return `images/themes/art/ui/char${charNumber}.png`
}

function hashString(value: string): number {
  let hash = 2166136261
  for (let i = 0; i < value.length; i++) {
    hash = Math.imul(hash ^ value.charCodeAt(i), 16777619)
  }
  return hash >>> 0
}

function slotCharNumber(joinOrder: number, roomId: string): number {
  const seed = hashString(roomId || 'quiz-room')
  const normalizedOrder = Math.max(0, Math.trunc(joinOrder))
  const step = SLOT_CHAR_STEPS[(seed >>> 8) % SLOT_CHAR_STEPS.length]
  const index = (seed + normalizedOrder * step) % SLOT_CHAR_NUMBERS.length
  return SLOT_CHAR_NUMBERS[index]
}

function slotCharKeyForMember(joinOrder: number, roomId: string): string {
  return slotCharKey(slotCharNumber(joinOrder, roomId))
}

function slotIndicesForSide(maxPlayers: number, side: 'left' | 'right'): number[] {
  const start = side === 'left' ? 0 : 1
  const indices: number[] = []
  for (let i = start; i < maxPlayers; i += 2) {
    indices.push(i)
  }
  return indices
}

// 검정을 맨 앞에 둬서 기본 펜 색으로 사용. 그림 그릴 때 가장 흔하게 쓰는 색.
const BRUSH_COLORS = [
  { label: '검정', color: '#1a1a1a', value: 0x1a1a1a },
  { label: '빨강', color: '#ff4d4d', value: 0xff4d4d },
  { label: '주황', color: '#ffa64a', value: 0xffa64a },
  { label: '노랑', color: '#ffd84a', value: 0xffd84a },
  { label: '초록', color: '#5cc26b', value: 0x5cc26b },
  { label: '파랑', color: '#4a90e2', value: 0x4a90e2 },
] as const

type Point = { x: number; y: number }
type DrawSegment = {
  from: Point
  to: Point
  color: string
  size: number
  eraser: boolean
}
type Tool = 'brush' | 'eraser'

export interface QuizPlaySceneInit {
  snapshot: QuizRoomSnapshot
  currentUserId: number | null
  prompt: PromptAssignment | null
  wordLength: number | null
  realtimeClient: QuizRealtimeClient | null
}

export class QuizPlayScene extends Phaser.Scene {
  private snapshot!: QuizRoomSnapshot
  private currentUserId: number | null = null
  private prompt: PromptAssignment | null = null
  private wordLength: number | null = null
  private realtimeClient: QuizRealtimeClient | null = null

  private root!: Phaser.GameObjects.Container
  private backdrop: Phaser.GameObjects.Rectangle | null = null
  private layoutContainer: Phaser.GameObjects.Container | null = null
  private drawingGraphics: Phaser.GameObjects.Graphics | null = null
  private timerText: Phaser.GameObjects.Text | null = null
  private timerEvent: Phaser.Time.TimerEvent | null = null

  /**
   * 추측자에게 글자수 힌트를 30s 후에야 노출하기 위한 reveal 상태. true 가 되면 drawLayout 에서
   * '○글자' 가 표시되고, 그 전엔 '그림을 맞춰봐!' 로 가린다.
   */
  private wordLengthRevealed = false
  private wordLengthRevealTimer: Phaser.Time.TimerEvent | null = null

  private canvasBounds = new Phaser.Geom.Rectangle()
  private strokes: DrawSegment[] = []
  private remoteLastPoints = new Map<string, Point>()
  private activePointerId: number | null = null
  private activeStrokeId: string | null = null
  private activeLastPoint: Point | null = null
  private lastStrokeSendAt = 0

  private brushColor: string = BRUSH_COLORS[0].color
  private selectedTool: Tool = 'brush'
  private brushSize = 6
  private guessOverlayOpen = false
  /**
   * 추측 메시지를 슬롯 옆 말풍선으로 잠깐 띄우기 위한 상태. userId → 말풍선 데이터.
   * BUBBLE_TTL_MS 가 지나면 timer 가 청소.
   */
  private activeBubbles = new Map<number, { text: string; correct: boolean; expiresAt: number }>()
  private roundEnded = false
  /** 정답 공개 배너 — round_ended 도착 시 화면 중앙에 제시어를 크게 띄운다. */
  private answerBanner: Phaser.GameObjects.Container | null = null
  /**
   * 라운드 타임아웃 후 BE 가 round_ended/game_finished 를 못 보냈을 때를 대비한 reconcile.
   * 타이머가 0 이 된 시각 + 마지막 시도 시각 을 기억해 4초마다 1회씩 REST 로 룸 상태를 끌어와
   * 적용. BE 스케줄 silent fail / WS 일시 단절로 굳어버린 화면을 자가 복구.
   */
  private timerExpiredAt: number | null = null
  private roundEndedAt: number | null = null
  private lastReconcileAt = 0
  private reconcileInFlight = false
  private finalMembers: QuizMember[] | null = null
  private isLeaving = false

  /**
   * 출제자(drawer) 본인이 그린 라운드의 PNG 를 라운드 종료 시 자기 앨범에 자동 저장.
   * usedColors: 지우개 제외 — 색상 카운트용. drawerRoundStartedAt: 플레이 시간 산출용.
   * savedRoundNumber: round_ended → game_finished 가 연달아 와도 같은 라운드를 두 번 저장하지 않도록 가드.
   */
  private usedColors = new Set<string>()
  private drawerRoundStartedAt: number | null = null
  private savedRoundNumber: number | null = null

  constructor() {
    super('QuizPlayScene')
  }

  init(data: Partial<QuizPlaySceneInit>) {
    if (!data.snapshot) {
      throw new Error('QuizPlayScene requires snapshot via init data')
    }
    this.snapshot = data.snapshot
    this.currentUserId = data.currentUserId ?? null
    this.prompt = data.prompt ?? null
    this.wordLength = data.wordLength ?? data.prompt?.word.length ?? null
    this.realtimeClient = data.realtimeClient ?? null
    // Phaser Scene 인스턴스는 scene.start 마다 재사용되어 클래스 필드가 살아남는다.
    // 이전 게임의 strokes / 결과 모달 / 라운드 종료 플래그 등이 그대로 남아 새 게임
    // 캔버스에 옛 선이 그려지거나 결과 모달이 튀어나오던 버그. init 에서 일괄 리셋.
    this.strokes = []
    this.remoteLastPoints.clear()
    this.activeBubbles.clear()
    this.activePointerId = null
    this.activeStrokeId = null
    this.activeLastPoint = null
    this.lastStrokeSendAt = 0
    this.roundEnded = false
    this.finalMembers = null
    this.isLeaving = false
    this.guessOverlayOpen = false
    this.answerBanner?.destroy()
    this.answerBanner = null
    this.timerExpiredAt = null
    this.roundEndedAt = null
    this.lastReconcileAt = 0
    this.reconcileInFlight = false
    this.brushColor = BRUSH_COLORS[0].color
    this.selectedTool = 'brush'
    this.brushSize = 6
    this.wordLengthRevealed = false
    this.wordLengthRevealTimer = null
    this.usedColors.clear()
    this.drawerRoundStartedAt = null
    this.savedRoundNumber = null
  }

  preload() {
    if (!this.textures.exists('art-room-background')) {
      this.load.image(
        'art-room-background',
        assetPath('images/themes/art/background/background.png'),
      )
    }
    // 슬롯 아바타 — char1~4 (art/ui) 를 미리 로드. setCrop 으로 상반신만 노출.
    SLOT_CHAR_NUMBERS.forEach(charNumber => {
      const key = slotCharKey(charNumber)
      if (!this.textures.exists(key)) {
        this.load.image(key, assetPath(slotCharPath(charNumber)))
      }
    })
  }

  create() {
    playSceneBgm(this)
    addCoverBackground(this, 'art-room-background')
    this.backdrop = this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x0b1020, 0.58)
      .setOrigin(0)
      .setDepth(0)
    this.root = this.add.container(0, 0).setDepth(1)

    this.realtimeClient?.setHandlers({
      onSnapshot: snapshot => {
        this.snapshot = snapshot
        this.drawLayout()
      },
      onPrompt: prompt => {
        this.prompt = prompt
        this.wordLength = prompt.word.length
        this.drawLayout()
      },
      onEvent: event => this.handleRealtimeEvent(event),
      onError: error => console.warn('[quiz-realtime]', friendlyWsError(error.message)),
    })

    this.scale.on('resize', this.layout, this)
    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.handlePointerDown, this)
    this.input.on(Phaser.Input.Events.POINTER_MOVE, this.handlePointerMove, this)
    this.input.on(Phaser.Input.Events.POINTER_UP, this.handlePointerUp, this)
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.handlePointerUp, this)
    // 정답 입력은 HTML 오버레이가 담당 — Phaser 키 입력은 한글 IME 처리 불가라 우회 (S14P31E103-820).
    // 나가기도 같은 오버레이 안에 두어 input focus 와 Phaser 클릭이 첫 탭에서 꼬이는 문제 해결.
    this.game.events.on('quiz-guess:submit', this.handleGuessOverlaySubmit, this)
    this.game.events.on('quiz-guess:leave', this.handleLeave, this)
    this.input.keyboard?.on('keydown-ESC', this.handleEscKey, this)
    this.events.once('shutdown', this.handleShutdown, this)

    // 진입 시점에 이미 라운드가 진행 중이고 본인이 정답자라면 오버레이 즉시 노출.
    if (this.snapshot.status === 'PLAYING' && !this.isDrawer()) {
      this.setGuessOverlay(true)
    }
    // 재진입(이미 PLAYING) 시에도 출제자라면 라운드 시작 시각을 역산해 두기. round_started 를
    // 받지 못한 상태에서 round_ended 가 와도 playDurationSeconds 를 그럴듯하게 계산하도록.
    if (this.snapshot.status === 'PLAYING' && this.isDrawer()) {
      this.drawerRoundStartedAt = this.snapshot.roundEndsAtEpochMillis
        ? this.snapshot.roundEndsAtEpochMillis - ROUND_DURATION_MS
        : Date.now()
    }
    // 재진입(스냅샷이 PLAYING 인 상태로 시작) 시에도 글자수 reveal 타이밍을 맞춤. 이미 30s
    // 지났으면 즉시 노출 / 아니면 남은 만큼 지연.
    if (this.snapshot.status === 'PLAYING') {
      this.scheduleWordLengthReveal(this.snapshot.roundEndsAtEpochMillis)
    }
    this.timerEvent = this.time.addEvent({
      delay: 250,
      loop: true,
      callback: () => this.updateTimerText(),
    })

    this.drawLayout()
  }

  private layout() {
    this.backdrop?.setSize(this.scale.width, this.scale.height)
    this.drawLayout()
  }

  private drawLayout() {
    this.layoutContainer?.destroy()
    const container = this.add.container(0, 0)
    this.root.add(container)
    this.layoutContainer = container

    const w = this.scale.width
    const h = this.scale.height
    const padding = 18
    const sidebarW = Math.max(148, Math.min(178, w * 0.13))
    const topBarH = 74
    const bottomBarH = Math.max(126, h * 0.18)
    const canvasAreaTop = padding + topBarH + padding
    const canvasAreaBottom = h - padding - bottomBarH - padding
    const canvasAreaH = canvasAreaBottom - canvasAreaTop
    const maxPlayerSlots = Math.max(
      MIN_VISIBLE_PLAYER_SLOTS,
      this.snapshot.maxPlayers,
      this.snapshot.members.length,
    )

    // 캔버스/하단 도구바 먼저 그리고, 슬롯(=말풍선 포함) 을 나중에 그려 z-order 우위 확보.
    // 게스트가 보낸 추측 말풍선은 슬롯 옆으로 펼쳐져 캔버스 영역과 겹치는데, 슬롯이 캔버스보다
    // 먼저 add 되면 캔버스가 위에 덮어 말풍선이 가려진다.
    const canvasX = padding + sidebarW + padding
    const canvasW = w - padding - sidebarW - padding - padding - sidebarW - padding
    this.drawCanvasArea(container, canvasX, canvasAreaTop, canvasW, canvasAreaH)
    this.drawBottomBar(container, padding, h - padding - bottomBarH, w - padding * 2, bottomBarH)
    this.drawTopBar(container, padding, padding, w - padding * 2, topBarH)
    this.drawSidebar(
      container,
      padding,
      canvasAreaTop,
      sidebarW,
      canvasAreaH,
      slotIndicesForSide(maxPlayerSlots, 'left'),
      'left',
    )
    this.drawSidebar(
      container,
      w - padding - sidebarW,
      canvasAreaTop,
      sidebarW,
      canvasAreaH,
      slotIndicesForSide(maxPlayerSlots, 'right'),
      'right',
    )

    // 우상단 닫기 버튼 — 게임 도중 명시적으로 나가기. ESC 키와 동등.
    // drawer 의 "나가기" 버튼은 하단 도구바에만 있고 추측자는 HTML 오버레이 안에만 있어서, 어느
    // 역할이든 항상 보이는 공통 닫기 진입점이 필요해서 우상단에 둠.
    container.add(this.createCloseButton(w - 28, 28, () => void this.handleLeave()))

    if (this.finalMembers) {
      this.drawResultModal(container)
    }
  }

  /** 우상단 ✕ 버튼 — 모달 close 패턴. 빨강 톤으로 종료 신호. */
  private createCloseButton(cx: number, cy: number, onClick: () => void) {
    const container = this.add.container(cx, cy)
    const size = 36
    const radius = 8

    const hit = this.add.rectangle(0, 0, size + 4, size + 4, 0xffffff, 0.001)
    hit.setInteractive({ useHandCursor: true })

    const g = this.add.graphics()
    const draw = (hovered: boolean) => {
      g.clear()
      g.fillStyle(0x000000, 0.18)
      g.fillRoundedRect(-size / 2 + 1, -size / 2 + 2, size, size, radius)
      g.fillStyle(0xc98477, hovered ? 1 : 0.92)
      g.fillRoundedRect(-size / 2, -size / 2, size, size, radius)
      g.lineStyle(1.5, 0xffffff, hovered ? 1 : 0.85)
      g.strokeRoundedRect(-size / 2, -size / 2, size, size, radius)
    }
    draw(false)

    const x = this.add
      .text(0, 1, '✕', {
        fontFamily: FONT_FAMILY,
        fontSize: '18px',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
    container.add([hit, g, x])

    hit.on(Phaser.Input.Events.POINTER_OVER, () => draw(true))
    hit.on(Phaser.Input.Events.POINTER_OUT, () => draw(false))
    hit.on(Phaser.Input.Events.POINTER_DOWN, onClick)
    return container
  }

  private drawTopBar(
    container: Phaser.GameObjects.Container,
    x: number,
    y: number,
    w: number,
    h: number,
  ) {
    const panel = this.add.graphics()
    panel.fillStyle(0x060914, 0.2)
    panel.fillRoundedRect(x + 4, y + 5, w - 8, h, 18)
    panel.fillStyle(PANEL_BG, 0.96)
    panel.fillRoundedRect(x, y, w, h, 18)
    panel.fillStyle(0x34435f, 0.38)
    panel.fillRoundedRect(x + 8, y + 8, w - 16, h / 2 - 2, 14)
    panel.lineStyle(3, PANEL_BORDER, 0.95)
    panel.strokeRoundedRect(x, y, w, h, 18)
    container.add(panel)

    const drawer = this.snapshot.members.find(m => m.userId === this.snapshot.currentDrawerUserId)
    const roundChip = this.add.graphics()
    roundChip.fillStyle(0xffd36b, 1)
    roundChip.fillRoundedRect(x + 18, y + 13, 132, h - 26, 18)
    roundChip.lineStyle(3, 0x9a5f21, 1)
    roundChip.strokeRoundedRect(x + 18, y + 13, 132, h - 26, 18)
    container.add(roundChip)
    container.add(
      this.add
        .text(x + 84, y + h / 2 - 1, `ROUND ${this.snapshot.roundNumber}`, {
          fontFamily: FONT_FAMILY,
          fontSize: '17px',
          color: '#4a2f16',
          fontStyle: 'bold',
        })
        .setOrigin(0.5),
    )

    const turnLabel = this.add
      .text(x + 168, y + h / 2 - 8, `출제자 ${drawer?.nickname ?? '대기'}`, {
        fontFamily: FONT_FAMILY,
        fontSize: '16px',
        color: '#ffe9c2',
        fontStyle: 'bold',
      })
      .setOrigin(0, 0.5)
    container.add(turnLabel)

    const promptW = Math.min(420, w * 0.36)
    const promptLeft = x + w / 2 - promptW / 2
    const pipStart = x + 170
    const pipAvailableW = Math.max(72, promptLeft - pipStart - 16)
    const pipGap =
      this.snapshot.totalRounds > 1
        ? Math.max(7, Math.min(18, pipAvailableW / (this.snapshot.totalRounds - 1)))
        : 18
    const pipRadius = Math.max(3, Math.min(5, pipGap * 0.32))
    for (let i = 0; i < this.snapshot.totalRounds; i++) {
      const active = i + 1 <= this.snapshot.roundNumber
      const pip = this.add.circle(
        pipStart + i * pipGap,
        y + h - 17,
        pipRadius,
        active ? 0xffd36b : 0x5b6680,
        1,
      )
      pip.setStrokeStyle(1, active ? 0xfff3c4 : 0x2d374e, 1)
      container.add(pip)
    }

    // 추측자에겐 글자수가 강한 힌트라 라운드 시작 직후엔 가려두고, 30s 후에 reveal.
    // 그 전엔 안내 문구만 노출. drawer 자신은 어차피 제시어를 알아 영향 없음.
    const promptText = this.isDrawer()
      ? this.prompt?.word
        ? `제시어: ${this.prompt.word}`
        : '제시어 확인 중'
      : this.wordLength && this.wordLengthRevealed
        ? `${this.wordLength}글자`
        : '그림을 맞춰봐!'
    const promptBg = this.add.graphics()
    promptBg.fillStyle(0x121a2b, 1)
    promptBg.fillRoundedRect(x + w / 2 - promptW / 2, y + 10, promptW, h - 20, 20)
    promptBg.lineStyle(2, 0xffe9c2, 0.9)
    promptBg.strokeRoundedRect(x + w / 2 - promptW / 2, y + 10, promptW, h - 20, 20)
    container.add(promptBg)
    const promptLabel = this.add
      .text(x + w / 2, y + h / 2, promptText, {
        fontFamily: FONT_FAMILY,
        fontSize: this.isDrawer() ? '22px' : '21px',
        color: this.isDrawer() ? '#ffd36b' : '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
    container.add(promptLabel)

    const timerBg = this.add.graphics()
    timerBg.fillStyle(0x0f1626, 1)
    timerBg.fillRoundedRect(x + w - 138, y + 13, 118, h - 26, 18)
    timerBg.lineStyle(2, 0xffe9c2, 0.9)
    timerBg.strokeRoundedRect(x + w - 138, y + 13, 118, h - 26, 18)
    container.add(timerBg)
    this.timerText = this.add
      .text(x + w - 79, y + h / 2, '', {
        fontFamily: FONT_FAMILY,
        fontSize: '20px',
        color: '#ffe9c2',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
    container.add(this.timerText)
    this.updateTimerText()
  }

  private drawSidebar(
    container: Phaser.GameObjects.Container,
    x: number,
    y: number,
    w: number,
    h: number,
    slotIndices: number[],
    side: 'left' | 'right',
  ) {
    const gap = 12
    const slotH = (h - gap * (slotIndices.length - 1)) / slotIndices.length
    slotIndices.forEach((index, i) => {
      this.drawPlayerSlot(container, x, y + i * (slotH + gap), w, slotH, index, side)
    })
  }

  private drawPlayerSlot(
    container: Phaser.GameObjects.Container,
    x: number,
    y: number,
    w: number,
    h: number,
    slotIndex: number,
    side: 'left' | 'right',
  ) {
    const member = this.snapshot.members[slotIndex] ?? null
    const isMyself = !!member && member.userId === this.currentUserId
    const isDrawer = !!member && member.userId === this.snapshot.currentDrawerUserId

    const panel = this.add.graphics()
    panel.fillStyle(0x050814, 0.25)
    panel.fillRoundedRect(x + 4, y + 5, w - 2, h, 18)
    panel.fillStyle(!member ? SLOT_BG_EMPTY : isDrawer ? SLOT_BG_ACTIVE : SLOT_BG, 1)
    panel.fillRoundedRect(x, y, w, h, 18)
    panel.fillStyle(0xffffff, member ? 0.08 : 0.03)
    panel.fillRoundedRect(x + 8, y + 8, w - 16, h * 0.34, 14)
    panel.lineStyle(3, isMyself ? 0xffe9c2 : isDrawer ? 0xffd36b : PANEL_BORDER, 1)
    panel.strokeRoundedRect(x, y, w, h, 18)
    container.add(panel)

    if (!member) {
      const plus = this.add.circle(x + w / 2, y + h / 2 - 18, 23, 0x26324a, 1)
      plus.setStrokeStyle(2, 0x51607a, 1)
      container.add(plus)
      container.add(
        this.add
          .text(x + w / 2, y + h / 2 - 19, `${slotIndex + 1}P`, {
            fontFamily: FONT_FAMILY,
            fontSize: '16px',
            color: '#9facc4',
            fontStyle: 'bold',
            align: 'center',
          })
          .setOrigin(0.5),
      )
      container.add(
        this.add
          .text(x + w / 2, y + h / 2 + 24, '대기 중', {
            fontFamily: FONT_FAMILY,
            fontSize: '13px',
            color: '#7d8aa3',
          })
          .setOrigin(0.5),
      )
      return
    }

    // 캐릭터(art/ui/char1~4) 의 상반신만 setCrop 으로 잘라 표시. 원형 배경/마스크 없이 그대로 노출.
    const avatarSize = Math.min(96, w * 0.7, Math.max(56, h * 0.46))
    const avatarY = y + Math.max(46, h * 0.32)
    const nameY = y + h - Math.min(58, Math.max(48, h * 0.38))
    const avatarKey = slotCharKeyForMember(member.joinOrder, this.snapshot.roomId)
    if (this.textures.exists(avatarKey)) {
      const source = this.textures.get(avatarKey).getSourceImage() as HTMLImageElement
      const srcW = source.width || 1
      const srcH = source.height || 1
      const cropH = srcH * SLOT_CHAR_CROP_RATIO
      // 잘린 상반신 영역이 avatarSize 높이를 채우도록 스케일 계산.
      const scale = avatarSize / cropH
      const npc = this.add.image(x + w / 2, avatarY, avatarKey)
      npc.setScale(scale)
      // origin y = cropRatio/2 로 잡으면 잘린 영역의 정확한 중심이 avatarY 가 됨 → 상반신이 슬롯 중앙에 정렬.
      npc.setOrigin(0.5, SLOT_CHAR_CROP_RATIO / 2)
      npc.setCrop(0, 0, srcW, cropH)
      container.add(npc)
    }
    container.add(
      this.add
        .text(x + w / 2, nameY, member.nickname, {
          fontFamily: FONT_FAMILY,
          fontSize: '16px',
          color: isDrawer ? '#1a0e05' : '#ffffff',
          fontStyle: 'bold',
          wordWrap: { width: w - 16 },
          align: 'center',
        })
        .setOrigin(0.5),
    )
    const scoreChip = this.add.graphics()
    scoreChip.fillStyle(isDrawer ? 0x4a2f16 : CHIP_BG, 1)
    scoreChip.fillRoundedRect(x + w / 2 - 42, y + h - 38, 84, 26, 13)
    scoreChip.lineStyle(1.5, isDrawer ? 0xffe9c2 : 0x6f5331, 0.9)
    scoreChip.strokeRoundedRect(x + w / 2 - 42, y + h - 38, 84, 26, 13)
    container.add(scoreChip)
    container.add(
      this.add
        .text(x + w / 2, y + h - 25, `${member.score}점`, {
          fontFamily: FONT_FAMILY,
          fontSize: '14px',
          color: isDrawer ? '#ffe9c2' : '#3a2614',
          fontStyle: 'bold',
        })
        .setOrigin(0.5),
    )
    const roleText = isDrawer ? 'DRAW' : `P${slotIndex + 1}`
    const roleColor = isDrawer ? 0x7b461a : 0x101827
    const roleBg = this.add.graphics()
    roleBg.fillStyle(isDrawer ? 0xffe9c2 : 0x44516b, 1)
    roleBg.fillRoundedRect(x + 10, y + 10, isDrawer ? 54 : 38, 24, 12)
    roleBg.lineStyle(1, roleColor, 0.8)
    roleBg.strokeRoundedRect(x + 10, y + 10, isDrawer ? 54 : 38, 24, 12)
    container.add(roleBg)
    if (isDrawer) {
      container.add(
        this.add
          .text(x + 37, y + 22, roleText, {
            fontFamily: FONT_FAMILY,
            fontSize: '12px',
            color: '#3a2614',
            fontStyle: 'bold',
          })
          .setOrigin(0.5),
      )
    } else {
      container.add(
        this.add
          .text(x + 29, y + 22, roleText, {
            fontFamily: FONT_FAMILY,
            fontSize: '12px',
            color: '#ffffff',
            fontStyle: 'bold',
          })
          .setOrigin(0.5),
      )
    }
    if (isMyself) {
      const meBg = this.add.graphics()
      meBg.fillStyle(0xffffff, 1)
      meBg.fillRoundedRect(x + w - 42, y + 10, 32, 24, 12)
      meBg.lineStyle(1, 0x7b461a, 0.8)
      meBg.strokeRoundedRect(x + w - 42, y + 10, 32, 24, 12)
      container.add(meBg)
      container.add(
        this.add
          .text(x + w - 26, y + 22, '나', {
            fontFamily: FONT_FAMILY,
            fontSize: '12px',
            color: '#1a0e05',
            fontStyle: 'bold',
          })
          .setOrigin(0.5),
      )
    }

    const bubble = this.activeBubbles.get(member.userId)
    if (bubble) {
      this.drawSpeechBubble(container, x, y, w, h, side, bubble.text, bubble.correct)
    }
  }

  /**
   * 슬롯 옆에 잠깐 떠 있는 말풍선 — pill 형태(둥근 캡슐). 좌측 슬롯은 오른쪽으로 /
   * 우측 슬롯은 왼쪽으로 띄운다.
   *
   * <p>이전엔 삼각형 포인터를 본체에 붙였는데, fillPath + strokePath 가 본체 외곽선과 만나는
   * 부분에서 두께 차이 때문에 이음매가 자연스럽지 않았다. 포인터 자체를 빼고 캡슐만 띄우는
   * 형태로 단순화 — 슬롯과의 연결은 위치만으로 충분히 읽힘.
   */
  private drawSpeechBubble(
    container: Phaser.GameObjects.Container,
    slotX: number,
    slotY: number,
    slotW: number,
    slotH: number,
    side: 'left' | 'right',
    rawText: string,
    correct: boolean,
  ) {
    const text = rawText.length > 14 ? `${rawText.slice(0, 13)}…` : rawText
    const fontSize = 18
    const paddingX = 22
    const paddingY = 12
    const tempText = this.add.text(0, 0, text, {
      fontFamily: FONT_FAMILY,
      fontSize: `${fontSize}px`,
      color: correct ? '#1a4d20' : '#1a0e05',
      fontStyle: 'bold',
    })
    const tw = tempText.width
    const th = tempText.height
    tempText.destroy()

    const bw = Math.max(tw + paddingX * 2, 80)
    const bh = th + paddingY * 2
    const radius = bh / 2 // pill = 캡슐
    const gap = 14
    const cy = slotY + Math.max(54, slotH * 0.34)
    const bx = side === 'left' ? slotX + slotW + gap : slotX - gap - bw
    const by = cy - bh / 2

    const fillColor = correct ? 0xdcf6c4 : 0xffffff
    const borderColor = correct ? 0x4d8a2a : 0xc4a87a

    const g = this.add.graphics()
    // soft drop shadow
    g.fillStyle(0x000000, 0.22)
    g.fillRoundedRect(bx + 2, by + 4, bw, bh, radius)
    g.fillStyle(fillColor, 1)
    g.fillRoundedRect(bx, by, bw, bh, radius)
    g.lineStyle(2.5, borderColor, 1)
    g.strokeRoundedRect(bx, by, bw, bh, radius)
    container.add(g)

    container.add(
      this.add
        .text(bx + bw / 2, by + bh / 2, text, {
          fontFamily: FONT_FAMILY,
          fontSize: `${fontSize}px`,
          color: correct ? '#1a4d20' : '#1a0e05',
          fontStyle: 'bold',
        })
        .setOrigin(0.5),
    )
  }

  /**
   * 라운드가 끝났을 때 정답 단어를 화면 중앙에 크게 공개한다.
   * 맞춘 사람이 있으면 함께 표시하고, 시간초과면 정답만 보여준다.
   */
  private showAnswerBanner(word: string, nickname: string | null) {
    const answer = word.trim()
    if (!answer) return

    this.answerBanner?.destroy()
    const w = this.scale.width
    const h = this.scale.height
    const cx = w / 2
    const cy = h * 0.38
    // 씬 최상위에 직접 add — root(depth 1) 안에 넣고 setDepth(100) 해봐야 Phaser Container 는
    // 자식 자동 depth-sort 를 안 해서 add 순서대로 그려진다. 결과적으로 layoutContainer 가
    // 배너 위를 덮어 안 보이던 문제. 씬 root display list 는 depth 로 정렬되므로 여기다 둔다.
    const container = this.add.container(cx, cy).setDepth(100)
    this.answerBanner = container

    // 정답자가 있을 땐 오렌지 accent 띠 + cream 본문(모던 톤), 시간초과는 차분한 갈색 띠.
    // 이전 빈티지 황금 보더 + 별 ⭐ 양쪽 박힌 디자인이 촌스러워서 모바일 게임 톤으로 다듬음.
    const hasWinner = !!nickname
    const palette = hasWinner
      ? {
          shadow: 0x000000,
          topBand: 0xff9a3c, // 윗 액센트 띠 — 따뜻한 오렌지
          body: 0xfff8e7, // 본문 cream
          bodyInset: 0xfef0d0,
          title: '#ffffff',
          titleStroke: '#c2620e',
          answer: '#5a3818',
          pillFill: 0xffd96b,
          pillShadow: 0xe6b250,
          pillText: '#8a5a1a',
        }
      : {
          shadow: 0x000000,
          topBand: 0xa8845a,
          body: 0xfff8e7,
          bodyInset: 0xefe1bf,
          title: '#fff8e7',
          titleStroke: '#5d4528',
          answer: '#3a2614',
          pillFill: 0xa8845a,
          pillShadow: 0x6a4a26,
          pillText: '#fff8e7',
        }

    const maxBannerW = Math.max(320, Math.min(w * 0.82, 760))
    const titleLabel = hasWinner ? `🎉 ${nickname} 정답!` : '⏱ 정답 공개'
    const titleText = this.add
      .text(0, 0, titleLabel, {
        fontFamily: FONT_FAMILY,
        fontSize: '24px',
        color: palette.title,
        fontStyle: 'bold',
        stroke: palette.titleStroke,
        strokeThickness: 3,
      })
      .setOrigin(0.5)

    let answerFontSize = Math.min(84, Math.max(48, Math.floor(w * 0.064)))
    const answerText = this.add
      .text(0, 0, answer, {
        fontFamily: FONT_FAMILY,
        fontSize: `${answerFontSize}px`,
        color: palette.answer,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)

    const maxTextW = maxBannerW - 88
    if (answerText.width > maxTextW) {
      answerFontSize = Math.max(36, Math.floor(answerFontSize * (maxTextW / answerText.width)))
      answerText.setFontSize(`${answerFontSize}px`)
    }

    // 점수 pill — 정답자 한정. 슬림한 노랑 pill.
    const pillH = 30
    const scorePill = hasWinner ? this.add.container(0, 0) : null
    if (scorePill) {
      const pillW = 76
      const pg = this.add.graphics()
      pg.fillStyle(palette.pillShadow, 1)
      pg.fillRoundedRect(-pillW / 2, -pillH / 2 + 2, pillW, pillH, pillH / 2)
      pg.fillStyle(palette.pillFill, 1)
      pg.fillRoundedRect(-pillW / 2, -pillH / 2, pillW, pillH, pillH / 2)
      const pt = this.add
        .text(0, 0, '+2점', {
          fontFamily: FONT_FAMILY,
          fontSize: '14px',
          color: palette.pillText,
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
      scorePill.add([pg, pt])
    }

    // 카드 레이아웃 — 상단 accent 띠 + cream 본문. 두 영역 분리는 색상 대비로만, 두꺼운 보더는 안 씀.
    const bandH = 56
    const bodyPadTop = 24
    const bodyPadBottom = scorePill ? 18 : 24
    const scoreGap = scorePill ? 14 : 0

    const paddingX = 56
    const contentW = Math.max(titleText.width, answerText.width, 240)
    const bw = Math.min(maxBannerW, Math.max(contentW + paddingX * 2, 320))
    const bodyH =
      bodyPadTop + answerText.height + (scorePill ? scoreGap + pillH : 0) + bodyPadBottom
    const bh = bandH + bodyH
    const radius = 22

    const g = this.add.graphics()
    // soft drop shadow 다층 — 두꺼운 갈색 보더 대신 부유감으로 시각 분리.
    for (let i = 0; i < 6; i++) {
      const spread = i * 2.6
      g.fillStyle(palette.shadow, 0.06)
      g.fillRoundedRect(
        -bw / 2 - spread,
        -bh / 2 + 12 + spread * 0.6,
        bw + spread * 2,
        bh + spread,
        radius + spread,
      )
    }
    // 본문 (전체 cream)
    g.fillStyle(palette.body, 1)
    g.fillRoundedRect(-bw / 2, -bh / 2, bw, bh, radius)
    // 본문 안쪽 옅은 라인 — 미세한 입체감.
    g.lineStyle(2, palette.bodyInset, 0.7)
    g.strokeRoundedRect(-bw / 2 + 3, -bh / 2 + 3, bw - 6, bh - 6, radius - 3)
    // 윗 accent 띠 — 라운드 사각의 윗부분만 채우려고 위쪽 라운드 사각 + 아래쪽 직사각 합성.
    g.fillStyle(palette.topBand, 1)
    g.fillRoundedRect(-bw / 2, -bh / 2, bw, bandH + radius, radius)
    g.fillRect(-bw / 2, -bh / 2 + bandH, bw, radius)
    // 띠 하단 미세 라인 — 본문과의 경계 강조.
    g.lineStyle(2, palette.shadow, 0.1)
    g.lineBetween(-bw / 2 + 8, -bh / 2 + bandH, bw / 2 - 8, -bh / 2 + bandH)
    container.add(g)

    // title 은 accent 띠 가운데, answer / pill 은 cream 본문 가운데.
    titleText.setPosition(0, -bh / 2 + bandH / 2)
    const bodyTop = -bh / 2 + bandH
    answerText.setPosition(0, bodyTop + bodyPadTop + answerText.height / 2)
    if (scorePill) {
      scorePill.setPosition(0, answerText.y + answerText.height / 2 + scoreGap + pillH / 2)
    }

    container.add(titleText)
    container.add(answerText)
    if (scorePill) container.add(scorePill)

    // 정답자 케이스 — 등장 후 부드러운 펄스 한 번. 별 흔들림보다 절제된 보상감.
    if (hasWinner) {
      this.time.delayedCall(380, () => {
        if (!container.active) return
        this.tweens.add({
          targets: container,
          scale: { from: 1.04, to: 1 },
          duration: 280,
          ease: 'Sine.out',
        })
      })
    }

    // 등장: 작게 시작해서 살짝 오버슈팅하며 펑! 가운데로 — 게임 보상 모먼트의 통통튀는 느낌.
    container.setAlpha(0)
    container.setScale(0.5)
    container.setY(cy - 14)
    this.tweens.add({
      targets: container,
      alpha: 1,
      scale: 1,
      y: cy,
      duration: 360,
      ease: 'Back.easeOut',
    })
    this.time.delayedCall(1700, () => {
      if (!container.active) return
      this.tweens.add({
        targets: container,
        alpha: 0,
        scale: 0.92,
        duration: 240,
        ease: 'Sine.in',
        onComplete: () => {
          container.destroy()
          if (this.answerBanner === container) this.answerBanner = null
        },
      })
    })
  }

  private drawCanvasArea(
    container: Phaser.GameObjects.Container,
    x: number,
    y: number,
    w: number,
    h: number,
  ) {
    const frame = Math.max(18, Math.min(26, w * 0.022))
    const paperX = x + frame
    const paperY = y + frame
    const paperW = w - frame * 2
    const paperH = h - frame * 2
    this.canvasBounds.setTo(paperX, paperY, paperW, paperH)
    const canvas = this.add.graphics()
    canvas.fillStyle(0x060914, 0.25)
    canvas.fillRoundedRect(x + 8, y + 10, w, h, 24)
    canvas.fillStyle(BOARD_FRAME_DARK, 1)
    canvas.fillRoundedRect(x, y, w, h, 24)
    canvas.fillStyle(BOARD_FRAME, 1)
    canvas.fillRoundedRect(x + 5, y + 5, w - 10, h - 10, 20)
    canvas.fillStyle(0xffcf7a, 0.38)
    canvas.fillRoundedRect(x + 13, y + 13, w - 26, 26, 14)
    canvas.lineStyle(4, CANVAS_BORDER, 1)
    canvas.strokeRoundedRect(x + 2, y + 2, w - 4, h - 4, 22)
    canvas.fillStyle(PAPER_SHADOW, 1)
    canvas.fillRoundedRect(paperX + 4, paperY + 5, paperW, paperH, 16)
    canvas.fillStyle(CANVAS_BG, 1)
    canvas.fillRoundedRect(paperX, paperY, paperW, paperH, 16)
    canvas.lineStyle(2, 0xe5dfd3, 1)
    canvas.strokeRoundedRect(paperX + 2, paperY + 2, paperW - 4, paperH - 4, 14)
    container.add(canvas)

    this.drawingGraphics = this.add.graphics()
    container.add(this.drawingGraphics)
    this.redrawStrokes()
  }

  private drawBottomBar(
    container: Phaser.GameObjects.Container,
    x: number,
    y: number,
    w: number,
    h: number,
  ) {
    // 비-출제자(=정답자) 일 땐 HTML 오버레이가 입력 + 나가기 까지 모두 책임진다 — Phaser 하단 바는 통째로 비움.
    if (!this.isDrawer()) {
      return
    }

    const panel = this.add.graphics()
    panel.fillStyle(0x050814, 0.28)
    panel.fillRoundedRect(x + 5, y + 6, w - 10, h, 20)
    panel.fillStyle(TOOLBAR_BG, 0.96)
    panel.fillRoundedRect(x, y, w, h, 20)
    panel.fillStyle(0x2d3a55, 0.42)
    panel.fillRoundedRect(x + 10, y + 10, w - 20, h / 2 - 8, 16)
    panel.lineStyle(3, PANEL_BORDER, 1)
    panel.strokeRoundedRect(x, y, w, h, 20)
    container.add(panel)

    this.drawDrawerTools(container, x + 30, y, h)
    this.drawLeaveButton(container, x + w - 30 - 104, y + h / 2 - 24, 104, 48)
  }

  private drawDrawerTools(
    container: Phaser.GameObjects.Container,
    x: number,
    y: number,
    h: number,
  ) {
    const cy = y + h / 2 + 6
    let cx = x
    // 팔레트 swatch — 어두운 베이스 링 제거하고 색만 꽉 채움. 선택된 swatch 만 두꺼운 cream 보더로 강조.
    const size = Math.min(52, h * 0.38)
    BRUSH_COLORS.forEach(option => {
      const selected = this.selectedTool === 'brush' && this.brushColor === option.color
      const radius = size / 2 + (selected ? 4 : 0)
      const swatch = this.add.circle(cx + size / 2, cy, radius, option.value, 1)
      swatch.setStrokeStyle(selected ? 4 : 2, selected ? 0xffe9c2 : 0xffffff, selected ? 1 : 0.85)
      swatch.setInteractive({ useHandCursor: true })
      swatch.on(Phaser.Input.Events.POINTER_DOWN, () => {
        this.selectedTool = 'brush'
        this.brushColor = option.color
        this.drawLayout()
      })
      container.add(swatch)
      cx += size + 18
    })

    container.add(
      this.createToolButton(cx + 52, cy, 96, 48, '지우개', this.selectedTool === 'eraser', () => {
        this.selectedTool = 'eraser'
        this.drawLayout()
      }),
    )
    container.add(
      this.createToolButton(cx + 164, cy, 112, 48, '전체 삭제', false, () => this.clearCanvas()),
    )
  }

  private drawLeaveButton(
    container: Phaser.GameObjects.Container,
    x: number,
    y: number,
    w: number,
    h: number,
  ) {
    container.add(
      this.createToolButton(x + w / 2, y + h / 2, w, h, '나가기', false, () => this.handleLeave()),
    )
  }

  private createToolButton(
    cx: number,
    cy: number,
    w: number,
    h: number,
    label: string,
    selected: boolean,
    onClick: () => void,
  ) {
    const container = this.add.container(cx, cy)
    const button = this.add.graphics()
    const radius = Math.min(14, h / 2)
    button.fillStyle(0x050814, 0.28)
    button.fillRoundedRect(-w / 2, -h / 2 + 4, w, h, radius)
    button.fillStyle(selected ? 0xffc45f : 0x34445e, 1)
    button.fillRoundedRect(-w / 2, -h / 2, w, h, radius)
    button.fillStyle(0xffffff, selected ? 0.24 : 0.1)
    button.fillRoundedRect(-w / 2 + 4, -h / 2 + 4, w - 8, h / 2 - 2, radius - 2)
    button.lineStyle(2.5, selected ? 0xfff3c4 : 0x7d8aa3, 1)
    button.strokeRoundedRect(-w / 2, -h / 2, w, h, radius)
    const hit = this.add.rectangle(0, 0, w, h, 0xffffff, 0.001).setOrigin(0.5)
    hit.setInteractive({ useHandCursor: true })
    hit.on(Phaser.Input.Events.POINTER_DOWN, onClick)
    const text = this.add
      .text(0, 0, label, {
        fontFamily: FONT_FAMILY,
        fontSize: '14px',
        color: selected ? '#3a2614' : '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
    container.add([button, hit, text])
    return container
  }

  private drawResultModal(container: Phaser.GameObjects.Container) {
    const w = this.scale.width
    const h = this.scale.height
    const overlay = this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.55)
    container.add(overlay)

    // 패널 사이즈는 인원수에 따라 가변. 행 높이 56 + gap 14 기준으로 정확히 맞춰 잡는다.
    const members = [...(this.finalMembers ?? [])].sort((a, b) => b.score - a.score)
    const rowH = 56
    const rowGap = 14
    const headerH = 96
    const buttonsH = 96
    const verticalPadding = 36
    const panelW = 560
    const panelH =
      headerH +
      members.length * rowH +
      Math.max(0, members.length - 1) * rowGap +
      buttonsH +
      verticalPadding
    const cx = w / 2
    const cy = h / 2
    const panelTop = cy - panelH / 2

    const panel = this.add.graphics()
    // 부드러운 ground shadow
    panel.fillStyle(0x000000, 0.32)
    panel.fillRoundedRect(cx - panelW / 2 + 6, panelTop + 14, panelW, panelH, 28)
    // 본체
    panel.fillStyle(0x2c3a55, 1)
    panel.fillRoundedRect(cx - panelW / 2, panelTop, panelW, panelH, 28)
    // 상단 하이라이트 — 다크 패널 톤을 부드럽게
    panel.fillStyle(0xffffff, 0.05)
    panel.fillRoundedRect(cx - panelW / 2 + 14, panelTop + 14, panelW - 28, 60, 18)
    panel.lineStyle(2, 0xffe9c2, 0.55)
    panel.strokeRoundedRect(cx - panelW / 2, panelTop, panelW, panelH, 28)
    container.add(panel)

    // 헤더 — 칩 없이 글자만, 옅은 금색
    container.add(
      this.add
        .text(cx, panelTop + 50, '최종 결과', {
          fontFamily: FONT_FAMILY,
          fontSize: '34px',
          color: '#ffe9c2',
          fontStyle: 'bold',
          stroke: '#1a0e05',
          strokeThickness: 4,
        })
        .setOrigin(0.5),
    )

    // 랭크 행. 1위는 금색 강조 + 왕관 prefix, 나머지는 차분한 톤.
    const rowsTop = panelTop + headerH
    members.forEach((member, i) => {
      const isWinner = i === 0
      const rowY = rowsTop + i * (rowH + rowGap)
      const row = this.add.graphics()
      // 부드러운 행 그림자
      row.fillStyle(0x000000, 0.22)
      row.fillRoundedRect(cx - 220, rowY + 4, 440, rowH, 18)
      row.fillStyle(isWinner ? 0xffd36b : 0x1c2840, 1)
      row.fillRoundedRect(cx - 220, rowY, 440, rowH, 18)
      if (isWinner) {
        // 상단 글로스 — 1위만
        row.fillStyle(0xffffff, 0.18)
        row.fillRoundedRect(cx - 212, rowY + 6, 424, rowH * 0.42, 14)
      }
      row.lineStyle(2, isWinner ? 0xb47a1f : 0x3b4864, 0.95)
      row.strokeRoundedRect(cx - 220, rowY, 440, rowH, 18)
      container.add(row)

      // 순위 chip (좌)
      const rankText = isWinner ? '👑' : `${i + 1}`
      container.add(
        this.add
          .text(cx - 188, rowY + rowH / 2, rankText, {
            fontFamily: FONT_FAMILY,
            fontSize: isWinner ? '30px' : '22px',
            color: isWinner ? '#1a0e05' : '#ffe9c2',
            fontStyle: 'bold',
          })
          .setOrigin(0.5),
      )
      // 닉네임 (가운데 정렬, 좌측 chip 우측에서 시작)
      container.add(
        this.add
          .text(cx - 150, rowY + rowH / 2, member.nickname, {
            fontFamily: FONT_FAMILY,
            fontSize: '22px',
            color: isWinner ? '#1a0e05' : '#ffffff',
            fontStyle: 'bold',
          })
          .setOrigin(0, 0.5),
      )
      // 점수 (우)
      container.add(
        this.add
          .text(cx + 200, rowY + rowH / 2, `${member.score}점`, {
            fontFamily: FONT_FAMILY,
            fontSize: '22px',
            color: isWinner ? '#1a0e05' : '#ffd96b',
            fontStyle: 'bold',
          })
          .setOrigin(1, 0.5),
      )
    })

    // 버튼 영역
    const buttonsCy = panelTop + panelH - buttonsH / 2
    container.add(
      this.createToolButton(cx - 100, buttonsCy, 170, 56, '한 판 더', false, () => this.restart()),
    )
    container.add(
      this.createToolButton(cx + 100, buttonsCy, 170, 56, '아트룸으로', false, () =>
        this.handleLeave(),
      ),
    )
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer) {
    if (!this.canDraw()) return
    const point = this.pointerToCanvasPoint(pointer)
    if (!point) {
      return
    }
    this.activePointerId = pointer.id
    this.activeStrokeId = `${this.currentUserId ?? 'me'}-${Date.now()}`
    this.activeLastPoint = point
    this.lastStrokeSendAt = 0
    this.realtimeClient?.publishStroke(this.makeStroke('begin', point))
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer) {
    if (!this.canDraw() || this.activePointerId !== pointer.id || !pointer.isDown) return
    const point = this.pointerToCanvasPoint(pointer)
    if (!point || !this.activeLastPoint) return
    if (this.selectedTool === 'brush') {
      this.usedColors.add(this.brushColor)
    }
    this.appendSegment(
      this.activeLastPoint,
      point,
      this.brushColor,
      this.brushSize,
      this.selectedTool === 'eraser',
    )
    this.activeLastPoint = point
    const now = Date.now()
    if (now - this.lastStrokeSendAt >= STROKE_THROTTLE_MS) {
      this.lastStrokeSendAt = now
      this.realtimeClient?.publishStroke(this.makeStroke('move', point))
    }
  }

  private handlePointerUp(pointer: Phaser.Input.Pointer) {
    if (this.activePointerId !== pointer.id) return
    const point = this.pointerToCanvasPoint(pointer) ?? this.activeLastPoint
    if (point && this.activeLastPoint) {
      if (this.selectedTool === 'brush') {
        this.usedColors.add(this.brushColor)
      }
      this.appendSegment(
        this.activeLastPoint,
        point,
        this.brushColor,
        this.brushSize,
        this.selectedTool === 'eraser',
      )
      this.realtimeClient?.publishStroke(this.makeStroke('end', point))
    }
    this.activePointerId = null
    this.activeStrokeId = null
    this.activeLastPoint = null
  }

  private handleRealtimeEvent(event: QuizRoomEvent) {
    if (event.type === 'member_left') {
      this.snapshot = {
        ...this.snapshot,
        members: this.snapshot.members.filter(member => member.userId !== event.userId),
      }
      // 떠난 멤버를 슬롯 / 버블 / 결과 모달에서 즉시 제거하려면 레이아웃 재그리기 필수.
      this.activeBubbles.delete(event.userId)
      this.drawLayout()
    } else if (event.type === 'host_changed') {
      this.snapshot = {
        ...this.snapshot,
        hostUserId: event.hostUserId,
        members: this.snapshot.members.map(member => ({
          ...member,
          isHost: member.userId === event.hostUserId,
        })),
      }
      this.drawLayout()
    } else if (event.type === 'room_reset') {
      this.returnToLobby(
        {
          ...this.snapshot,
          status: event.status,
          hostUserId: event.hostUserId,
          members: event.members,
          roundNumber: event.roundNumber,
          currentDrawerUserId: event.currentDrawerUserId,
          roundEndsAtEpochMillis: null,
        },
        event.message ?? '게임이 중단되어 로비로 돌아왔어요.',
      )
    } else if (event.type === 'round_started') {
      this.answerBanner?.destroy()
      this.answerBanner = null
      this.snapshot = {
        ...this.snapshot,
        status: event.status,
        roundNumber: event.roundNumber,
        currentDrawerUserId: event.currentDrawerUserId,
        roundEndsAtEpochMillis: event.roundEndsAtEpochMillis,
        totalRounds: event.totalRounds,
      }
      this.prompt = null
      this.wordLength = event.wordLength
      this.roundEnded = false
      this.finalMembers = null
      this.roundEndedAt = null
      this.strokes = []
      this.remoteLastPoints.clear()
      this.usedColors.clear()
      // 출제자 본인이 그릴 라운드만 플레이 시간을 측정. 다른 사람 라운드는 저장 안 함.
      this.drawerRoundStartedAt = this.isDrawer() ? Date.now() : null
      this.scheduleWordLengthReveal(event.roundEndsAtEpochMillis)
      // 정답자(=출제자 아님) 한정으로 정답 입력 오버레이 노출.
      this.setGuessOverlay(!this.isDrawer())
      this.drawLayout()
    } else if (event.type === 'stroke') {
      if (event.userId !== this.currentUserId) {
        this.applyRemoteStroke(event.stroke)
      }
    } else if (event.type === 'guess_submitted') {
      // 추측은 더 이상 중앙 패널이 아니라 슬롯 옆 말풍선으로 잠깐만 뜸.
      this.activeBubbles.set(event.userId, {
        text: event.correct ? '정답!' : event.message,
        correct: event.correct,
        expiresAt: Date.now() + BUBBLE_TTL_MS,
      })
      this.drawLayout()
    } else if (event.type === 'round_ended') {
      const correctMember =
        event.correctUserId === undefined
          ? null
          : (event.members.find(member => member.userId === event.correctUserId) ??
            this.snapshot.members.find(member => member.userId === event.correctUserId) ??
            null)
      this.roundEnded = true
      this.snapshot = { ...this.snapshot, members: event.members }
      // 라운드 종료 시 잔여 말풍선 모두 정리 (정답자 말풍선은 그대로 두고 싶다면 정답자 user 만 유지하도록 변경 가능).
      this.activeBubbles.clear()
      this.setGuessOverlay(false)
      this.timerExpiredAt = null
      this.roundEndedAt = Date.now()
      this.cancelWordLengthReveal()
      this.drawLayout()
      this.showAnswerBanner(event.word, correctMember?.nickname ?? null)
      // 본인이 출제자였던 라운드면 PNG 로 내려 자기 앨범에 자동 저장. 비공개로 둠.
      this.maybeSaveDrawerArtwork()
    } else if (event.type === 'game_finished') {
      this.answerBanner?.destroy()
      this.answerBanner = null
      this.finalMembers = event.members
      this.snapshot = { ...this.snapshot, status: 'FINISHED', members: event.members }
      this.activeBubbles.clear()
      this.setGuessOverlay(false)
      this.timerExpiredAt = null
      this.roundEndedAt = null
      this.cancelWordLengthReveal()
      this.drawLayout()
      // round_ended 없이 곧장 game_finished 로 마지막 라운드가 끝나는 경우 대비 — 중복 저장은
      // savedRoundNumber 가드로 막는다.
      this.maybeSaveDrawerArtwork()
    }
  }

  /**
   * 라운드 시작 후 일정 시간이 지나면 글자수 힌트를 노출하도록 타이머를 셋팅. roundEndsAt 으로부터
   * 라운드 시작 시각을 역산해, 이미 reveal 시점이 지났으면 즉시 노출 / 아니면 남은 만큼 지연 호출.
   * 재진입/재접속(예: snapshot.roundEndsAtEpochMillis 가 이미 30s 전에 시작된 라운드를 가리키는 경우)
   * 에도 자연스럽게 동작.
   */
  private scheduleWordLengthReveal(roundEndsAtEpochMillis: number | null | undefined) {
    this.wordLengthRevealTimer?.remove(false)
    this.wordLengthRevealTimer = null
    this.wordLengthRevealed = false
    if (!roundEndsAtEpochMillis) return
    const startedAt = roundEndsAtEpochMillis - ROUND_DURATION_MS
    const revealAt = startedAt + WORD_LENGTH_REVEAL_MS
    const delay = revealAt - Date.now()
    if (delay <= 0) {
      this.wordLengthRevealed = true
      return
    }
    this.wordLengthRevealTimer = this.time.delayedCall(delay, () => {
      this.wordLengthRevealTimer = null
      this.wordLengthRevealed = true
      this.drawLayout()
    })
  }

  private cancelWordLengthReveal() {
    this.wordLengthRevealTimer?.remove(false)
    this.wordLengthRevealTimer = null
    this.wordLengthRevealed = false
  }

  /** HTML 오버레이 표시/숨김 토글. 멱등 + 중복 emit 회피. */
  private setGuessOverlay(open: boolean) {
    if (this.guessOverlayOpen === open) return
    this.guessOverlayOpen = open
    this.game.events.emit(open ? 'quiz-guess:open' : 'quiz-guess:close')
  }

  private makeStroke(kind: QuizStrokeMessage['kind'], point: Point): QuizStrokeMessage {
    return {
      kind,
      strokeId: this.activeStrokeId ?? undefined,
      x: point.x,
      y: point.y,
      color: this.brushColor,
      size: this.brushSize,
      eraser: this.selectedTool === 'eraser',
    }
  }

  private applyRemoteStroke(stroke: QuizStrokeMessage) {
    if (stroke.kind === 'clear') {
      this.strokes = []
      this.remoteLastPoints.clear()
      this.redrawStrokes()
      return
    }
    if (!stroke.strokeId || stroke.x === undefined || stroke.y === undefined) return
    const point = { x: clamp01(stroke.x), y: clamp01(stroke.y) }
    if (stroke.kind === 'begin') {
      this.remoteLastPoints.set(stroke.strokeId, point)
      return
    }
    const previous = this.remoteLastPoints.get(stroke.strokeId)
    if (previous) {
      this.appendSegment(
        previous,
        point,
        stroke.color ?? '#ff4d4d',
        stroke.size ?? this.brushSize,
        !!stroke.eraser,
      )
    }
    if (stroke.kind === 'end') {
      this.remoteLastPoints.delete(stroke.strokeId)
    } else {
      this.remoteLastPoints.set(stroke.strokeId, point)
    }
  }

  private appendSegment(from: Point, to: Point, color: string, size: number, eraser: boolean) {
    const segment = { from, to, color, size, eraser }
    this.strokes.push(segment)
    this.drawSegment(segment)
  }

  private drawSegment(segment: DrawSegment) {
    if (!this.drawingGraphics) return
    const from = this.canvasToScreen(segment.from)
    const to = this.canvasToScreen(segment.to)
    this.drawingGraphics.lineStyle(
      segment.size,
      segment.eraser ? CANVAS_BG : hexToNumber(segment.color),
      1,
    )
    this.drawingGraphics.beginPath()
    this.drawingGraphics.moveTo(from.x, from.y)
    this.drawingGraphics.lineTo(to.x, to.y)
    this.drawingGraphics.strokePath()
  }

  private redrawStrokes() {
    this.drawingGraphics?.clear()
    this.strokes.forEach(segment => this.drawSegment(segment))
  }

  private clearCanvas() {
    if (!this.canDraw()) return
    this.strokes = []
    this.remoteLastPoints.clear()
    this.redrawStrokes()
    this.realtimeClient?.publishStroke({ kind: 'clear' })
  }

  /**
   * HTML 오버레이({@code QuizGuessOverlay}) 가 Enter/버튼으로 정답을 보내올 때 호출. 출제자 본인이거나 라운드/게임 종료 상태면 무시.
   */
  private handleGuessOverlaySubmit(payload: { text: string }) {
    const text = payload?.text?.trim()
    if (!text || this.isDrawer() || this.roundEnded || this.finalMembers) return
    this.realtimeClient?.publishGuess(text)
  }

  private updateTimerText() {
    // 만료된 말풍선 청소 — 변경 있으면 레이아웃 재그리기.
    if (this.activeBubbles.size > 0) {
      const now = Date.now()
      let changed = false
      this.activeBubbles.forEach((bubble, userId) => {
        if (bubble.expiresAt <= now) {
          this.activeBubbles.delete(userId)
          changed = true
        }
      })
      if (changed) this.drawLayout()
    }

    if (!this.timerText) return
    if (this.roundEnded) {
      this.timerText.setText('결과 확인')
      const now = Date.now()
      if (this.roundEndedAt === null) this.roundEndedAt = now
      if (
        !this.finalMembers &&
        now - this.roundEndedAt >= 3500 &&
        now - this.lastReconcileAt >= 4000
      ) {
        this.lastReconcileAt = now
        void this.reconcileRoomState()
      }
      return
    }
    const endsAt = this.snapshot.roundEndsAtEpochMillis
    if (!endsAt) {
      this.timerText.setText('--:--')
      return
    }
    const remaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000))
    const mm = String(Math.floor(remaining / 60)).padStart(2, '0')
    const ss = String(remaining % 60).padStart(2, '0')
    this.timerText.setText(`${mm}:${ss}`)

    // 라운드 자가 복구 — 타이머가 0 이 됐는데도 round_ended 가 안 오면 BE 스케줄 / WS
    // 어디선가 막힌 상황. 4s 마다 REST 로 룸 상태 끌어와 강제 반영.
    if (remaining === 0 && !this.roundEnded && !this.finalMembers) {
      const now = Date.now()
      if (this.timerExpiredAt === null) this.timerExpiredAt = now
      if (now - this.timerExpiredAt >= 4000 && now - this.lastReconcileAt >= 4000) {
        this.lastReconcileAt = now
        void this.reconcileRoomState()
      }
    } else if (remaining > 0) {
      this.timerExpiredAt = null
    }
  }

  /** REST 로 룸 스냅샷을 받아 로컬과 차이가 있으면 상태/이벤트 핸들러로 흘려보낸다. */
  private async reconcileRoomState() {
    if (this.reconcileInFlight || this.isLeaving) return
    this.reconcileInFlight = true
    try {
      const fresh = await getQuizRoom(this.snapshot.roomId)
      // 게임 종료 — 결과 모달 띄움
      if (fresh.status === 'FINISHED' && !this.finalMembers) {
        this.finalMembers = fresh.members
        this.snapshot = fresh
        this.activeBubbles.clear()
        this.setGuessOverlay(false)
        this.drawLayout()
        return
      }
      // 라운드 번호가 앞서갔다 — round_ended/round_started 를 놓친 상태
      if (fresh.status === 'WAITING' && this.snapshot.status === 'PLAYING') {
        this.returnToLobby(fresh, '게임이 중단되어 로비로 돌아왔어요.')
        return
      }
      if (fresh.roundNumber > this.snapshot.roundNumber) {
        this.snapshot = fresh
        this.prompt = null
        this.wordLength = null
        this.roundEnded = false
        this.finalMembers = null
        this.strokes = []
        this.remoteLastPoints.clear()
        this.setGuessOverlay(!this.isDrawer())
        this.timerExpiredAt = null
        this.roundEndedAt = null
        this.drawLayout()
        return
      }
      // 같은 라운드라도 endsAt 이 갱신됐을 수 있음 (BE 가 라운드를 새로 시작했을 때 등)
      if (fresh.roundEndsAtEpochMillis !== this.snapshot.roundEndsAtEpochMillis) {
        this.snapshot = fresh
        this.drawLayout()
      }
    } catch (err) {
      console.warn('[quiz-realtime] reconcile failed', err)
    } finally {
      this.reconcileInFlight = false
    }
  }

  private pointerToCanvasPoint(pointer: Phaser.Input.Pointer): Point | null {
    if (!this.canvasBounds.contains(pointer.x, pointer.y)) return null
    return {
      x: clamp01((pointer.x - this.canvasBounds.x) / this.canvasBounds.width),
      y: clamp01((pointer.y - this.canvasBounds.y) / this.canvasBounds.height),
    }
  }

  private canvasToScreen(point: Point): Point {
    return {
      x: this.canvasBounds.x + point.x * this.canvasBounds.width,
      y: this.canvasBounds.y + point.y * this.canvasBounds.height,
    }
  }

  private isDrawer() {
    return this.currentUserId !== null && this.snapshot.currentDrawerUserId === this.currentUserId
  }

  /**
   * 본인이 출제자였던 라운드의 캔버스를 PNG 로 굽고 본인 앨범에 비공개로 저장.
   * round_ended / game_finished 에서 호출되며 같은 라운드에 두 번 저장되지 않도록 savedRoundNumber 로 가드.
   * 자유그리기({@link ArtFreeDrawingScene}) 의 저장 흐름과 동일한 createArtwork 엔드포인트 재사용.
   */
  private maybeSaveDrawerArtwork() {
    if (!this.isDrawer()) return
    if (this.strokes.length === 0) return
    const roundNumber = this.snapshot.roundNumber
    if (this.savedRoundNumber === roundNumber) return
    this.savedRoundNumber = roundNumber

    const startedAt = this.drawerRoundStartedAt ?? Date.now()
    const elapsedMs = Math.max(0, Date.now() - startedAt)
    const playDurationSeconds = Math.min(
      ROUND_DURATION_MS / 1000,
      Math.max(1, Math.round(elapsedMs / 1000)),
    )
    const colorCount = this.usedColors.size

    void this.exportStrokesToPng()
      .then(blob =>
        createArtwork({
          image: blob,
          filename: `quiz-drawing-${Date.now()}.png`,
          sketchCode: null,
          playDurationSeconds,
          isPublic: false,
          colorCount,
        }),
      )
      .catch(error => {
        // 저장 실패해도 게임 진행은 영향 없음 — 콘솔에만 로깅.
        console.error('Failed to save quiz drawing artwork.', error)
      })
  }

  /**
   * 현재 strokes 를 오프스크린 캔버스에 래스터화해서 PNG Blob 으로 반환.
   * Phaser Graphics 의 WebGL 스냅샷을 거치는 대신, 정규화된 strokes 데이터를 직접 그려
   * 캔버스 프레임/UI 영역 없이 그림만 담기게 한다.
   */
  private exportStrokesToPng(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const width = Math.max(1, Math.round(this.canvasBounds.width))
      const height = Math.max(1, Math.round(this.canvasBounds.height))
      const out = document.createElement('canvas')
      out.width = width
      out.height = height
      const ctx = out.getContext('2d')
      if (!ctx) {
        reject(new Error('Failed to create export canvas context.'))
        return
      }
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, width, height)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      for (const seg of this.strokes) {
        ctx.strokeStyle = seg.eraser ? '#ffffff' : seg.color
        ctx.lineWidth = seg.size
        ctx.beginPath()
        ctx.moveTo(seg.from.x * width, seg.from.y * height)
        ctx.lineTo(seg.to.x * width, seg.to.y * height)
        ctx.stroke()
      }
      out.toBlob(blob => {
        if (!blob) {
          reject(new Error('Drawing canvas toBlob returned null.'))
          return
        }
        resolve(blob)
      }, 'image/png')
    })
  }

  private canDraw() {
    return this.isDrawer() && !this.roundEnded && !this.finalMembers
  }

  private returnToLobby(snapshot: QuizRoomSnapshot, statusMessage: string) {
    if (this.isLeaving) return
    const client = this.realtimeClient
    this.realtimeClient = null
    this.isLeaving = true
    this.activeBubbles.clear()
    this.setGuessOverlay(false)
    this.scene.start('QuizLobbyScene', {
      snapshot,
      currentUserId: this.currentUserId,
      realtimeClient: client,
      statusMessage,
    })
  }

  private async handleLeave() {
    if (this.isLeaving) return
    this.isLeaving = true
    await this.disconnectAndLeave()
    fadeToScene(this, 'ArtSelectScene', { duration: 220 })
  }

  /**
   * ESC — 게임 중 어디서든 안전하게 빠져나가도록. HTML 추측 오버레이가 떠 있을 때(추측자가
   * input 에 focus 한 상태) 는 그쪽 ESC 가 먼저 처리되도록 키 처리를 양보(=무시)하지 않아도
   * Phaser 키보드 이벤트는 게임 캔버스로 focus 있을 때만 들어오므로 충돌 없음.
   * 결과 모달이 떠 있는 finished 상태 / 이미 leaving 중이면 noop.
   */
  private handleEscKey() {
    if (this.isLeaving) return
    void this.handleLeave()
  }

  private async restart() {
    if (this.isLeaving) return
    this.isLeaving = true
    const client = this.realtimeClient
    this.realtimeClient = null
    this.activeBubbles.clear()
    this.setGuessOverlay(false)
    try {
      const snapshot = await getQuizRoom(this.snapshot.roomId)
      this.scene.start('QuizLobbyScene', {
        snapshot,
        currentUserId: this.currentUserId,
        realtimeClient: client,
        statusMessage: '같은 방에서 한 판 더 준비해요.',
      })
    } catch {
      this.realtimeClient = client
      this.isLeaving = false
      await this.handleLeave()
    }
  }

  private async disconnectAndLeave() {
    const client = this.realtimeClient
    this.realtimeClient = null
    if (client) {
      await client.disconnect()
    }
    try {
      await leaveQuizRoom()
    } catch {
      // Room may already be closed after game finish.
    }
  }

  private handleShutdown() {
    this.scale.off('resize', this.layout, this)
    this.input.off(Phaser.Input.Events.POINTER_DOWN, this.handlePointerDown, this)
    this.input.off(Phaser.Input.Events.POINTER_MOVE, this.handlePointerMove, this)
    this.input.off(Phaser.Input.Events.POINTER_UP, this.handlePointerUp, this)
    this.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.handlePointerUp, this)
    this.game.events.off('quiz-guess:submit', this.handleGuessOverlaySubmit, this)
    this.game.events.off('quiz-guess:leave', this.handleLeave, this)
    this.input.keyboard?.off('keydown-ESC', this.handleEscKey, this)
    this.setGuessOverlay(false)
    this.timerEvent?.remove(false)
    this.cancelWordLengthReveal()
    if (!this.isLeaving) {
      this.realtimeClient?.setHandlers({
        onSnapshot: () => {},
        onPrompt: () => {},
        onEvent: () => {},
      })
    }
  }
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

function hexToNumber(color: string) {
  return Number.parseInt(color.replace('#', ''), 16)
}

function friendlyWsError(raw: string): string {
  if (!raw) return '연결을 확인하는 중...'
  const lower = raw.toLowerCase()
  if (lower.includes('not a member')) return '방 멤버가 아니에요. 다시 입장해줘.'
  if (lower.includes('quiz realtime disabled') || lower.includes('village realtime disabled')) {
    return '실시간 기능이 잠시 꺼져 있어요.'
  }
  return '연결을 다시 시도하는 중...'
}
