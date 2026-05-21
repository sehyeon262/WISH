import Phaser from 'phaser'
import { playSceneBgm } from '@/game/systems/sceneBgm'
import {
  createQuizRoom,
  ensureFreshAccessToken,
  getWaitingQuizRooms,
  joinQuizRoom,
  leaveQuizRoom,
  startQuizRoom,
  type PromptAssignment,
  type QuizRoomListItem,
  type QuizRoomSnapshot,
} from '@wish/api-client'
import { assetPath } from '@/game/assets/assetPath'
import { QuizRealtimeClient } from '@/features/quiz-realtime'
import type { QuizRoomEvent } from '@/features/quiz-realtime'
import { extractUserIdFromToken } from '@/features/village-realtime/jwtUserId'
import { fadeToScene } from '@/game/systems/sceneTransition'
import { addCoverBackground } from '@/game/world/background'
import { CUTE_CARD_PALETTES } from '@/game/ui/cuteCard'

/**
 * 그림 퀴즈 모드 선택 + 멀티플레이 로비 (S14P31E103-820).
 *
 * <p>상태 머신:
 *
 * <ul>
 *   <li>{@code modeSelect} — Step1: 솔로 (AI) / 멀티 두 큰 버튼
 *   <li>{@code multiHub} — Step2: "방 만들기" + 입장 가능한 방 목록을 한 화면에 표시
 *   <li>{@code creating} — createQuizRoom 진행 중
 *   <li>{@code joining} — joinQuizRoom 진행 중
 *   <li>{@code lobby} — WS 연결 + 멤버 슬롯 + 시작 버튼 (방장)
 *   <li>{@code leaving} — leaveQuizRoom + 미술실 복귀
 * </ul>
 */
const FONT_FAMILY =
  '"Pretendard Variable", Pretendard, "Noto Sans KR", -apple-system, BlinkMacSystemFont, sans-serif'

type LobbyState =
  | 'modeSelect'
  | 'multiHub'
  | 'creating'
  | 'joining'
  | 'lobby'
  | 'starting'
  | 'transitioningToPlay'
  | 'leaving'

const HUB_POLL_INTERVAL_MS = 5000

export interface QuizLobbySceneInit {
  snapshot: QuizRoomSnapshot
  currentUserId: number | null
  realtimeClient: QuizRealtimeClient | null
  statusMessage?: string
}

const ROUND_OPTIONS = [3, 6, 9, 12, 15] as const
const DEFAULT_SELECTED_ROUNDS = 3
const MIN_VISIBLE_PLAYER_SLOTS = 6
const PALETTE_DANGER = CUTE_CARD_PALETTES.rose

// 카드 팔레트 — 채도 톤다운된 코디네이션 페어. 이전엔 #f4a64a/#6aaa64/#4a8fc4 가 너무 쨍해서 산만했음.
// 같은 채도/명도 패밀리에서 따뜻함(피치/테라코타) ↔ 차분함(세이지) 으로만 갈라줌.
const COLOR_WARM = 0xe89865
const COLOR_WARM_DARK = 0xb06840
const COLOR_COOL = 0x82b596
const COLOR_COOL_DARK = 0x517e64

// 슬롯 아바타 — QuizPlayScene 과 동일한 char1~9 (art/ui) 를 방마다 섞인 순서로 사용.
// Math.random() 을 쓰면 클라이언트마다 다르게 보일 수 있어 roomId + joinOrder 로 고정 랜덤 매핑.
const SLOT_CHAR_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const
const SLOT_CHAR_CROP_RATIO = 0.55
const SLOT_CHAR_STEPS = [1, 2, 4, 5, 7, 8] as const

function slotCharKey(charNumber: number): string {
  return `quiz-lobby-char${charNumber}`
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

export class QuizLobbyScene extends Phaser.Scene {
  private state: LobbyState = 'modeSelect'
  private snapshot: QuizRoomSnapshot | null = null
  private currentUserId: number | null = null
  private realtimeClient: QuizRealtimeClient | null = null
  private initialLobbyData: QuizLobbySceneInit | null = null
  private selectedTotalRounds: (typeof ROUND_OPTIONS)[number] = DEFAULT_SELECTED_ROUNDS
  /**
   * BE 가 `/user/queue/quiz/{roomId}/prompt` 로 push 해주는 제시어를 일단 stash.
   * <p>로비에서 BE 가 startNextRound 를 부르면 (a) roundStarted broadcast (b) sendPromptToUser 를
   * 거의 동시에 발사한다. WS broadcast 가 호스트의 REST `/start` 응답보다 먼저 도착하면
   * `transitionToPlayScene(snapshot, null, wordLength)` 가 prompt=null 로 PlayScene 을 띄워버려
   * 출제자(=호스트, 라운드 1 drawer) 화면이 "제시어 확인 중" 으로 굳어버리던 버그가 있었다.
   * 여기에 보관한 prompt 는 transitionToPlayScene 의 fallback 으로 사용.
   */
  private pendingPrompt: PromptAssignment | null = null

  private root!: Phaser.GameObjects.Container
  private backdrop: Phaser.GameObjects.Rectangle | null = null
  private statusText!: Phaser.GameObjects.Text

  private menuContainer: Phaser.GameObjects.Container | null = null
  private lobbyContainer: Phaser.GameObjects.Container | null = null

  // multiHub — 방 목록 + 방 만들기 통합 화면. fetch 결과/로딩/에러를 들고 있다가 화면을 다시 그릴 때 사용.
  private hubRooms: QuizRoomListItem[] = []
  private hubLoading = false
  private hubError: string | null = null
  private hubPollTimer: Phaser.Time.TimerEvent | null = null
  private hubFetchToken = 0
  // 방 목록 스크롤 — listContainer 안에 카드를 쌓고 mask 로 보이는 영역 클립.
  // wheel 시 listContainer.y 를 minY..maxY 범위에서 조정. 스크롤바는 의도적으로 표시 안 함.
  private hubListContainer: Phaser.GameObjects.Container | null = null
  private hubListMask: Phaser.GameObjects.Graphics | null = null
  private hubListArea: { left: number; top: number; right: number; bottom: number } | null = null
  private hubListMinY = 0
  private hubListMaxY = 0
  private hubWheelBound = false

  constructor() {
    super('QuizLobbyScene')
  }

  init(data: Partial<QuizLobbySceneInit> = {}) {
    this.state = 'modeSelect'
    this.snapshot = null
    this.currentUserId = null
    this.realtimeClient = null
    this.pendingPrompt = null
    this.selectedTotalRounds = data.snapshot
      ? normalizeRoundOption(data.snapshot.totalRounds)
      : DEFAULT_SELECTED_ROUNDS
    this.menuContainer = null
    this.lobbyContainer = null
    this.hubRooms = []
    this.hubLoading = false
    this.hubError = null
    this.hubPollTimer = null
    this.hubFetchToken = 0
    this.hubListContainer = null
    this.hubListMask = null
    this.hubListArea = null
    this.hubListMinY = 0
    this.hubListMaxY = 0
    this.initialLobbyData = data.snapshot
      ? {
          snapshot: data.snapshot,
          currentUserId: data.currentUserId ?? null,
          realtimeClient: data.realtimeClient ?? null,
          statusMessage: data.statusMessage ?? '',
        }
      : null
  }

  preload() {
    // ArtSelectScene 도 같은 키로 로드하지만, 다른 진입 경로 (재접속 새로고침 등) 에서 본 씬이 먼저 뜰 수도 있어 안전하게 중복 로드.
    if (!this.textures.exists('art-room-background')) {
      this.load.image(
        'art-room-background',
        assetPath('images/themes/art/background/background.png'),
      )
    }
    // 슬롯 아바타 — 멤버 슬롯에 NPC 캐릭터 상반신을 노출. 게임 씬과 같은 char1~4.
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

    // 메뉴/로비 모두 가독성을 위해 배경 위에 어두운 백드롭을 깔아둔다. alpha 0.55 면 배경 분위기는 살리고 텍스트는 또렷.
    this.backdrop = this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.55)
      .setOrigin(0)
      .setDepth(0)
    this.root = this.add.container(0, 0)
    this.root.setDepth(1)

    this.statusText = this.add
      .text(0, 0, '', {
        fontFamily: FONT_FAMILY,
        fontSize: '20px',
        color: '#ffe9c2',
      })
      .setOrigin(0.5)
      .setVisible(false)
    this.root.add(this.statusText)

    this.scale.on('resize', this.layout, this)
    this.events.once('shutdown', this.handleShutdown, this)

    if (!this.hubWheelBound) {
      this.input.on('wheel', this.handleHubWheel, this)
      this.hubWheelBound = true
    }

    this.input.keyboard?.on('keydown-ESC', this.handleEscKey, this)

    if (this.initialLobbyData) {
      this.enterTransferredLobby(this.initialLobbyData)
    } else {
      // 그림 퀴즈를 새로 진입한 경우, BE 가 들고 있을 수 있는 stale 방을 silent 로 정리.
      // 사용자가 의도치 않은 경로(브라우저 새로고침, 다른 메뉴 이동 등)로 빠져나갔을 때 BE 에
      // 자기 방이 남아있어 다음 진입에서 "이미 방에 있음" 상태로 잡히던 문제 방지.
      // 이미 방이 없으면 404 가 떨어지므로 그냥 무시.
      leaveQuizRoom().catch(() => {})
      this.showModeSelect()
    }
  }

  private layout() {
    this.backdrop?.setSize(this.scale.width, this.scale.height)
    if (this.state === 'lobby') {
      this.drawLobby()
    } else if (this.state === 'modeSelect') {
      this.drawModeSelect()
    } else if (this.state === 'multiHub') {
      this.drawMultiHub()
    }
    this.positionStatusText()
  }

  // ─────────────────────────────────────────────────────────────────────────
  // mode select (Step 1: 솔로 / 멀티)

  private showModeSelect() {
    this.stopHubPolling()
    this.state = 'modeSelect'
    this.tearDownLobby()
    this.drawModeSelect()
    this.setStatus('')
  }

  private drawModeSelect() {
    this.menuContainer?.destroy()
    const w = this.scale.width
    const h = this.scale.height
    const container = this.add.container(0, 0)
    this.root.add(container)
    this.menuContainer = container

    this.drawHeader(container, '그림 퀴즈', '어떤 모드로 놀까?')

    // 큰 게임 버튼 2개 가로 배치.
    const buttonW = Math.min(360, (w - 200) / 2)
    const buttonH = 320
    const gap = 56
    const cy = h * 0.55
    const leftX = w / 2 - buttonW / 2 - gap / 2
    const rightX = w / 2 + buttonW / 2 + gap / 2

    container.add(
      this.createBigButton(leftX, cy, buttonW, buttonH, {
        icon: '🎨',
        title: '솔로 모드',
        desc: 'AI 랑 둘이서\n제시어 그림 퀴즈',
        fill: COLOR_WARM,
        shadow: COLOR_WARM_DARK,
        onClick: () => this.startSingleplayer(),
      }),
    )

    container.add(
      this.createBigButton(rightX, cy, buttonW, buttonH, {
        icon: '👥',
        title: '멀티 모드',
        desc: '친구들이랑 같이\n그리고 맞춰봐',
        fill: COLOR_COOL,
        shadow: COLOR_COOL_DARK,
        onClick: () => this.showMultiHub(),
      }),
    )

    container.add(
      this.createPillButton(130, h - 90, 200, 56, '← 미술실로', PALETTE_DANGER, () =>
        this.backToArtRoom(),
      ),
    )
  }

  private startSingleplayer() {
    if (this.state !== 'modeSelect') return
    // 혼자 모드는 기존 ArtFreeDrawingScene 단독 플로우. 본 로비/멀티 리소스는 정리하지 않아도 다음 씬에서 재초기화됨.
    fadeToScene(this, 'ArtFreeDrawingScene', { duration: 220 })
  }

  // ─────────────────────────────────────────────────────────────────────────
  // multi hub (Step 2: 방 만들기 + 방 목록 한 화면)

  private showMultiHub() {
    // 진입 경로: 멀티 버튼 클릭 / 방 생성·입장 실패 복구. lobby/leaving 에서만 진입 차단.
    if (this.state === 'lobby' || this.state === 'leaving') return
    this.state = 'multiHub'
    this.tearDownLobby()
    this.drawMultiHub()
    this.setStatus('')
    this.startHubPolling()
    void this.fetchWaitingRooms()
  }

  private startHubPolling() {
    this.stopHubPolling()
    this.hubPollTimer = this.time.addEvent({
      delay: HUB_POLL_INTERVAL_MS,
      loop: true,
      callback: () => {
        if (this.state !== 'multiHub') return
        void this.fetchWaitingRooms({ silent: true })
      },
    })
  }

  private stopHubPolling() {
    this.hubPollTimer?.remove(false)
    this.hubPollTimer = null
  }

  private async fetchWaitingRooms(opts: { silent?: boolean } = {}) {
    const token = ++this.hubFetchToken
    if (!opts.silent) {
      this.hubLoading = true
      this.hubError = null
      if (this.state === 'multiHub') this.drawMultiHub()
    }
    try {
      const rooms = await getWaitingQuizRooms()
      if (token !== this.hubFetchToken) return
      this.hubRooms = rooms
      this.hubError = null
    } catch {
      if (token !== this.hubFetchToken) return
      if (!opts.silent) {
        this.hubError = '방 목록을 불러오지 못했어요.'
      }
    } finally {
      if (token === this.hubFetchToken) {
        this.hubLoading = false
        if (this.state === 'multiHub') this.drawMultiHub()
      }
    }
  }

  private drawMultiHub() {
    this.menuContainer?.destroy()
    const w = this.scale.width
    const h = this.scale.height
    const container = this.add.container(0, 0)
    this.root.add(container)
    this.menuContainer = container

    this.drawHeader(container, '멀티 모드')

    // 메인 패널 — cream 색 카드 안에 방 만들기 버튼 + 방 목록을 한 덩어리로 묶는다.
    // 배경(미술실) 위에 단독으로 텍스트가 떠다니던 이전 안은 산만했어서 패널로 그룹화.
    // 가로 비율은 화면 폭의 ~55% 를 목표로, 너무 작은 창에서도 양쪽 여백을 유지하도록 cap.
    const panelW = Math.min(960, w - 160)
    const panelTop = h * 0.26
    const panelBottom = h - 110
    const panelH = panelBottom - panelTop
    const panelX = w / 2 - panelW / 2

    this.drawCreamPanel(container, panelX, panelTop, panelW, panelH)

    // 패널 내부 패딩.
    const padX = 28
    const innerX = panelX + padX
    const innerW = panelW - padX * 2
    let cursorY = panelTop + 24

    // 방 만들기 — 컴팩트 사각 버튼. 패널 가로폭이 커졌으니 버튼도 비례로 키움.
    const createBtnW = 360
    const createBtnH = 68
    container.add(
      this.createCompactActionButton(
        w / 2,
        cursorY + createBtnH / 2,
        createBtnW,
        createBtnH,
        '+ 방 만들기',
        COLOR_WARM,
        COLOR_WARM_DARK,
        () => this.startCreate(),
      ),
    )
    cursorY += createBtnH + 20

    // 구분선 — 패널 안에서 "만들기" / "참여" 두 영역 분리.
    const divider = this.add.graphics()
    divider.lineStyle(1, 0xa8845a, 0.4)
    divider.lineBetween(innerX, cursorY, innerX + innerW, cursorY)
    container.add(divider)
    cursorY += 14

    // 방 목록 헤더 — 좌측 라벨, 우측 새로고침.
    const headerLabel = this.add
      .text(innerX, cursorY + 14, this.hubLoading ? '방 목록 불러오는 중…' : '입장 가능한 방', {
        fontFamily: FONT_FAMILY,
        fontSize: '18px',
        color: '#3a2614',
        fontStyle: 'bold',
      })
      .setOrigin(0, 0.5)
    container.add(headerLabel)
    container.add(
      this.createMiniPillButton(innerX + innerW - 50, cursorY + 14, 96, 32, '새로고침', () => {
        if (this.hubLoading) return
        void this.fetchWaitingRooms()
      }),
    )
    cursorY += 36

    // 방 목록 본문 — mask 로 visible 영역을 클립하고, 안쪽 컨테이너를 wheel 로 위아래 이동시켜 스크롤.
    // 스크롤바는 의도적으로 그리지 않음. 카드가 영역 밖으로 잘리는 시각적 단서가 곧 "더 있음" 신호.
    const listTop = cursorY
    const listBottom = panelBottom - 24
    const listH = Math.max(120, listBottom - listTop)
    const listLeft = innerX
    this.hubListArea = {
      left: listLeft,
      top: listTop,
      right: listLeft + innerW,
      bottom: listBottom,
    }

    // 옛 mask 정리. drawMultiHub 는 fetch / hover 시마다 재호출되므로 누수 막기 위해 매번 새로 만든다.
    this.hubListMask?.destroy()
    this.hubListMask = null
    this.hubListContainer = null

    if (this.hubRooms.length === 0) {
      const emptyMsg = this.hubError
        ? this.hubError
        : this.hubLoading
          ? '방 목록을 불러오는 중…'
          : '아직 만들어진 방이 없어요.\n위에서 새 방을 만들어줘!'
      const empty = this.add
        .text(w / 2, listTop + listH / 2, emptyMsg, {
          fontFamily: FONT_FAMILY,
          fontSize: '17px',
          color: '#8a6b3e',
          align: 'center',
        })
        .setOrigin(0.5)
      container.add(empty)
      return
    }

    const cardH = 80
    const gap = 12
    const listContainer = this.add.container(w / 2, listTop)
    container.add(listContainer)
    this.hubListContainer = listContainer

    let y = cardH / 2
    this.hubRooms.forEach(room => {
      listContainer.add(this.createRoomCard(0, y, innerW, cardH, room))
      y += cardH + gap
    })
    const totalContentH = y - gap // 마지막 gap 빼기

    const maskShape = this.make.graphics({})
    maskShape.fillStyle(0xffffff, 1)
    maskShape.fillRect(listLeft, listTop, innerW, listH)
    this.hubListMask = maskShape
    listContainer.setMask(maskShape.createGeometryMask())

    // 스크롤 범위. 초기 listContainer.y = listTop (최상단). 위로 끝까지 스크롤하면 마지막 카드가 listBottom 에 닿음.
    const overflow = Math.max(0, totalContentH - listH)
    this.hubListMaxY = listTop
    this.hubListMinY = listTop - overflow
    listContainer.y = Phaser.Math.Clamp(listContainer.y, this.hubListMinY, this.hubListMaxY)

    // 뒤로 버튼 — 패널 좌상단 안쪽에 통합. 좌하단에 두던 이전 안은 패널이 크면 시각적으로 가려졌음.
    container.add(
      this.createPillButton(panelX + 64, panelTop + 30, 110, 38, '← 뒤로', PALETTE_DANGER, () =>
        this.showModeSelect(),
      ),
    )
  }

  /** cream 톤 라운드 패널 — modeSelect 의 큰 카드와 톤 통일. drop shadow + 따뜻한 갈색 보더. */
  private drawCreamPanel(
    container: Phaser.GameObjects.Container,
    x: number,
    y: number,
    w: number,
    h: number,
  ) {
    const g = this.add.graphics()
    const radius = 24
    // shadow
    for (let i = 0; i < 5; i++) {
      const spread = i * 2
      g.fillStyle(0x000000, 0.06)
      g.fillRoundedRect(
        x - spread,
        y + 6 + spread * 0.6,
        w + spread * 2,
        h + spread,
        radius + spread,
      )
    }
    // surface
    g.fillStyle(0xfcf8f0, 1)
    g.fillRoundedRect(x, y, w, h, radius)
    // border
    g.lineStyle(3, 0xa8845a, 1)
    g.strokeRoundedRect(x, y, w, h, radius)
    // inner highlight band
    g.lineStyle(1, 0xffffff, 0.5)
    g.strokeRoundedRect(x + 4, y + 4, w - 8, h - 8, radius - 4)
    container.add(g)
  }

  /** 컴팩트 사각 버튼 — drop shadow + accent fill. modeSelect 의 큰 카드를 축소한 형태. */
  private createCompactActionButton(
    cx: number,
    cy: number,
    w: number,
    h: number,
    label: string,
    fill: number,
    shadow: number,
    onClick: () => void,
  ): Phaser.GameObjects.Container {
    const container = this.add.container(cx, cy)
    const radius = 18
    const thickness = 6

    const hit = this.add.rectangle(0, 0, w + 4, h + thickness + 4, 0xffffff, 0.001).setOrigin(0.5)
    hit.setInteractive({ useHandCursor: true })

    const g = this.add.graphics()
    const draw = (hovered: boolean) => {
      g.clear()
      g.fillStyle(shadow, 1)
      g.fillRoundedRect(-w / 2, -h / 2, w, h + thickness, radius)
      g.fillStyle(hovered ? brighten(fill) : fill, 1)
      g.fillRoundedRect(-w / 2, -h / 2 - (hovered ? 2 : 0), w, h, radius)
    }
    draw(false)

    const text = this.add
      .text(0, 0, label, {
        fontFamily: FONT_FAMILY,
        fontSize: '22px',
        color: '#ffffff',
        fontStyle: 'bold',
        stroke: '#1a0e05',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
    container.add([hit, g, text])

    hit.on(Phaser.Input.Events.POINTER_OVER, () => draw(true))
    hit.on(Phaser.Input.Events.POINTER_OUT, () => draw(false))
    hit.on(Phaser.Input.Events.POINTER_DOWN, onClick)
    return container
  }

  /** 작은 라운드 pill 버튼 — 패널 안 새로고침 등 보조 액션. */
  private createMiniPillButton(
    cx: number,
    cy: number,
    w: number,
    h: number,
    label: string,
    onClick: () => void,
  ): Phaser.GameObjects.Container {
    const container = this.add.container(cx, cy)
    const radius = h / 2

    const hit = this.add.rectangle(0, 0, w, h, 0xffffff, 0.001).setOrigin(0.5)
    hit.setInteractive({ useHandCursor: true })

    const g = this.add.graphics()
    const draw = (hovered: boolean) => {
      g.clear()
      g.fillStyle(hovered ? 0xfcf8f0 : 0xfff8e7, 1)
      g.fillRoundedRect(-w / 2, -h / 2, w, h, radius)
      g.lineStyle(2, 0xa8845a, 1)
      g.strokeRoundedRect(-w / 2, -h / 2, w, h, radius)
    }
    draw(false)

    const text = this.add
      .text(0, 0, label, {
        fontFamily: FONT_FAMILY,
        fontSize: '13px',
        color: '#6a4a26',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
    container.add([hit, g, text])

    hit.on(Phaser.Input.Events.POINTER_OVER, () => draw(true))
    hit.on(Phaser.Input.Events.POINTER_OUT, () => draw(false))
    hit.on(Phaser.Input.Events.POINTER_DOWN, onClick)
    return container
  }

  private createRoomCard(
    cx: number,
    cy: number,
    w: number,
    h: number,
    room: QuizRoomListItem,
  ): Phaser.GameObjects.Container {
    const container = this.add.container(cx, cy)
    const full = room.memberCount >= room.maxPlayers
    const radius = 16

    const hit = this.add.rectangle(0, 0, w, h, 0xffffff, 0.001).setOrigin(0.5)
    hit.setInteractive({ useHandCursor: !full })

    const g = this.add.graphics()
    const draw = (hovered: boolean) => {
      g.clear()
      // cream 패널 위에 올라가는 카드 — 같은 워밍 톤 패밀리. full 일 땐 채도/대비를 죽임.
      g.fillStyle(full ? 0xefe7d4 : hovered ? 0xfff8e7 : 0xfff3da, 1)
      g.fillRoundedRect(-w / 2, -h / 2, w, h, radius)
      g.lineStyle(2, full ? 0xc9b890 : hovered ? 0xd76a1f : 0xc9a888, 1)
      g.strokeRoundedRect(-w / 2, -h / 2, w, h, radius)
    }
    draw(false)

    const padLeft = -w / 2 + 22
    const padRight = w / 2 - 18
    const hostName = this.add
      .text(padLeft, -10, `${room.hostNickname || '이름없음'}의 방`, {
        fontFamily: FONT_FAMILY,
        fontSize: '19px',
        color: full ? '#9a8966' : '#3a2614',
        fontStyle: 'bold',
      })
      .setOrigin(0, 0.5)
    const meta = this.add
      .text(padLeft, 14, `${room.memberCount} / ${room.maxPlayers}명`, {
        fontFamily: FONT_FAMILY,
        fontSize: '13px',
        color: full ? '#a8956d' : '#8a5a1a',
        fontStyle: 'bold',
      })
      .setOrigin(0, 0.5)

    // 우측 입장 pill.
    const pillW = 80
    const pillH = 36
    const pillX = padRight - pillW / 2
    const pillFill = full ? 0xb8a98a : 0xd76a1f
    const pillG = this.add.graphics()
    pillG.fillStyle(pillFill, 1)
    pillG.fillRoundedRect(pillX - pillW / 2, -pillH / 2, pillW, pillH, pillH / 2)
    const pillLabel = this.add
      .text(pillX, 0, full ? '꽉 참' : '입장', {
        fontFamily: FONT_FAMILY,
        fontSize: '15px',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)

    container.add([hit, g, hostName, meta, pillG, pillLabel])

    if (!full) {
      hit.on(Phaser.Input.Events.POINTER_OVER, () => draw(true))
      hit.on(Phaser.Input.Events.POINTER_OUT, () => draw(false))
      hit.on(Phaser.Input.Events.POINTER_DOWN, () => this.handleRoomCardClick(room))
    }
    return container
  }

  private handleRoomCardClick(room: QuizRoomListItem) {
    if (this.state !== 'multiHub') return
    this.stopHubPolling()
    this.state = 'joining'
    this.setStatus('방에 입장하는 중…')
    void this.joinRoomWithStaleCleanup(room.roomId)
  }

  /**
   * ESC 키 — 현재 화면 단계에서 한 단계 뒤로. multiHub → modeSelect → 미술실, 로비에서는 방 나가기.
   * 작업 진행 중 상태(creating/joining/starting/transitioningToPlay/leaving) 에선 무시.
   */
  private handleEscKey() {
    if (this.state === 'multiHub') {
      this.showModeSelect()
    } else if (this.state === 'modeSelect') {
      this.backToArtRoom()
    } else if (this.state === 'lobby') {
      // ESC = 한 단계 뒤로(방 떠나고 방 목록으로). 완전 종료(미술실)는 우상단 X 만 담당.
      void this.leaveBackToHub()
    }
  }

  /**
   * 방 목록 영역 안에서만 wheel 을 받아 listContainer 를 위아래로 이동. 영역 밖이거나 multiHub 가 아닐 땐 무시.
   * 스크롤바는 그리지 않고, 카드가 영역 가장자리로 잘리는 모습이 곧 시각 단서가 된다.
   */
  private handleHubWheel(
    pointer: Phaser.Input.Pointer,
    _gameObjects: Phaser.GameObjects.GameObject[],
    _dx: number,
    dy: number,
  ) {
    if (this.state !== 'multiHub') return
    const area = this.hubListArea
    const list = this.hubListContainer
    if (!area || !list) return
    if (pointer.x < area.left || pointer.x > area.right) return
    if (pointer.y < area.top || pointer.y > area.bottom) return
    const next = list.y - dy * 0.5
    list.y = Phaser.Math.Clamp(next, this.hubListMinY, this.hubListMaxY)
  }

  private drawHeader(
    container: Phaser.GameObjects.Container,
    titleText: string,
    subtitleText?: string,
  ) {
    const w = this.scale.width
    const h = this.scale.height
    const titleY = h * 0.18
    const title = this.add
      .text(w / 2, titleY, titleText, {
        fontFamily: FONT_FAMILY,
        fontSize: '56px',
        color: '#ffffff',
        fontStyle: 'bold',
        stroke: '#1a0e05',
        strokeThickness: 8,
        shadow: { offsetX: 0, offsetY: 4, color: '#000', blur: 8, fill: true },
      })
      .setOrigin(0.5)
    container.add(title)
    if (subtitleText) {
      const subtitle = this.add
        .text(w / 2, titleY + 70, subtitleText, {
          fontFamily: FONT_FAMILY,
          fontSize: '22px',
          color: '#ffe9c2',
          stroke: '#1a0e05',
          strokeThickness: 4,
        })
        .setOrigin(0.5)
      container.add(subtitle)
    }
  }

  private startCreate() {
    if (this.state !== 'multiHub') return
    this.stopHubPolling()
    this.state = 'creating'
    this.setStatus('방 만드는 중…')
    this.tearDownMenu()
    void this.createRoomWithStaleCleanup()
  }

  /**
   * 방 생성 시 Q-004(이미 방에 있음) 가 떨어지면 BE 가 들고 있는 stale 방을 정리하고 한 번 더 시도. 페이지 새로고침/이탈 등으로 이전 세션이
   * 깔끔하게 정리되지 못한 케이스를 자동 복구한다. (BE 의 WS disconnect 정리 흐름은 별도 카드)
   */
  private async createRoomWithStaleCleanup() {
    try {
      const snapshot = await createQuizRoom()
      await this.enterLobby(snapshot)
    } catch (error) {
      if (isAlreadyInRoomError(error)) {
        try {
          await leaveQuizRoom()
          const snapshot = await createQuizRoom()
          await this.enterLobby(snapshot)
          return
        } catch (retryError) {
          this.setStatus(extractMessage(retryError, '방 생성에 실패했어요. 잠시 후 다시 시도해줘.'))
          this.showMultiHub()
          return
        }
      }
      this.setStatus(extractMessage(error, '방 생성에 실패했어요. 잠시 후 다시 시도해줘.'))
      this.showMultiHub()
    }
  }

  /**
   * 입장 시 Q-004 가 떨어지면 stale 정리 후 재시도 — createRoomWithStaleCleanup 과 동일 사유.
   * BE 의 roomId 와 code 는 같은 값이므로 joinQuizRoom(code) 에 그대로 roomId 를 넘긴다.
   */
  private async joinRoomWithStaleCleanup(roomId: string) {
    try {
      const snapshot = await joinQuizRoom(roomId)
      await this.enterLobby(snapshot)
    } catch (error) {
      if (isAlreadyInRoomError(error)) {
        try {
          await leaveQuizRoom()
          const snapshot = await joinQuizRoom(roomId)
          await this.enterLobby(snapshot)
          return
        } catch (retryError) {
          this.setStatus(extractMessage(retryError, '입장에 실패했어요. 다른 방을 골라줘.'))
          this.showMultiHub()
          return
        }
      }
      this.setStatus(extractMessage(error, '입장에 실패했어요. 다른 방을 골라줘.'))
      this.showMultiHub()
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // lobby

  private async enterLobby(snapshot: QuizRoomSnapshot) {
    this.stopHubPolling()
    this.tearDownMenu()
    this.snapshot = snapshot
    this.currentUserId = await this.resolveCurrentUserId()
    this.selectedTotalRounds = normalizeRoundOption(snapshot.totalRounds)
    this.state = 'lobby'
    this.setStatus('')
    this.connectRealtime(snapshot)
    this.drawLobby()
  }

  private enterTransferredLobby(data: QuizLobbySceneInit) {
    this.stopHubPolling()
    this.tearDownMenu()
    this.snapshot = data.snapshot
    this.currentUserId = data.currentUserId
    this.realtimeClient = data.realtimeClient
    this.selectedTotalRounds = normalizeRoundOption(data.snapshot.totalRounds)
    this.state = 'lobby'
    this.pendingPrompt = null
    if (this.realtimeClient) {
      this.attachRealtimeHandlers(this.realtimeClient)
    } else {
      this.connectRealtime(data.snapshot)
    }
    this.drawLobby()
    this.setStatus(data.statusMessage ?? '')
    if (this.currentUserId === null) {
      void this.resolveCurrentUserId().then(userId => {
        if (this.state !== 'lobby') return
        this.currentUserId = userId
        this.drawLobby()
      })
    }
  }

  private async resolveCurrentUserId(): Promise<number | null> {
    const token = await ensureFreshAccessToken()
    return token ? extractUserIdFromToken(token) : null
  }

  private connectRealtime(snapshot: QuizRoomSnapshot) {
    this.realtimeClient = new QuizRealtimeClient({
      roomId: snapshot.roomId,
      stompRoomKey: snapshot.stompRoomKey,
      getAccessToken: () => ensureFreshAccessToken(),
      onSnapshot: next => {
        this.snapshot = next
        this.drawLobby()
      },
      // BE 가 /start 직후 출제자에게 보내는 제시어 push 를 받아 stash. 자세한 사유는
      // pendingPrompt 필드 주석 참고. 호스트가 본인의 1라운드 drawer 일 때 화면 race
      // 를 막아주는 핵심 경로.
      onPrompt: prompt => {
        this.pendingPrompt = prompt
      },
      onEvent: event => this.handleRealtimeEvent(event),
      onError: error => this.setStatus(friendlyWsError(error.message)),
      onReady: () => this.setStatus(''),
    })
    this.realtimeClient.connect()
  }

  private attachRealtimeHandlers(client: QuizRealtimeClient) {
    client.setHandlers(this.createRealtimeHandlers())
  }

  private createRealtimeHandlers() {
    return {
      onSnapshot: (next: QuizRoomSnapshot) => {
        this.snapshot = next
        if (next.status === 'WAITING') {
          this.selectedTotalRounds = normalizeRoundOption(next.totalRounds)
        }
        this.drawLobby()
      },
      onPrompt: (prompt: PromptAssignment) => {
        this.pendingPrompt = prompt
      },
      onEvent: (event: QuizRoomEvent) => this.handleRealtimeEvent(event),
      onError: (error: Error) => this.setStatus(friendlyWsError(error.message)),
      onReady: () => this.setStatus(''),
    }
  }

  private handleRealtimeEvent(event: QuizRoomEvent) {
    if (!this.snapshot) return
    if (event.type === 'member_joined') {
      const existing = this.snapshot.members.some(m => m.userId === event.member.userId)
      if (!existing) {
        this.snapshot = {
          ...this.snapshot,
          members: [...this.snapshot.members, event.member],
        }
      }
    } else if (event.type === 'member_left') {
      this.snapshot = {
        ...this.snapshot,
        members: this.snapshot.members.filter(m => m.userId !== event.userId),
      }
    } else if (event.type === 'host_changed') {
      this.snapshot = {
        ...this.snapshot,
        hostUserId: event.hostUserId,
        members: this.snapshot.members.map(m => ({ ...m, isHost: m.userId === event.hostUserId })),
      }
    } else if (event.type === 'status_changed') {
      this.snapshot = { ...this.snapshot, status: event.status }
    } else if (event.type === 'room_reset') {
      this.snapshot = {
        ...this.snapshot,
        status: event.status,
        hostUserId: event.hostUserId,
        members: event.members,
        roundNumber: event.roundNumber,
        currentDrawerUserId: event.currentDrawerUserId,
        roundEndsAtEpochMillis: null,
      }
      this.pendingPrompt = null
      this.selectedTotalRounds = normalizeRoundOption(this.snapshot.totalRounds)
      this.state = 'lobby'
      this.setStatus(event.message ?? '')
    } else if (event.type === 'round_started') {
      // 게스트 진입 경로: 호스트가 /start 호출 → BE broadcast → 여기서 플레이 씬 전이.
      // 호스트는 REST 응답 핸들러에서 직접 전이하므로(이미 state=transitioningToPlay), 중복 호출 안 됨.
      this.snapshot = {
        ...this.snapshot,
        status: event.status,
        roundNumber: event.roundNumber,
        currentDrawerUserId: event.currentDrawerUserId,
        roundEndsAtEpochMillis: event.roundEndsAtEpochMillis,
        totalRounds: event.totalRounds,
      }
      this.transitionToPlayScene(this.snapshot, null, event.wordLength)
      return
    }
    this.drawLobby()
  }

  private transitionToPlayScene(
    snapshot: QuizRoomSnapshot,
    prompt: PromptAssignment | null,
    wordLength?: number,
  ) {
    if (this.state === 'transitioningToPlay' || this.state === 'leaving') return
    this.state = 'transitioningToPlay'
    const realtimeClient = this.realtimeClient
    this.realtimeClient = null
    // 호스트의 1라운드 race: WS roundStarted 가 REST /start .then() 보다 먼저 도착하면
    // 본 함수가 prompt=null 로 호출된다. BE 의 sendPromptToUser push 는 그 사이/페이드
    // 중에도 도착할 수 있으니, onPrompt 는 노옵 하지 말고 stash 를 계속 유지.
    realtimeClient?.setHandlers({
      onSnapshot: () => {},
      onPrompt: nextPrompt => {
        this.pendingPrompt = nextPrompt
      },
      onEvent: () => {},
      onError: () => {},
    })
    // 페이드 종료 시점에 prompt 를 한 번 더 resolve — 220ms 페이드 동안 늦게 도착한 push
    // 까지 픽업한다. fadeToScene 유틸리티는 data 를 호출 시점에 캡처하므로 여기선 수동 전개.
    const duration = 220
    this.cameras.main.fadeOut(duration, 0, 0, 0)
    this.time.delayedCall(duration, () => {
      const effectivePrompt = prompt ?? this.pendingPrompt
      this.scene.start('QuizPlayScene', {
        snapshot,
        currentUserId: this.currentUserId,
        prompt: effectivePrompt,
        wordLength: wordLength ?? effectivePrompt?.word.length ?? null,
        realtimeClient,
      })
    })
  }

  private drawLobby() {
    if (!this.snapshot) return
    this.lobbyContainer?.destroy()
    const w = this.scale.width
    const h = this.scale.height
    const container = this.add.container(0, 0)
    this.root.add(container)
    this.lobbyContainer = container

    // 헤더 — 방장 닉네임을 노출해 "○○의 방" 로 알아볼 수 있게. 코드 공유 흐름이 사라져서
    // 이전의 6자리 코드 박스는 제거.
    const hostMember = this.snapshot.members.find(m => m.userId === this.snapshot?.hostUserId)
    const hostNickname = hostMember?.nickname ?? ''
    const headerY = h * 0.16
    const header = this.add
      .text(w / 2, headerY, hostNickname ? `${hostNickname}의 방` : '멀티 퀴즈 방', {
        fontFamily: FONT_FAMILY,
        fontSize: '40px',
        color: '#ffffff',
        fontStyle: 'bold',
        stroke: '#1a0e05',
        strokeThickness: 6,
        shadow: { offsetX: 0, offsetY: 4, color: '#000', blur: 8, fill: true },
      })
      .setOrigin(0.5)
    const subtitle = this.add
      .text(w / 2, headerY + 48, '친구들이 들어오면 게임을 시작할 수 있어요', {
        fontFamily: FONT_FAMILY,
        fontSize: '16px',
        color: '#ffe9c2',
        stroke: '#1a0e05',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
    container.add([header, subtitle])

    // 멤버 슬롯 — 기존 4인 스냅샷으로 들어와도 6인 룸 기준 슬롯을 먼저 보여준다.
    const visibleSlots = Math.max(
      MIN_VISIBLE_PLAYER_SLOTS,
      this.snapshot.maxPlayers,
      this.snapshot.members.length,
    )
    const slotW = Math.min(180, (w - 80) / visibleSlots - 20)
    const slotH = 220
    const slotGap = 20
    const totalW = visibleSlots * slotW + (visibleSlots - 1) * slotGap
    const slotY = h * 0.56
    let cursorX = w / 2 - totalW / 2 + slotW / 2

    for (let i = 0; i < visibleSlots; i++) {
      const member = this.snapshot.members[i] ?? null
      const slot = this.createMemberSlot(cursorX, slotY, slotW, slotH, member, i)
      container.add(slot)
      cursorX += slotW + slotGap
    }

    // 액션 버튼 — 시작은 큰 게임 버튼, 나가기는 pill.
    const isHost = this.snapshot.hostUserId === this.currentUserId
    const canStart = isHost && this.snapshot.members.length >= this.snapshot.minPlayers
    const buttonY = h - 92

    if (isHost) {
      this.drawRoundSelector(container, w / 2, buttonY - 74)
      this.drawStartButton(container, w / 2, buttonY, '게임 시작', canStart)
    } else {
      const waitText = this.add
        .text(w / 2, buttonY, '방장이 시작하면 출발!', {
          fontFamily: FONT_FAMILY,
          fontSize: '18px',
          color: '#fff4dc',
          stroke: '#1a0e05',
          strokeThickness: 3,
        })
        .setOrigin(0.5)
      container.add(waitText)
    }

    // 좌상단 "← 뒤로" — 방을 떠나고 방 목록 화면으로 복귀. ESC 와 동일 동작.
    container.add(
      this.createPillButton(
        80,
        32,
        110,
        38,
        '← 뒤로',
        PALETTE_DANGER,
        () => void this.leaveBackToHub(),
      ),
    )
    // 우측 상단 X 버튼 — 방 떠나고 미술실로 완전 종료.
    container.add(this.createCloseButton(w - 28, 28, () => this.handleLeave()))
  }

  /**
   * 우측 상단 모달 close 버튼 — 작은 라운드 사각형 + X 글리프. 빨강 톤(PALETTE_DANGER) 으로 위험/종료 신호.
   */
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
      g.fillStyle(PALETTE_DANGER.accent, hovered ? 1 : 0.92)
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

  private drawRoundSelector(container: Phaser.GameObjects.Container, cx: number, cy: number) {
    const optionW = 56
    const optionH = 40
    const gap = 10
    const labelW = 86
    const panelW = labelW + ROUND_OPTIONS.length * optionW + (ROUND_OPTIONS.length - 1) * gap + 28
    const panelH = 54

    const panel = this.add.graphics()
    panel.fillStyle(0x1a2230, 0.92)
    panel.fillRoundedRect(cx - panelW / 2, cy - panelH / 2, panelW, panelH, 16)
    panel.lineStyle(2, 0xffe9c2, 0.35)
    panel.strokeRoundedRect(cx - panelW / 2, cy - panelH / 2, panelW, panelH, 16)
    container.add(panel)

    container.add(
      this.add
        .text(cx - panelW / 2 + 18, cy, '라운드', {
          fontFamily: FONT_FAMILY,
          fontSize: '17px',
          color: '#ffe9c2',
          fontStyle: 'bold',
        })
        .setOrigin(0, 0.5),
    )

    let x = cx - panelW / 2 + labelW + optionW / 2
    ROUND_OPTIONS.forEach(rounds => {
      const selected = rounds === this.selectedTotalRounds
      const button = this.add.graphics()
      button.fillStyle(selected ? 0xffc45f : 0x34445e, 1)
      button.fillRoundedRect(x - optionW / 2, cy - optionH / 2, optionW, optionH, 12)
      button.lineStyle(2, selected ? 0xfff3c4 : 0x7d8aa3, 1)
      button.strokeRoundedRect(x - optionW / 2, cy - optionH / 2, optionW, optionH, 12)
      const hit = this.add.rectangle(x, cy, optionW, optionH, 0xffffff, 0.001).setOrigin(0.5)
      hit.setInteractive({ useHandCursor: true })
      hit.on(Phaser.Input.Events.POINTER_DOWN, () => {
        this.selectedTotalRounds = rounds
        this.drawLobby()
      })
      const text = this.add
        .text(x, cy, `${rounds}R`, {
          fontFamily: FONT_FAMILY,
          fontSize: '16px',
          color: selected ? '#3a2614' : '#ffffff',
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
      container.add([button, hit, text])
      x += optionW + gap
    })
  }

  private drawStartButton(
    container: Phaser.GameObjects.Container,
    cx: number,
    cy: number,
    label: string,
    enabled: boolean,
  ) {
    const w = 320
    const h = 72
    const radius = h / 2
    const fill = enabled ? 0x6aaa64 : 0x4a5468
    const shadow = enabled ? 0x447f3e : 0x2a3344

    const hit = this.add.rectangle(cx, cy, w + 4, h + 12, 0xffffff, 0.001).setOrigin(0.5)
    hit.setInteractive({ useHandCursor: enabled })

    const g = this.add.graphics()
    const draw = (hovered: boolean) => {
      g.clear()
      // 외부 부드러운 그림자
      for (let i = 0; i < 4; i++) {
        g.fillStyle(0x000000, 0.07)
        g.fillRoundedRect(cx - w / 2 - i, cy - h / 2 + 4 + i, w + i * 2, h + i, radius + i)
      }
      // 하단 두께
      g.fillStyle(shadow, 1)
      g.fillRoundedRect(cx - w / 2, cy - h / 2, w, h + 8, radius)
      // 윗 면
      g.fillStyle(enabled && hovered ? brighten(fill) : fill, 1)
      g.fillRoundedRect(cx - w / 2, cy - h / 2 - (enabled && hovered ? 2 : 0), w, h, radius)
    }
    draw(false)

    const text = this.add
      .text(cx, cy, label, {
        fontFamily: FONT_FAMILY,
        fontSize: '22px',
        color: enabled ? '#ffffff' : '#b8c3d2',
        fontStyle: 'bold',
        stroke: '#1a0e05',
        strokeThickness: enabled ? 4 : 0,
      })
      .setOrigin(0.5)
    container.add([hit, g, text])

    if (enabled) {
      hit.on(Phaser.Input.Events.POINTER_OVER, () => {
        draw(true)
        text.y = cy - 2
      })
      hit.on(Phaser.Input.Events.POINTER_OUT, () => {
        draw(false)
        text.y = cy
      })
      hit.on(Phaser.Input.Events.POINTER_DOWN, () => this.handleStartGame())
    }
  }

  private createMemberSlot(
    cx: number,
    cy: number,
    w: number,
    h: number,
    member: QuizRoomSnapshot['members'][number] | null,
    slotIndex: number,
  ) {
    const container = this.add.container(cx, cy)
    const isMyself = !!member && member.userId === this.currentUserId
    const isHost = !!member && member.isHost

    // 다크 카드 + 강조 보더. host 일 땐 노란 강조, 빈 슬롯은 흐릿한 점선 톤.
    const g = this.add.graphics()
    if (!member) {
      // 빈 슬롯: 어두운 박스 + 점선 느낌 외곽 (Phaser graphic 으론 진짜 점선 비싸서, 옅은 alpha 더블 스트로크로 흉내)
      g.fillStyle(0x1b2435, 0.9)
      g.fillRoundedRect(-w / 2, -h / 2, w, h, 18)
      g.lineStyle(2, 0x4a5468, 0.7)
      g.strokeRoundedRect(-w / 2, -h / 2, w, h, 18)
    } else {
      g.fillStyle(isHost ? 0xf4a64a : 0x2a3850, 1)
      g.fillRoundedRect(-w / 2, -h / 2, w, h, 18)
      g.lineStyle(3, isMyself ? 0xffe9c2 : isHost ? 0xc77a1f : 0x3a4a62, 1)
      g.strokeRoundedRect(-w / 2, -h / 2, w, h, 18)
    }
    container.add(g)

    // 슬롯 내 vertical anchor — 빈/채워진 카드 모두 동일 위치를 사용해 줄이 흐트러지지 않게.
    // NPC 캐릭터 상반신은 아바타 박스 안에서 살짝 위로. name/role 과 16px+ 의 호흡공간을 둔다.
    const avatarY = -h / 2 + 64
    const nameY = -h / 2 + 158
    const roleY = -h / 2 + 188

    if (!member) {
      const slotLabel = this.add
        .text(0, avatarY, `${slotIndex + 1}P`, {
          fontFamily: FONT_FAMILY,
          fontSize: '36px',
          color: '#4a5468',
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
      const empty = this.add
        .text(0, nameY, '비어 있어요', {
          fontFamily: FONT_FAMILY,
          fontSize: '14px',
          color: '#7d8aa3',
        })
        .setOrigin(0.5)
      container.add([slotLabel, empty])
      return container
    }

    // 게임 씬과 동일하게 char1~4 상반신만 setCrop 으로 노출. 텍스처 미로드 시 글자 폴백.
    const avatarKey = slotCharKeyForMember(member.joinOrder, this.snapshot?.roomId ?? '')
    const avatarSize = Math.min(96, w * 0.6)
    if (this.textures.exists(avatarKey)) {
      const source = this.textures.get(avatarKey).getSourceImage() as HTMLImageElement
      const srcH = source.height || 1
      const srcW = source.width || 1
      const cropH = srcH * SLOT_CHAR_CROP_RATIO
      const scale = avatarSize / cropH
      const npc = this.add.image(0, avatarY, avatarKey)
      npc.setScale(scale)
      npc.setOrigin(0.5, SLOT_CHAR_CROP_RATIO / 2)
      npc.setCrop(0, 0, srcW, cropH)
      container.add(npc)
    } else {
      const initial = (member.nickname || '?').slice(0, 1)
      const fallback = this.add
        .text(0, avatarY, initial, {
          fontFamily: FONT_FAMILY,
          fontSize: '54px',
          color: isHost ? '#3a2614' : '#ffe9c2',
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
      container.add(fallback)
    }
    const name = this.add
      .text(0, nameY, member.nickname, {
        fontFamily: FONT_FAMILY,
        fontSize: '18px',
        color: isHost ? '#1a0e05' : '#ffffff',
        fontStyle: 'bold',
        wordWrap: { width: w - 16 },
        align: 'center',
      })
      .setOrigin(0.5)
    const role = this.add
      .text(0, roleY, isHost ? '방장' : '참여자', {
        fontFamily: FONT_FAMILY,
        fontSize: '13px',
        color: isHost ? '#5a3818' : '#c5d0e3',
      })
      .setOrigin(0.5)
    container.add([name, role])

    if (isHost) {
      const badge = this.add
        .text(-w / 2 + 12, -h / 2 + 12, '🖌', {
          fontFamily: FONT_FAMILY,
          fontSize: '20px',
        })
        .setOrigin(0, 0)
      container.add(badge)
    }
    if (isMyself) {
      const me = this.add
        .text(w / 2 - 12, -h / 2 + 12, '나', {
          fontFamily: FONT_FAMILY,
          fontSize: '12px',
          color: '#1a0e05',
          backgroundColor: '#ffe9c2',
          padding: { x: 7, y: 3 },
          fontStyle: 'bold',
        })
        .setOrigin(1, 0)
      container.add(me)
    }
    return container
  }

  private handleStartGame() {
    if (!this.snapshot) return
    if (this.state !== 'lobby') return
    const roomId = this.snapshot.roomId
    this.state = 'starting'
    this.setStatus('게임 시작 중…')
    void startQuizRoom(roomId, { totalRounds: this.selectedTotalRounds })
      .then(response => {
        // 호스트 진입 경로: REST 응답에 prompt 동봉. 토픽의 round_started 가 비슷한 시점에 도착하지만,
        // transitionToPlayScene 가 상태 가드로 중복 전이를 막는다.
        this.transitionToPlayScene(response.snapshot, response.prompt, response.prompt.word.length)
      })
      .catch(error => {
        this.setStatus(extractMessage(error, '시작에 실패했어요. 잠시 후 다시 시도해줘.'))
        this.state = 'lobby'
        this.drawLobby()
      })
  }

  private async handleLeave() {
    if (this.state === 'leaving') return
    this.state = 'leaving'
    this.setStatus('나가는 중…')
    await this.tearDownRealtime()
    try {
      await leaveQuizRoom()
    } catch {
      // 이미 떠난 상태라면 무시. UX 상 그대로 art room 으로 복귀.
    }
    this.backToArtRoom()
  }

  /**
   * "한 단계 뒤로" — 방을 떠나고 방 목록 화면으로 복귀. 완전 종료(미술실)와 분리해 두는 게
   * 자연스러운 stack-back UX. ESC / 좌상단 뒤로 버튼 공통 진입점.
   *
   * 주의: showMultiHub() 는 state 가 'lobby' / 'leaving' 이면 가드로 return 한다. 본 함수는
   * 의도적으로 hub 로 가야 하므로 leave 작업이 끝난 뒤 state 를 가드 통과 가능한 값으로
   * 리셋한 다음 showMultiHub() 를 호출한다. 이 단계를 빼먹어서 버튼/ESC 가 "안 먹는" 것처럼
   * 보이던 버그가 있었음.
   */
  private async leaveBackToHub() {
    if (this.state !== 'lobby') return
    this.state = 'leaving'
    this.setStatus('방을 떠나는 중…')
    await this.tearDownRealtime()
    try {
      await leaveQuizRoom()
    } catch {
      // 이미 떠난 상태라면 무시.
    }
    this.state = 'modeSelect'
    this.tearDownLobby()
    this.showMultiHub()
  }

  private backToArtRoom() {
    fadeToScene(this, 'ArtSelectScene', { duration: 220 })
  }

  // ─────────────────────────────────────────────────────────────────────────
  // shutdown

  private async tearDownRealtime() {
    const client = this.realtimeClient
    this.realtimeClient = null
    if (client) {
      await client.disconnect()
    }
  }

  private tearDownMenu() {
    this.menuContainer?.destroy()
    this.menuContainer = null
    // hub 잔여 자원 정리 — 로비/모드선택으로 전환 시 mask graphic 이 남아 있으면
    // 다음 화면 위에 hub 패널이 유령처럼 겹쳐 보이던 버그가 있었다.
    this.hubListMask?.destroy()
    this.hubListMask = null
    this.hubListContainer = null
    this.hubListArea = null
  }

  private tearDownLobby() {
    this.lobbyContainer?.destroy()
    this.lobbyContainer = null
  }

  private handleShutdown() {
    this.scale.off('resize', this.layout, this)
    this.stopHubPolling()
    if (this.hubWheelBound) {
      this.input.off('wheel', this.handleHubWheel, this)
      this.hubWheelBound = false
    }
    this.input.keyboard?.off('keydown-ESC', this.handleEscKey, this)
    this.hubListMask?.destroy()
    this.hubListMask = null
    void this.tearDownRealtime()
  }

  // ─────────────────────────────────────────────────────────────────────────
  // helpers

  private setStatus(text: string) {
    this.statusText.setText(text)
    this.statusText.setVisible(text.trim().length > 0)
    this.positionStatusText()
  }

  private positionStatusText() {
    const y = this.state === 'lobby' ? this.scale.height - 24 : this.scale.height - 56
    this.statusText.setPosition(this.scale.width / 2, y)
  }

  /**
   * 게임 느낌의 큰 선택 버튼. 채도 높은 색 + 짙은 하단 두께(3D) + 흰 외곽선 + 큰 이모지 + 타이틀/설명.
   *
   * <p>클릭 영역은 시각 바운드 전체와 항상 일치해야 한다 — 컨테이너에 Geom.Rectangle hit area 를 거는 방식은 자식 그래픽이 영역 밖으로 삐져나오면
   * 시각 ≠ 클릭 이슈가 생기므로, 투명 Rectangle 게임오브젝트를 hit zone 으로 깔고 그 위에 그래픽/텍스트를 쌓는다.
   */
  private createBigButton(
    cx: number,
    cy: number,
    w: number,
    h: number,
    config: {
      icon: string
      title: string
      desc: string
      fill: number
      shadow: number
      onClick: () => void
    },
  ) {
    const { icon, title, desc, fill, shadow, onClick } = config
    const container = this.add.container(cx, cy)
    const radius = 28
    const thickness = 12
    const dropOffset = 8
    const liftAmount = 4

    const hitW = w + 4
    const hitH = h + thickness + dropOffset + 4
    const hitY = (thickness + dropOffset) / 2 - 2
    const hit = this.add.rectangle(0, hitY, hitW, hitH, 0xffffff, 0.001).setOrigin(0.5)
    hit.setInteractive({ useHandCursor: true })

    const shadowG = this.add.graphics()
    const faceG = this.add.graphics()
    const drawButton = (lifted: boolean) => {
      const lift = lifted ? liftAmount : 0
      shadowG.clear()
      const shadowSteps = 5
      for (let i = 0; i < shadowSteps; i++) {
        const spread = i * 2
        shadowG.fillStyle(0x000000, 0.06)
        shadowG.fillRoundedRect(
          -w / 2 - spread,
          -h / 2 + dropOffset - lift * 0.5 + spread * 0.6,
          w + spread * 2,
          h + thickness + spread,
          radius + spread,
        )
      }

      faceG.clear()
      faceG.fillStyle(shadow, 1)
      faceG.fillRoundedRect(-w / 2, -h / 2 - lift, w, h + thickness, radius)
      faceG.fillStyle(fill, 1)
      faceG.fillRoundedRect(-w / 2, -h / 2 - lift, w, h, radius)
      faceG.lineStyle(2, shadow, 0.7)
      faceG.strokeRoundedRect(-w / 2 + 1, -h / 2 - lift + 1, w - 2, h - 2, radius - 1)
    }
    drawButton(false)
    container.add([hit, shadowG, faceG])

    const iconText = this.add
      .text(0, -h / 2 + 96, icon, {
        fontFamily: FONT_FAMILY,
        fontSize: '88px',
      })
      .setOrigin(0.5)
    const titleText = this.add
      .text(0, -h / 2 + 192, title, {
        fontFamily: FONT_FAMILY,
        fontSize: '34px',
        color: '#ffffff',
        fontStyle: 'bold',
        stroke: '#1a0e05',
        strokeThickness: 5,
      })
      .setOrigin(0.5)
    const descText = this.add
      .text(0, -h / 2 + 240, desc, {
        fontFamily: FONT_FAMILY,
        fontSize: '17px',
        color: '#fff4dc',
        align: 'center',
        wordWrap: { width: w - 40 },
      })
      .setOrigin(0.5, 0)
    container.add([iconText, titleText, descText])

    hit.on(Phaser.Input.Events.POINTER_DOWN, onClick)
    hit.on(Phaser.Input.Events.POINTER_OVER, () => {
      drawButton(true)
      iconText.y = -h / 2 + 96 - liftAmount
      titleText.y = -h / 2 + 192 - liftAmount
      descText.y = -h / 2 + 240 - liftAmount
    })
    hit.on(Phaser.Input.Events.POINTER_OUT, () => {
      drawButton(false)
      iconText.y = -h / 2 + 96
      titleText.y = -h / 2 + 192
      descText.y = -h / 2 + 240
    })
    return container
  }

  /**
   * 단색 pill 버튼. 공용 drawCutePillButton 의 외곽 글로우/상단 글로스가 시각적으로 두꺼워 보이는 것을 피해, 본 씬에서는 직접 그린다.
   * 클릭 영역은 investment 안 들이려고 투명 Rectangle hit zone 으로 시각 = 클릭 일치.
   */
  private createPillButton(
    cx: number,
    cy: number,
    w: number,
    h: number,
    label: string,
    palette: (typeof CUTE_CARD_PALETTES)[keyof typeof CUTE_CARD_PALETTES],
    onClick: () => void,
  ) {
    const container = this.add.container(cx, cy)
    const radius = h / 2

    const hit = this.add.rectangle(0, 0, w, h, 0xffffff, 0.001).setOrigin(0.5)
    hit.setInteractive({ useHandCursor: true })

    const g = this.add.graphics()
    const draw = (hovered: boolean) => {
      g.clear()
      g.fillStyle(palette.accent, hovered ? 1 : 0.92)
      g.fillRoundedRect(-w / 2, -h / 2, w, h, radius)
      g.lineStyle(2, 0xffffff, hovered ? 1 : 0.9)
      g.strokeRoundedRect(-w / 2, -h / 2, w, h, radius)
    }
    draw(false)

    const text = this.add
      .text(0, 0, label, {
        fontFamily: FONT_FAMILY,
        fontSize: '20px',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
    container.add([hit, g, text])

    hit.on(Phaser.Input.Events.POINTER_DOWN, onClick)
    hit.on(Phaser.Input.Events.POINTER_OVER, () => draw(true))
    hit.on(Phaser.Input.Events.POINTER_OUT, () => draw(false))
    return container
  }
}

function extractMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'response' in error) {
    const response = (error as { response?: { data?: { message?: string } } }).response
    if (response?.data?.message) return response.data.message
  }
  if (error instanceof Error && error.message) return error.message
  return fallback
}

/** axios error 의 응답 body.code 가 BE 의 ALREADY_IN_ROOM(Q-004) 인지 검사. 다른 형태 응답은 false. */
function isAlreadyInRoomError(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('response' in error)) return false
  const response = (error as { response?: { status?: number; data?: { code?: string } } }).response
  return response?.status === 409 && response?.data?.code === 'Q-004'
}

function normalizeRoundOption(value: number | null | undefined) {
  return ROUND_OPTIONS.includes(value as (typeof ROUND_OPTIONS)[number])
    ? (value as (typeof ROUND_OPTIONS)[number])
    : DEFAULT_SELECTED_ROUNDS
}

/**
 * 사용자에게 그대로 노출하기 부적절한 STOMP/BE 원본 에러 문구를 친절한 한 줄로 매핑.
 *
 * <p>대부분의 일시적 에러(서버 인터셉터 race, 네트워크 일시 끊김 등) 는 stomp client 가 자동 재접속하므로, 사용자 행동을 요구하는 단정적인 안내는
 * 피하고 "잠시 후 다시 연결" 정도로 부드럽게 둔다. 진짜 사용자 액션이 필요한 케이스 (멤버 아님 등) 만 명시.
 */
function friendlyWsError(raw: string): string {
  if (!raw) return '연결을 확인하는 중…'
  const lower = raw.toLowerCase()
  if (lower.includes('not a member')) return '방 멤버가 아니에요. 다시 입장해줘.'
  // 실시간 비활성 상태 — 사용자에게 굳이 노출하지 않는다. dev/local 에선 yaml 로 활성화되며
  // 운영에서 의도적으로 꺼진 상태일 때도 로비 화면에 경고를 띄우면 오히려 혼란.
  if (lower.includes('quiz realtime disabled') || lower.includes('village realtime disabled'))
    return ''
  // principal missing / missing bearer / 일반 에러 — 자동 재접속에 맡기고 부드럽게.
  return '연결을 다시 시도하는 중…'
}

/**
 * 24-bit 색을 약 12% 정도 밝게. hover/active 강조에 사용. r/g/b 각 채널을 0xff 와 비율로 보간.
 */
function brighten(color: number): number {
  const r = (color >> 16) & 0xff
  const g = (color >> 8) & 0xff
  const b = color & 0xff
  const lift = (c: number) => Math.min(255, c + Math.floor((255 - c) * 0.18))
  return (lift(r) << 16) | (lift(g) << 8) | lift(b)
}
