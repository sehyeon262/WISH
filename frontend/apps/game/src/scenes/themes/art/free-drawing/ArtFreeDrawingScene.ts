import Phaser from 'phaser'
import { playSceneBgm } from '@/game/systems/sceneBgm'
import {
  createArtwork,
  submitDrawingGuess,
  updateArtwork,
  type DrawingGuessResult,
} from '@wish/api-client'
import { assetPath } from '@/game/assets/assetPath'
import { createSceneWeatherLayer } from '@/features/weather/phaserWeatherLayer'
import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import { HandTracker, type TrackedHand } from '@/game/motion/handTracker'
import { detectPinchGesture } from '@/game/motion/pinchGesture'
import { toPointerCanvasCoordinates } from '@/game/motion/pointerCanvasCoordinates'
import { toPointerConfidence } from '@/game/motion/pointerConfidence'
import { toPointerCoordinates } from '@/game/motion/pointerCoordinates'
import { HAND_LANDMARK_INDEX, type PointerReference } from '@/game/motion/pointerReference'
import { PointerSmoother } from '@/game/motion/pointerSmoother'
import { PointerTrackingGuard } from '@/game/motion/pointerTrackingGuard'
import { createArtCameraPreview, type ArtCameraPreview } from '../ui/artCameraPreview'
import { getArtBrushColorOverlayTextureKey } from '../ui/artBrushColorOverlayTexture'
import {
  createArtConfirmDialog,
  type ArtConfirmDialog,
  type ArtConfirmDialogButtonRole,
} from '../ui/artConfirmDialog'
import { createQuizResultDialog, createQuizRoundIntroDialog } from '../ui/quizDialog'
import { pickRandomPrompt, type DrawingPrompt } from './drawingPrompts'

const ART_ROOM_RETURN_SPAWN = { xRatio: 0.5, yRatio: 0.76 }
const CANVAS_SOURCE_SIZE = { width: 1535, height: 1024 }
const CANVAS_DRAW_AREA = { x: 120, y: 150, width: 1288, height: 620 }
const DELETE_BUTTON_SIZE = { width: 344, height: 336 }
const EXIT_CONFIRM_DEPTH = 60
const BRUSH_CURSOR_DEPTH = EXIT_CONFIRM_DEPTH + 12
const BRUSH_CURSOR_OVERLAY_DEPTH = BRUSH_CURSOR_DEPTH + 1
const HAND_DIALOG_SELECT_HOLD_MS = 450
const HAND_DRAW_MIN_DISTANCE_RATIO = 0.004
const POINTER_DRAW_MIN_DISTANCE_RATIO = 0.003
const HAND_POINTER_REJECT_MARGIN = 0.08
// Pinch 진입 < 0.15(사실상 닿아야 함), 해제 > 0.20 — 손가락이 거의 닿은 상태에서만 펜다운.
const PINCH_ENTER_RATIO = 0.15
const PINCH_EXIT_RATIO = 0.2
// 한 프레임에 ratio가 이만큼 이상 변하면 "손 모으는/펴는 중" → 그리기 비활성화
const PINCH_TRANSITION_RATIO_DELTA = 0.07
// 핀치 들어간 직후 이 시간 동안은 그리기 차단 — 접근 모션 끝자락의 짧은 선 방지
const PINCH_SETTLING_MS = 35
// 손이 한 프레임에 캔버스 폭의 이 비율 이상 튀면 연결선 끊고 새 스트로크 시작
const HAND_DRAW_JUMP_DISTANCE_RATIO = 0.2
// 핀치 직전 호버 위치를 펜다운 위치로 스냅하는 최대 거리(캔버스 폭 비율) — 7% 안이면 같은 자리로 간주
const HOVER_AIM_REJOIN_RATIO = 0.07
// 호버 위치가 너무 오래되면 무시(500ms)
const HOVER_AIM_FRESHNESS_MS = 500
const MAX_STROKE_HISTORY = 80
const HAND_POINTER_CAMERA_BOUNDS = { left: 0.06, right: 0.94, top: 0.06, bottom: 0.78 } as const
type DrawingTool = 'brush' | 'eraser'
const DRAWING_TOOLS: DrawingTool[] = ['brush', 'eraser']
// Source dimensions of palette.png. Swatch coordinates below are in this space.
const PALETTE_SOURCE_WIDTH = 773
const PALETTE_SOURCE_HEIGHT = 1547
const PALETTE_ASPECT = PALETTE_SOURCE_WIDTH / PALETTE_SOURCE_HEIGHT

// Coordinates are in palette image source-pixel space (773 × 1547, 2 cols × 6 rows).
const PALETTE_SWATCHES = [
  { color: 0xff2b2b, sourceX: 228, sourceY: 212 },
  { color: 0xff4d9a, sourceX: 545, sourceY: 212 },
  { color: 0xff6a1f, sourceX: 228, sourceY: 437 },
  { color: 0xffd12c, sourceX: 545, sourceY: 437 },
  { color: 0x7bdd1e, sourceX: 228, sourceY: 661 },
  { color: 0x138f2d, sourceX: 545, sourceY: 661 },
  { color: 0x36b7ff, sourceX: 228, sourceY: 885 },
  { color: 0x3679ff, sourceX: 545, sourceY: 885 },
  { color: 0x9a43d9, sourceX: 228, sourceY: 1110 },
  { color: 0xffb05a, sourceX: 545, sourceY: 1110 },
  { color: 0x8e5c32, sourceX: 228, sourceY: 1334 },
  { color: 0x2f2f2f, sourceX: 545, sourceY: 1334 },
] as const

type PalettePoint = { color: number; x: number; y: number }
type HandPointerState = {
  point: Phaser.Math.Vector2
  isDrawingGesture: boolean
}
type StrokePoint = { x: number; y: number }
type StrokeRecord = {
  tool: DrawingTool
  color: number
  size: number
  points: StrokePoint[]
}
type ArtFreeDrawingSceneData = {
  suppressIntroDialog?: boolean
  editArtwork?: EditableArtworkSceneData
}
type EditableArtworkSceneData = {
  id: number
  imageTextureKey: string
  isPublic: boolean
}
type HandActionKind = 'save' | 'reset' | 'exit' | 'undo'
type ExportedDrawingPng = {
  blob: Blob
  dataUrl: string
  filename: string
  isPublic: boolean
  playDurationSeconds: number
  width: number
  height: number
  colorCount: number
}

export class ArtFreeDrawingScene extends Phaser.Scene {
  private drawBounds = new Phaser.Geom.Rectangle()
  private canvasFrameBounds = new Phaser.Geom.Rectangle()
  private paletteBounds = new Phaser.Geom.Rectangle()
  private drawingTexture!: Phaser.GameObjects.RenderTexture
  private brushStroke!: Phaser.GameObjects.Graphics
  private paletteSelection!: Phaser.GameObjects.Arc
  private cameraPreview: ArtCameraPreview | null = null
  private brushCursor: Phaser.GameObjects.Image | null = null
  private brushColorOverlay: Phaser.GameObjects.Image | null = null
  private toolButtons: Partial<Record<DrawingTool, Phaser.GameObjects.Image>> = {}
  private toolButtonFrames: Partial<Record<DrawingTool, Phaser.GameObjects.Arc>> = {}
  private toolButtonGlows: Partial<Record<DrawingTool, Phaser.GameObjects.Image>> = {}
  private toolButtonBaseScales: Partial<Record<DrawingTool, { x: number; y: number }>> = {}
  private saveButton: Phaser.GameObjects.Image | null = null
  private resetButton: Phaser.GameObjects.Image | null = null
  private exitButton: Phaser.GameObjects.Image | null = null
  private undoButton: Phaser.GameObjects.Container | null = null
  private undoButtonBounds = new Phaser.Geom.Rectangle()
  private strokeHistory: StrokeRecord[] = []
  private currentStrokeRecord: StrokeRecord | null = null
  private palettePoints: PalettePoint[] = []
  private handTracker: HandTracker | null = null
  private readonly handPointerSmoother = new PointerSmoother({ alpha: 0.24 })
  private readonly handDrawingSmoother = new PointerSmoother({ alpha: 0.16 })
  private readonly handTrackingGuard = new PointerTrackingGuard<Phaser.Math.Vector2>({
    holdDurationMs: 120,
  })

  private isDrawing = false
  private isHandDrawing = false
  private isPinchActive = false
  private lastPinchRatio: number | null = null
  private pinchActiveSince = 0
  private isStartingHandTracker = false
  private handTrackingDisposed = false
  private isTransitioning = false
  private hasStartedDrawing = false
  private strokeCount = 0
  private activeDrawingPointerId: number | null = null
  private lastDrawPoint: Phaser.Math.Vector2 | null = null
  private lastHandDrawPoint: Phaser.Math.Vector2 | null = null
  private lastHandRawPoint: Phaser.Math.Vector2 | null = null
  // 핀치 직전 손이 호버하던 캔버스 좌표 — 핀치 시작할 때 펜다운 위치로 스냅하는 데 씀
  private lastHoverPoint: { x: number; y: number; capturedAt: number } | null = null
  private currentTool: DrawingTool = 'brush'
  private currentColor: number = PALETTE_SWATCHES[0].color
  // 실제로 brush 로 그려본 팔레트 색 추적 (지우개 제외).
  // 이전엔 export 시 캔버스 픽셀 RGB 를 팔레트와 정확 매칭했는데, Phaser 안티알리아싱이
  // 가장자리를 배경과 블렌딩해서 정확 매칭이 거의 실패 → 0가지로 저장되는 버그가 있었다.
  // 유저가 선택해서 한 번이라도 그은 색을 누적하는 게 의도("사용한 색 N가지")에도 더 충실.
  private usedColors = new Set<number>()
  private lastHandColorSelectedAt = 0
  private pendingHandColor: number | null = null
  private pendingHandColorStartedAt = 0
  private pendingHandTool: DrawingTool | null = null
  private pendingHandToolStartedAt = 0
  private lastHandToolSelectedAt = 0
  private pendingHandAction: HandActionKind | null = null
  private pendingHandActionStartedAt = 0
  private activatedHandAction: HandActionKind | null = null
  private pendingHandDialogButton: ArtConfirmDialogButtonRole | null = null
  private pendingHandDialogButtonStartedAt = 0
  private activatedHandDialogButton: ArtConfirmDialogButtonRole | null = null
  private isSavingDrawing = false
  private isExitConfirmOpen = false
  private exitConfirmDialog: ArtConfirmDialog | null = null
  private isSaveVisibilityConfirmOpen = false
  private saveVisibilityConfirmDialog: ArtConfirmDialog | null = null
  private editingArtwork: EditableArtworkSceneData | null = null
  private isQuizMode = false
  private currentPrompt: DrawingPrompt | null = null
  private promptWordText: Phaser.GameObjects.Text | null = null
  private isJudging = false
  private quizResultDialog: ArtConfirmDialog | null = null
  private isQuizResultOpen = false
  private roundIntroDialog: ArtConfirmDialog | null = null
  private isRoundIntroOpen = false
  private quizSubmitButton: Phaser.GameObjects.Container | null = null
  private quizSubmitButtonBounds = new Phaser.Geom.Rectangle()
  private quizSubmitButtonBaseScale = { x: 1, y: 1 }
  private judgingOverlay: Phaser.GameObjects.Container | null = null
  private contentStartedAt = 0
  private saveButtonBaseScale = { x: 1, y: 1 }
  private resetButtonBaseScale = { x: 1, y: 1 }
  private exitButtonBaseScale = { x: 1, y: 1 }
  private undoButtonBaseScale = { x: 1, y: 1 }

  private readonly handlePointerDown = (pointer: Phaser.Input.Pointer) => {
    if (
      this.isTransitioning ||
      this.isSavingDrawing ||
      this.isJudging ||
      this.isExitConfirmOpen ||
      this.isSaveVisibilityConfirmOpen ||
      this.isQuizResultOpen ||
      this.isRoundIntroOpen
    ) {
      return
    }

    if (this.activeDrawingPointerId !== null) {
      return
    }

    if (!Phaser.Geom.Rectangle.Contains(this.drawBounds, pointer.x, pointer.y)) {
      return
    }

    this.activeDrawingPointerId = pointer.id
    this.isDrawing = true
    this.strokeCount += 1
    const point = this.clampToDrawBounds(pointer.x, pointer.y)
    this.lastDrawPoint = point
    this.drawDot(point.x, point.y)
    this.beginStrokeRecord(point.x, point.y)

    if (!this.hasStartedDrawing) {
      this.hasStartedDrawing = true
    }
  }

  private readonly handlePointerMove = (pointer: Phaser.Input.Pointer) => {
    if (
      this.isTransitioning ||
      this.isSavingDrawing ||
      this.isJudging ||
      this.isExitConfirmOpen ||
      this.isSaveVisibilityConfirmOpen ||
      this.isQuizResultOpen ||
      this.isRoundIntroOpen
    ) {
      this.stopDrawing()
      return
    }

    if (this.activeDrawingPointerId !== pointer.id) {
      return
    }

    if (!this.isDrawing || !pointer.isDown) {
      return
    }

    if (!Phaser.Geom.Rectangle.Contains(this.drawBounds, pointer.x, pointer.y)) {
      this.stopDrawing()
      return
    }

    const currentPoint = this.clampToDrawBounds(pointer.x, pointer.y)
    if (!this.lastDrawPoint) {
      this.lastDrawPoint = currentPoint
      this.drawDot(currentPoint.x, currentPoint.y)
      this.beginStrokeRecord(currentPoint.x, currentPoint.y)
      return
    }

    const movedDistance = Phaser.Math.Distance.BetweenPoints(this.lastDrawPoint, currentPoint)
    if (movedDistance < this.getPointerDrawMinDistance()) {
      return
    }

    this.drawStroke(this.lastDrawPoint, currentPoint)
    this.extendStrokeRecord(currentPoint.x, currentPoint.y)
    this.lastDrawPoint = currentPoint
  }

  private readonly handlePointerUp = (pointer: Phaser.Input.Pointer) => {
    if (this.activeDrawingPointerId !== pointer.id) {
      return
    }

    this.stopDrawing()
  }

  private readonly handleEscDown = () => {
    if (this.isSaveVisibilityConfirmOpen) {
      this.hideSaveVisibilityConfirm()
      return
    }

    if (this.isExitConfirmOpen) {
      this.hideExitConfirm()
      return
    }

    // 퀴즈 결과/라운드 인트로는 명시적 선택지로만 닫음 — ESC 누를 때 그 위에
    // 종료 확인이 겹쳐 뜨던 문제 방지.
    if (this.isQuizResultOpen || this.isRoundIntroOpen || this.isJudging) {
      return
    }

    this.requestReturnToArtRoom()
  }

  constructor() {
    super({ key: 'ArtFreeDrawingScene' })
  }

  preload() {
    this.load.image('art-room-background', assetPath('images/themes/art/background/background.png'))
    this.load.image('art-ui-canvas', assetPath('images/themes/art/ui/canvas.png'))
    this.load.image('art-ui-palette', assetPath('images/themes/art/ui/palette.png'))
    this.load.image('art-ui-brush', assetPath('images/themes/art/ui/brush.png'))
    this.load.image('art-ui-eraser', assetPath('images/themes/art/ui/eraser.png'))
    this.load.image('art-ui-delete-btn', assetPath('images/themes/art/ui/delete_btn.png'))
    this.load.image('art-ui-reset-btn', assetPath('images/themes/art/ui/reset.png'))
    this.load.image('art-ui-save-btn', assetPath('images/themes/art/ui/save_btn.png'))
  }

  create(data: ArtFreeDrawingSceneData = {}) {
    playSceneBgm(this)
    const { width: vw, height: vh } = this.scale
    this.editingArtwork = data.editArtwork ?? null
    this.isQuizMode = !this.editingArtwork
    this.currentPrompt = this.isQuizMode ? pickRandomPrompt() : null
    this.isJudging = false
    this.isQuizResultOpen = false
    this.quizResultDialog = null
    this.judgingOverlay = null
    this.promptWordText = null
    this.roundIntroDialog = null
    this.isRoundIntroOpen = false
    this.quizSubmitButton = null
    this.contentStartedAt = this.time.now
    this.isTransitioning = false
    this.isSavingDrawing = false
    this.isExitConfirmOpen = false
    this.exitConfirmDialog = null
    this.isSaveVisibilityConfirmOpen = false
    this.saveVisibilityConfirmDialog = null
    this.brushCursor = null
    this.brushColorOverlay = null
    this.cameraPreview = null
    this.hasStartedDrawing = false
    this.strokeCount = 0
    this.handTrackingDisposed = false
    this.currentTool = 'brush'
    this.toolButtons = {}
    this.toolButtonFrames = {}
    this.toolButtonGlows = {}
    this.toolButtonBaseScales = {}
    this.pendingHandTool = null
    this.pendingHandToolStartedAt = 0
    this.lastHandToolSelectedAt = 0
    this.strokeHistory = []
    this.currentStrokeRecord = null
    this.undoButton = null
    this.isPinchActive = false
    this.lastPinchRatio = null
    this.pinchActiveSince = 0
    this.lastHandRawPoint = null
    this.lastHoverPoint = null
    this.clearPendingHandDialogButton()

    const background = this.add.image(vw / 2, vh / 2, 'art-room-background')
    const backgroundSource = background.texture.getSourceImage() as HTMLImageElement
    const backgroundScale = Math.max(vw / backgroundSource.width, vh / backgroundSource.height)
    background.setScale(backgroundScale).setDepth(0)

    // soft warm dim — keeps the room's mood but pushes focus onto the canvas
    this.add.rectangle(vw / 2, vh / 2, vw, vh, 0x1a1208, 0.32).setDepth(1)
    createSceneWeatherLayer(this)

    this.createCanvas(vw, vh)
    if (this.applyInitialArtworkImage()) {
      this.hasStartedDrawing = true
    }
    this.createHeader(vw, vh)
    this.createExitButton(vw, vh)
    this.createBrushCursor()
    this.createPalette(vw, vh)
    this.createActionButtons()
    this.createToolSelector()
    this.createCameraPreview(vw, vh)

    this.input.on('pointerdown', this.handlePointerDown)
    this.input.on('pointermove', this.handlePointerMove)
    this.input.on('pointerup', this.handlePointerUp)
    this.input.on('pointerupoutside', this.handlePointerUp)
    this.input.keyboard!.on('keydown-ESC', this.handleEscDown)
    this.startHandDrawingMode()

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.off('pointerdown', this.handlePointerDown)
      this.input.off('pointermove', this.handlePointerMove)
      this.input.off('pointerup', this.handlePointerUp)
      this.input.off('pointerupoutside', this.handlePointerUp)
      this.input.keyboard?.off('keydown-ESC', this.handleEscDown)
      this.input.setDefaultCursor('default')
      this.hideExitConfirm()
      this.hideSaveVisibilityConfirm()
      this.hideQuizResultDialog()
      this.hideRoundIntro()
      this.hideJudgingOverlay()
      this.cameraPreview?.destroy()
      this.cameraPreview = null
      this.stopHandTracking()
      this.brushCursor = null
      this.brushColorOverlay = null
    })

    this.cameras.main.fadeIn(220, 0, 0, 0)

    if (this.isQuizMode && this.currentPrompt) {
      this.time.delayedCall(280, () => this.showRoundIntro(this.currentPrompt!))
    }
  }

  update(time: number) {
    const pointer = this.input.activePointer
    this.updateBrushCursorPosition(pointer.x, pointer.y)

    this.cameraPreview?.update()
    this.updateHandDrawing(time)
  }

  private createHeader(vw: number, _vh: number) {
    if (this.isQuizMode) {
      this.createPromptCard(vw)
      return
    }

    const headerX = this.drawBounds.left
    const headerTop = Math.max(28, this.drawBounds.top - 108)
    const titleY = headerTop
    const subtitleY = titleY + 44

    this.add
      .text(headerX, titleY, '자유 그림', {
        fontFamily: 'sans-serif',
        fontSize: `${Math.max(28, Math.round(vw * 0.02))}px`,
        color: '#fff8ec',
        stroke: '#59361d',
        strokeThickness: 6,
      })
      .setDepth(10)
      .setOrigin(0, 0)

    this.add
      .text(headerX, subtitleY, '엄지와 검지를 모으면 그려지고, 살짝 떼면 멈춰져.', {
        fontFamily: 'sans-serif',
        fontSize: `${Math.max(16, Math.round(vw * 0.01))}px`,
        color: '#fff6ea',
        stroke: '#5f4129',
        strokeThickness: 4,
      })
      .setDepth(10)
      .setOrigin(0, 0)
  }

  private createPromptCard(vw: number) {
    // 캔버스 위 중앙에 단어만 깔끔하게 — 캐릭터 카드의 라벨 같은 톤
    const canvasCenterX = this.drawBounds.left + this.drawBounds.width / 2
    const cardWidth = Math.min(280, vw * 0.22)
    const cardHeight = 60
    const cardY = Math.max(20, this.drawBounds.top - cardHeight - 18)

    const background = this.add.graphics()
    background.fillStyle(0xfff8e5, 0.98)
    background.fillRoundedRect(0, 0, cardWidth, cardHeight, cardHeight / 2)
    background.lineStyle(3, 0xb88a4c, 1)
    background.strokeRoundedRect(0, 0, cardWidth, cardHeight, cardHeight / 2)

    const wordText = this.add
      .text(cardWidth / 2, cardHeight / 2, this.currentPrompt?.word ?? '', {
        fontFamily: 'sans-serif',
        fontSize: `${Math.max(24, Math.round(vw * 0.02))}px`,
        color: '#3f2615',
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 0.5)
    this.promptWordText = wordText

    this.add
      .container(canvasCenterX - cardWidth / 2, cardY, [background, wordText])
      .setDepth(10)
      .setSize(cardWidth, cardHeight)
  }

  private refreshPromptCard() {
    this.promptWordText?.setText(this.currentPrompt?.word ?? '')
  }

  private createCanvas(vw: number, vh: number) {
    const leftMargin = vw * 0.055
    const rightPanelLeft = vw * 0.805
    const availableLeftWidth = rightPanelLeft - leftMargin
    const maxWidthByHeight = vh * 1.72
    const maxWidth = Math.min(availableLeftWidth, maxWidthByHeight)
    const canvasX = leftMargin + maxWidth / 2

    const canvas = this.add.image(canvasX, vh * 0.528, 'art-ui-canvas').setDepth(5)
    canvas.setDisplaySize(
      maxWidth,
      maxWidth * (CANVAS_SOURCE_SIZE.height / CANVAS_SOURCE_SIZE.width),
    )

    this.canvasFrameBounds.setTo(
      canvas.x - canvas.displayWidth / 2,
      canvas.y - canvas.displayHeight / 2,
      canvas.displayWidth,
      canvas.displayHeight,
    )

    const scaleX = canvas.displayWidth / CANVAS_SOURCE_SIZE.width
    const scaleY = canvas.displayHeight / CANVAS_SOURCE_SIZE.height

    this.drawBounds.setTo(
      canvas.x - canvas.displayWidth / 2 + CANVAS_DRAW_AREA.x * scaleX,
      canvas.y - canvas.displayHeight / 2 + CANVAS_DRAW_AREA.y * scaleY,
      CANVAS_DRAW_AREA.width * scaleX,
      CANVAS_DRAW_AREA.height * scaleY,
    )

    this.drawingTexture = this.add
      .renderTexture(
        this.drawBounds.x,
        this.drawBounds.y,
        this.drawBounds.width,
        this.drawBounds.height,
      )
      .setOrigin(0, 0)
      .setDepth(6)

    this.brushStroke = this.add.graphics().setVisible(false)
  }

  private applyInitialArtworkImage() {
    if (!this.editingArtwork || !this.textures.exists(this.editingArtwork.imageTextureKey)) {
      return false
    }

    const source = this.textures
      .get(this.editingArtwork.imageTextureKey)
      .getSourceImage() as HTMLImageElement
    const scale = Math.min(
      this.drawBounds.width / source.width,
      this.drawBounds.height / source.height,
    )
    const image = this.add
      .image(0, 0, this.editingArtwork.imageTextureKey)
      .setOrigin(0, 0)
      .setDisplaySize(source.width * scale, source.height * scale)
      .setVisible(false)
    image.setPosition(
      (this.drawBounds.width - image.displayWidth) / 2,
      (this.drawBounds.height - image.displayHeight) / 2,
    )
    this.drawingTexture.draw(image)
    image.destroy()
    return true
  }

  private createPalette(vw: number, vh: number) {
    const paletteHeight = Math.min(this.drawBounds.height * 0.78, vh * 0.72)
    const paletteWidth = paletteHeight * PALETTE_ASPECT
    const toolIconSize = Math.max(68, Math.min(90, Math.round(vw * 0.044)))
    const toolHitSize = toolIconSize + 18
    const toolGap = Math.max(10, Math.round(toolHitSize * 0.14))
    const minPanelCenterX = this.drawBounds.right + paletteWidth * 0.6
    const maxPanelCenterX = Math.max(
      minPanelCenterX,
      vw - toolHitSize - toolGap - paletteWidth / 2 - 24,
    )
    const panelCenterX = Phaser.Math.Clamp(
      this.drawBounds.right + paletteWidth * 0.75,
      minPanelCenterX,
      maxPanelCenterX,
    )
    const paletteTargetTop = this.drawBounds.top + 2
    const palette = this.add
      .image(panelCenterX, paletteTargetTop + paletteHeight / 2, 'art-ui-palette')
      .setDepth(8)
    palette.setDisplaySize(paletteWidth, paletteHeight)

    const paletteLeft = palette.x - palette.displayWidth / 2
    const paletteBoundsTop = palette.y - palette.displayHeight / 2
    const scaleX = palette.displayWidth / PALETTE_SOURCE_WIDTH
    const scaleY = palette.displayHeight / PALETTE_SOURCE_HEIGHT
    const selectionRadius = Math.max(18, palette.displayWidth * 0.085)
    const hitWidth = palette.displayWidth * 0.34
    const hitHeight = palette.displayHeight * 0.115
    const minSwatchSourceX = Math.min(...PALETTE_SWATCHES.map(swatch => swatch.sourceX))
    const maxSwatchSourceX = Math.max(...PALETTE_SWATCHES.map(swatch => swatch.sourceX))
    const visualPaddingX = hitWidth * 0.9
    this.paletteBounds.setTo(
      paletteLeft + minSwatchSourceX * scaleX - visualPaddingX,
      paletteBoundsTop,
      (maxSwatchSourceX - minSwatchSourceX) * scaleX + visualPaddingX * 2,
      palette.displayHeight,
    )

    this.paletteSelection = this.add
      .circle(0, 0, selectionRadius, 0xffffff, 0)
      .setStrokeStyle(Math.max(3, selectionRadius * 0.14), 0xfff4da)
      .setDepth(10)
      .setVisible(false)

    this.palettePoints = []

    PALETTE_SWATCHES.forEach(swatch => {
      const x = paletteLeft + swatch.sourceX * scaleX
      const y = paletteBoundsTop + swatch.sourceY * scaleY
      this.palettePoints.push({ color: swatch.color, x, y })

      const hitArea = this.add
        .rectangle(x, y, hitWidth, hitHeight, 0xffffff, 0.001)
        .setDepth(9)
        .setInteractive({ useHandCursor: true })

      hitArea.on(
        'pointerdown',
        (
          _pointer: Phaser.Input.Pointer,
          _localX: number,
          _localY: number,
          event: Phaser.Types.Input.EventData,
        ) => {
          event.stopPropagation()
          this.selectColor(swatch.color, x, y)
        },
      )

      hitArea.on('pointerover', () => {
        if (this.input.activePointer.isDown) {
          this.selectColor(swatch.color, x, y)
        }
      })
    })

    palette.setInteractive({ useHandCursor: true })
    palette.on(
      'pointerdown',
      (
        pointer: Phaser.Input.Pointer,
        _localX: number,
        _localY: number,
        event: Phaser.Types.Input.EventData,
      ) => {
        event.stopPropagation()
        const nearest = this.getPaletteColorAt(pointer.x, pointer.y)
        if (nearest !== null) {
          this.selectColor(nearest.color, nearest.x, nearest.y)
        }
      },
    )

    const firstPoint = this.palettePoints[0]
    if (firstPoint) {
      this.selectColor(this.currentColor, firstPoint.x, firstPoint.y)
    }
  }

  private createActionButtons() {
    const resetSource = this.textures.get('art-ui-reset-btn').getSourceImage() as HTMLImageElement
    const resetButtonHeight = 48
    const resetButtonWidth = Math.round(
      resetButtonHeight * (resetSource.width / resetSource.height),
    )
    const saveButtonHeight = 44
    const buttonGap = 2
    const buttonY = Math.min(
      this.scale.height - saveButtonHeight / 2 - 18,
      this.drawBounds.bottom + saveButtonHeight / 2 + 6,
    )
    const rowRight = this.drawBounds.right - 54
    const resetButtonX = rowRight - resetButtonWidth / 2

    let submitLeftEdgeX: number
    if (this.isQuizMode) {
      submitLeftEdgeX = this.createQuizSubmitButton(
        rowRight - resetButtonWidth - buttonGap,
        buttonY,
        saveButtonHeight,
      )
    } else {
      const saveSource = this.textures.get('art-ui-save-btn').getSourceImage() as HTMLImageElement
      const saveButtonWidth = Math.round(saveButtonHeight * (saveSource.width / saveSource.height))
      const saveButtonX = rowRight - resetButtonWidth - buttonGap - saveButtonWidth / 2
      const saveButton = this.add.image(saveButtonX, buttonY, 'art-ui-save-btn').setDepth(15)
      saveButton.setDisplaySize(saveButtonWidth, saveButtonHeight)
      this.saveButton = saveButton
      this.saveButtonBaseScale = { x: saveButton.scaleX, y: saveButton.scaleY }

      saveButton.setInteractive({ useHandCursor: true })
      saveButton.on('pointerover', () => saveButton.setTint(0xf9f1d9))
      saveButton.on('pointerout', () => saveButton.clearTint())
      saveButton.on(
        'pointerdown',
        (
          _pointer: Phaser.Input.Pointer,
          _localX: number,
          _localY: number,
          event: Phaser.Types.Input.EventData,
        ) => {
          event.stopPropagation()
          this.requestSaveDrawing()
        },
      )
      submitLeftEdgeX = saveButtonX - saveButtonWidth / 2
    }

    const resetButton = this.add.image(resetButtonX, buttonY, 'art-ui-reset-btn').setDepth(15)
    resetButton.setDisplaySize(resetButtonWidth, resetButtonHeight)
    this.resetButton = resetButton
    this.resetButtonBaseScale = { x: resetButton.scaleX, y: resetButton.scaleY }

    resetButton.setInteractive({ useHandCursor: true })
    resetButton.on('pointerover', () => resetButton.setTint(0xf9f1d9))
    resetButton.on('pointerout', () => resetButton.clearTint())
    resetButton.on(
      'pointerdown',
      (
        _pointer: Phaser.Input.Pointer,
        _localX: number,
        _localY: number,
        event: Phaser.Types.Input.EventData,
      ) => {
        event.stopPropagation()
        this.resetDrawing()
      },
    )

    this.createUndoButton(submitLeftEdgeX - buttonGap, buttonY, saveButtonHeight)
  }

  // 퀴즈 모드 전용 "그렸어요!" 알약 버튼. 저장 버튼 PNG 위에 텍스트를 얹는 방식이 깨져 보였던 걸 대체.
  // 반환값: 버튼의 왼쪽 가장자리 x — 되돌리기 버튼 배치 기준으로 사용.
  private createQuizSubmitButton(rightX: number, buttonY: number, buttonHeight: number): number {
    const padX = 22
    const labelText = '그렸어요!'
    const fontSize = Math.max(15, Math.round(buttonHeight * 0.42))

    const label = this.add
      .text(0, 0, labelText, {
        fontFamily: 'sans-serif',
        fontSize: `${fontSize}px`,
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 0.5)

    const buttonWidth = Math.max(buttonHeight * 2.6, label.width + padX * 2)
    const buttonX = rightX - buttonWidth / 2

    const background = this.add.graphics()
    const drawBackground = (fill: number) => {
      background.clear()
      background.fillStyle(fill, 1)
      background.fillRoundedRect(
        -buttonWidth / 2,
        -buttonHeight / 2,
        buttonWidth,
        buttonHeight,
        buttonHeight / 2,
      )
      background.lineStyle(2, 0x3f752a, 1)
      background.strokeRoundedRect(
        -buttonWidth / 2,
        -buttonHeight / 2,
        buttonWidth,
        buttonHeight,
        buttonHeight / 2,
      )
    }
    drawBackground(0x65a843)

    const container = this.add.container(buttonX, buttonY, [background, label]).setDepth(15)
    container.setSize(buttonWidth, buttonHeight)
    container.setInteractive({
      hitArea: new Phaser.Geom.Rectangle(
        -buttonWidth / 2,
        -buttonHeight / 2,
        buttonWidth,
        buttonHeight,
      ),
      hitAreaCallback: Phaser.Geom.Rectangle.Contains,
      useHandCursor: true,
    })

    container.on('pointerover', () => drawBackground(0x77be4f))
    container.on('pointerout', () => drawBackground(0x65a843))
    container.on(
      'pointerdown',
      (
        _pointer: Phaser.Input.Pointer,
        _localX: number,
        _localY: number,
        event: Phaser.Types.Input.EventData,
      ) => {
        event.stopPropagation()
        this.requestJudgeDrawing()
      },
    )

    this.quizSubmitButton = container
    this.quizSubmitButtonBaseScale = { x: container.scaleX, y: container.scaleY }
    this.quizSubmitButtonBounds.setTo(
      buttonX - buttonWidth / 2,
      buttonY - buttonHeight / 2,
      buttonWidth,
      buttonHeight,
    )

    return buttonX - buttonWidth / 2
  }

  private createUndoButton(rightX: number, buttonY: number, buttonHeight: number) {
    // 텍스트 라벨 기반의 가벼운 알약형 버튼 — 저장/리셋 PNG와 비슷한 톤
    const padX = 18
    const labelText = '↶ 되돌리기'
    const fontSize = Math.max(15, Math.round(buttonHeight * 0.42))

    const label = this.add
      .text(0, 0, labelText, {
        fontFamily: 'sans-serif',
        fontSize: `${fontSize}px`,
        color: '#5f3b22',
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 0.5)

    const buttonWidth = Math.max(buttonHeight * 2.2, label.width + padX * 2)
    const buttonX = rightX - buttonWidth / 2

    const background = this.add.graphics()
    const drawBackground = (fill: number, alpha = 1) => {
      background.clear()
      background.fillStyle(fill, alpha)
      background.fillRoundedRect(
        -buttonWidth / 2,
        -buttonHeight / 2,
        buttonWidth,
        buttonHeight,
        buttonHeight / 2,
      )
      background.lineStyle(2, 0xaa875b, 1)
      background.strokeRoundedRect(
        -buttonWidth / 2,
        -buttonHeight / 2,
        buttonWidth,
        buttonHeight,
        buttonHeight / 2,
      )
    }
    drawBackground(0xfffbf1)

    const container = this.add.container(buttonX, buttonY, [background, label]).setDepth(15)
    container.setSize(buttonWidth, buttonHeight)
    container.setInteractive({
      hitArea: new Phaser.Geom.Rectangle(
        -buttonWidth / 2,
        -buttonHeight / 2,
        buttonWidth,
        buttonHeight,
      ),
      hitAreaCallback: Phaser.Geom.Rectangle.Contains,
      useHandCursor: true,
    })

    container.on('pointerover', () => drawBackground(0xfff2d6))
    container.on('pointerout', () => drawBackground(0xfffbf1))
    container.on(
      'pointerdown',
      (
        _pointer: Phaser.Input.Pointer,
        _localX: number,
        _localY: number,
        event: Phaser.Types.Input.EventData,
      ) => {
        event.stopPropagation()
        this.undoLastStroke()
      },
    )

    this.undoButton = container
    this.undoButtonBaseScale = { x: container.scaleX, y: container.scaleY }
    this.undoButtonBounds.setTo(
      buttonX - buttonWidth / 2,
      buttonY - buttonHeight / 2,
      buttonWidth,
      buttonHeight,
    )
    this.refreshUndoButton()
  }

  private refreshUndoButton() {
    const container = this.undoButton
    if (!container) return
    const hasUndoable = this.strokeHistory.length > 0 || this.currentStrokeRecord !== null
    container.setAlpha(hasUndoable ? 1 : 0.5)
  }

  private createToolSelector() {
    const iconSize = Math.max(68, Math.min(90, Math.round(this.scale.width * 0.044)))
    const hitSize = iconSize + 8
    const hitRadius = hitSize / 2
    const gap = Math.max(10, Math.round(hitSize * 0.14))
    const totalHeight = DRAWING_TOOLS.length * hitSize + (DRAWING_TOOLS.length - 1) * gap
    const x = Math.min(
      this.scale.width - hitRadius - 18,
      this.paletteBounds.right + gap + hitRadius,
    )
    const maxTop = Math.max(16, this.scale.height - totalHeight - 16)
    const startY = Phaser.Math.Clamp(this.paletteBounds.centerY - totalHeight / 2, 16, maxTop)

    DRAWING_TOOLS.forEach((tool, index) => {
      const y = startY + hitRadius + index * (hitSize + gap)
      const frame = this.add
        .circle(x, y, hitRadius, 0xfff6e8, 0.001)
        .setStrokeStyle(0, 0xffffff, 0)
        .setDepth(14)
      const glow = this.add
        .image(x, y, tool === 'brush' ? 'art-ui-brush' : 'art-ui-eraser')
        .setDepth(14)
        .setDisplaySize(iconSize, iconSize)
        .setTint(0x7fa7ff)
        .setAlpha(0)
      const button = this.add
        .image(x, y, tool === 'brush' ? 'art-ui-brush' : 'art-ui-eraser')
        .setDepth(15)
        .setDisplaySize(iconSize, iconSize)
        .setInteractive({ useHandCursor: true })

      this.toolButtonFrames[tool] = frame
      this.toolButtonGlows[tool] = glow
      this.toolButtons[tool] = button
      this.toolButtonBaseScales[tool] = { x: button.scaleX, y: button.scaleY }

      button.on('pointerover', () => this.refreshToolButtons(tool))
      button.on('pointerout', () => this.refreshToolButtons())
      button.on(
        'pointerdown',
        (
          _pointer: Phaser.Input.Pointer,
          _localX: number,
          _localY: number,
          event: Phaser.Types.Input.EventData,
        ) => {
          event.stopPropagation()
          this.setDrawingTool(tool)
        },
      )
    })

    this.refreshToolButtons()
  }

  private createCameraPreview(vw: number, vh: number) {
    const panelCenterX = vw * 0.878
    const paletteHeight = Math.min(this.drawBounds.height * 0.78, vh * 0.72)
    const paletteBottom = this.drawBounds.top + 2 + paletteHeight
    const availableTop = paletteBottom + Math.max(10, vh * 0.012)
    const availableBottom = vh - Math.max(14, vh * 0.018)
    const availableHeight = Math.max(120, availableBottom - availableTop)
    const panelWidth = Math.max(180, Math.min(vw * 0.18, 300, availableHeight * (4 / 3)))
    const panelHeight = panelWidth * 0.75
    const panelY = Math.min(availableBottom - panelHeight / 2, availableTop + panelHeight / 2)

    this.cameraPreview = createArtCameraPreview(this, {
      depth: 8,
      getVideoElement: () => this.handTracker?.video ?? null,
      height: panelHeight,
      textureKey: `${this.scene.key}-camera-preview`,
      width: panelWidth,
      x: panelCenterX,
      y: panelY,
    })
  }

  private createExitButton(vw: number, _vh: number) {
    const buttonHeight = Math.max(48, Math.round(vw * 0.034))
    const buttonWidth = Math.round(
      buttonHeight * (DELETE_BUTTON_SIZE.width / DELETE_BUTTON_SIZE.height),
    )
    const button = this.add
      .image(vw - 26 - buttonWidth / 2, 26 + buttonHeight / 2, 'art-ui-delete-btn')
      .setDepth(16)
      .setDisplaySize(buttonWidth, buttonHeight)
      .setInteractive({ useHandCursor: true })
    this.exitButton = button
    this.exitButtonBaseScale = { x: button.scaleX, y: button.scaleY }

    button.on('pointerover', () => button.setTint(0xf9f1d9))
    button.on('pointerout', () => button.clearTint())
    button.on(
      'pointerdown',
      (
        _pointer: Phaser.Input.Pointer,
        _localX: number,
        _localY: number,
        event: Phaser.Types.Input.EventData,
      ) => {
        event.stopPropagation()
        this.requestReturnToArtRoom()
      },
    )
  }

  private createBrushCursor() {
    this.input.setDefaultCursor('none')
    this.brushCursor = this.add.image(0, 0, 'art-ui-brush').setDepth(BRUSH_CURSOR_DEPTH)
    this.brushCursor.setScrollFactor(0)
    this.brushColorOverlay = this.add
      .image(0, 0, getArtBrushColorOverlayTextureKey(this, this.currentColor))
      .setDepth(BRUSH_CURSOR_OVERLAY_DEPTH)
    this.brushColorOverlay.setScrollFactor(0)
    this.updateBrushCursorPosition(this.input.activePointer.x, this.input.activePointer.y)
    this.updateBrushCursorTexture()
  }

  private setDrawingTool(tool: DrawingTool) {
    this.currentTool = tool
    this.clearPendingHandTool()
    this.refreshToolButtons()
    this.updateBrushCursorTexture()
  }

  private refreshToolButtons(hoveredTool: DrawingTool | null = null) {
    DRAWING_TOOLS.forEach(tool => {
      const button = this.toolButtons[tool]
      const frame = this.toolButtonFrames[tool]
      const glow = this.toolButtonGlows[tool]
      const baseScale = this.toolButtonBaseScales[tool]
      if (!button || !frame || !glow || !baseScale) {
        return
      }

      const isSelected = tool === this.currentTool
      const isHovered = tool === hoveredTool
      frame.setFillStyle(0xfff6e8, 0.001)
      frame.setStrokeStyle(0, 0xffffff, 0)
      glow.setAlpha(isSelected ? 0.42 : isHovered ? 0.22 : 0)
      glow.setScale(
        baseScale.x * (isSelected ? 1.32 : 1.22),
        baseScale.y * (isSelected ? 1.32 : 1.22),
      )
      button.clearTint()
      button.setTint(isSelected ? 0xffffff : isHovered ? 0xfff0c7 : 0xffffff)
      button.setScale(
        baseScale.x * (isSelected ? 1.08 : isHovered ? 1.04 : 1),
        baseScale.y * (isSelected ? 1.08 : isHovered ? 1.04 : 1),
      )
    })
  }

  private updateBrushCursorTexture() {
    const brushCursor = this.brushCursor
    if (!brushCursor || !brushCursor.scene || !brushCursor.active) {
      return
    }

    if (this.currentTool === 'eraser') {
      brushCursor.setTexture('art-ui-eraser')
      brushCursor.setDisplaySize(54, 54)
      brushCursor.setOrigin(0.5, 0.5)
      this.updateBrushColorPreview()
      return
    }

    brushCursor.setTexture('art-ui-brush')
    brushCursor.setDisplaySize(48, 48)
    brushCursor.setOrigin(0.18, 0.88)
    this.updateBrushColorPreview()
  }

  private updateBrushCursorPosition(x: number, y: number) {
    if (this.brushCursor?.scene && this.brushCursor.active) {
      this.brushCursor.setPosition(x, y)
    }
    if (this.brushColorOverlay?.scene && this.brushColorOverlay.active) {
      this.brushColorOverlay.setPosition(x, y)
    }
  }

  private updateBrushColorPreview() {
    const brushColorOverlay = this.brushColorOverlay
    if (!brushColorOverlay || !brushColorOverlay.scene || !brushColorOverlay.active) {
      return
    }

    brushColorOverlay.setVisible(this.currentTool === 'brush')
    brushColorOverlay.setTexture(getArtBrushColorOverlayTextureKey(this, this.currentColor))
    brushColorOverlay.setDisplaySize(48, 48)
    brushColorOverlay.setOrigin(0.18, 0.88)
  }

  private startHandDrawingMode() {
    if (this.handTracker || this.isStartingHandTracker) {
      return
    }

    const tracker = new HandTracker()
    this.handTracker = tracker
    this.isStartingHandTracker = true

    void tracker
      .start()
      .then(() => {
        this.isStartingHandTracker = false

        if (this.handTrackingDisposed) {
          tracker.stop()
          if (this.handTracker === tracker) {
            this.handTracker = null
          }
        }
      })
      .catch(() => {
        this.isStartingHandTracker = false
        tracker.stop()

        if (this.handTracker === tracker) {
          this.handTracker = null
        }
      })
  }

  private stopHandTracking() {
    this.handTrackingDisposed = true
    this.isStartingHandTracker = false
    this.stopHandDrawing()
    this.clearPendingHandAction()
    this.clearPendingHandTool()
    this.clearPendingHandDialogButton()
    this.handPointerSmoother.reset()
    this.handTrackingGuard.reset()
    this.handTracker?.stop()
    this.handTracker = null
  }

  private updateHandDrawing(timestampMs: number) {
    const tracker = this.handTracker
    if (
      !tracker?.isStarted ||
      this.isDrawing ||
      this.isTransitioning ||
      this.isSavingDrawing ||
      this.isJudging
    ) {
      return
    }

    const result = tracker.detect(timestampMs)
    const handState = result.hands[0] ? this.getHandPointerState(result.hands[0]) : null
    const tracking = this.handTrackingGuard.update(handState?.point ?? null, result.timestampMs)

    if (tracking.shouldResetSmoother) {
      this.handPointerSmoother.reset()
      this.stopHandDrawing()
    }

    if (!tracking.point) {
      this.stopHandDrawing()
      this.clearPendingHandAction()
      this.clearPendingHandTool()
      this.clearPendingHandDialogButton()
      return
    }

    const smoothedPoint = this.handPointerSmoother.smooth(tracking.point)
    this.updateBrushCursorPosition(smoothedPoint.x, smoothedPoint.y)

    if (
      this.tryActivateConfirmDialogButtonFromHand(
        smoothedPoint,
        result.timestampMs,
        tracking.status !== 'missing',
      )
    ) {
      this.stopHandDrawing()
      this.clearPendingHandAction()
      this.clearPendingHandTool()
      return
    }

    if (tracking.status !== 'tracked') {
      return
    }

    if (!handState?.isDrawingGesture) {
      // 핀치하지 않은 상태에서 캔버스 위를 호버하면 그 위치를 기억 — 다음 펜다운 위치로 스냅.
      if (
        handState &&
        Phaser.Geom.Rectangle.Contains(this.drawBounds, handState.point.x, handState.point.y)
      ) {
        this.lastHoverPoint = {
          x: handState.point.x,
          y: handState.point.y,
          capturedAt: result.timestampMs,
        }
      }
      this.stopHandDrawing()
      this.clearPendingHandAction()
      this.clearPendingHandTool()
      return
    }

    if (this.tryActivateActionButtonFromHand(smoothedPoint, result.timestampMs)) {
      this.stopHandDrawing()
      this.clearPendingHandTool()
      return
    }

    if (this.trySelectToolFromHand(smoothedPoint, result.timestampMs)) {
      this.stopHandDrawing()
      return
    }

    if (this.trySelectColorFromHand(smoothedPoint, result.timestampMs)) {
      this.stopHandDrawing()
      this.clearPendingHandTool()
      return
    }

    if (
      !handState ||
      !Phaser.Geom.Rectangle.Contains(this.drawBounds, handState.point.x, handState.point.y)
    ) {
      this.stopHandDrawing()
      this.handPointerSmoother.reset()
      return
    }

    if (!Phaser.Geom.Rectangle.Contains(this.drawBounds, smoothedPoint.x, smoothedPoint.y)) {
      this.stopHandDrawing()
      this.handPointerSmoother.reset()
      return
    }

    this.drawHandPoint(handState.point)
  }

  private getHandPointerState(hand: TrackedHand): HandPointerState | null {
    const confidence = toPointerConfidence(hand.score, { activeThreshold: 0.35 })
    if (hand.score !== undefined && !confidence.isConfident) {
      return null
    }

    // 커서 위치를 결정하기 전에 핀치 여부부터 평가 — 핀치 중엔 엄지·검지 중점을 쓴다.
    // 단, 커서 위치는 "논리적 핀치 상태(isPinchActive)" 기준이고, 그리기 여부는
    // "안정된 핀치(전이 중 아님)" 기준이라 살짝 다름.
    const isDrawingGesture = this.evaluatePinchGesture(hand)
    const cursorLandmark = this.getHandCursorLandmark(hand, this.isPinchActive)
    if (!cursorLandmark) {
      return null
    }

    const pointerReference: PointerReference = {
      landmark: cursorLandmark,
      landmarkIndex: HAND_LANDMARK_INDEX.INDEX_FINGER_TIP,
      handedness: hand.handedness,
      score: hand.score,
    }

    const rawPointerCoordinates = toPointerCoordinates(
      pointerReference,
      { width: this.scale.width, height: this.scale.height },
      { mirrorX: true, clamp: false },
    )
    if (!this.isHandPointerInsideViewport(rawPointerCoordinates)) {
      return null
    }

    const pointerCoordinates = this.toReachableHandPointerCoordinates(rawPointerCoordinates)
    const canvasCoordinates = toPointerCanvasCoordinates(
      pointerCoordinates,
      {
        left: this.drawBounds.left,
        top: this.drawBounds.top,
        width: this.drawBounds.width,
        height: this.drawBounds.height,
      },
      undefined,
      { clampToCanvas: false },
    )

    return {
      point: new Phaser.Math.Vector2(
        this.drawBounds.left + canvasCoordinates.canvasX,
        this.drawBounds.top + canvasCoordinates.canvasY,
      ),
      isDrawingGesture,
    }
  }

  // 핀치 중엔 엄지·검지 끝 중점을 커서로 사용 — 핀치 동작 자체가 검지 끝을
  // 엄지 쪽으로 끌어당기는 걸 상쇄해 의도한 위치에 더 정확히 찍힘.
  private getHandCursorLandmark(hand: TrackedHand, isPinching: boolean): NormalizedLandmark | null {
    const index = hand.landmarks[HAND_LANDMARK_INDEX.INDEX_FINGER_TIP] ?? null

    if (!isPinching) {
      return index
    }

    const thumb = hand.landmarks[HAND_LANDMARK_INDEX.THUMB_TIP]
    if (!index || !thumb) {
      return index
    }

    return {
      x: (index.x + thumb.x) / 2,
      y: (index.y + thumb.y) / 2,
      z: (index.z + thumb.z) / 2,
      visibility: Math.min(index.visibility ?? 1, thumb.visibility ?? 1),
    }
  }

  // 핀치 진입(<0.15) / 해제(>0.20) — 손가락이 거의 닿은 상태에서만 펜다운.
  // ① 핀치 들어간 직후 PINCH_SETTLING_MS 동안은 그리기 차단 (접근 모션 끝자락 차단)
  // ② ratio가 한 프레임에 빠르게 변할 때(=모으는/펴는 중)는 그리기 차단 (모션 도중 차단)
  // 커서 위치(isPinchActive) 자체는 정상 갱신해서 호버 추적과 시각적 흔들림엔 영향 없음.
  private evaluatePinchGesture(hand: TrackedHand): boolean {
    const result = detectPinchGesture(hand)
    const ratio = result.pinchRatio
    if (ratio === null) {
      this.isPinchActive = false
      this.lastPinchRatio = null
      this.pinchActiveSince = 0
      return false
    }

    const previousRatio = this.lastPinchRatio
    const dRatio = previousRatio === null ? 0 : Math.abs(ratio - previousRatio)
    this.lastPinchRatio = ratio

    const wasActive = this.isPinchActive
    if (this.isPinchActive) {
      this.isPinchActive = ratio < PINCH_EXIT_RATIO
    } else {
      this.isPinchActive = ratio < PINCH_ENTER_RATIO
    }

    if (!wasActive && this.isPinchActive) {
      this.pinchActiveSince = this.time.now
    } else if (!this.isPinchActive) {
      this.pinchActiveSince = 0
    }

    const isStable = dRatio <= PINCH_TRANSITION_RATIO_DELTA
    const isSettled =
      this.pinchActiveSince > 0 && this.time.now - this.pinchActiveSince >= PINCH_SETTLING_MS
    return this.isPinchActive && isStable && isSettled
  }

  private isHandPointerInsideViewport(point: { normalizedX: number; normalizedY: number }) {
    return (
      point.normalizedX >= -HAND_POINTER_REJECT_MARGIN &&
      point.normalizedX <= 1 + HAND_POINTER_REJECT_MARGIN &&
      point.normalizedY >= -HAND_POINTER_REJECT_MARGIN &&
      point.normalizedY <= 1 + HAND_POINTER_REJECT_MARGIN
    )
  }

  private toReachableHandPointerCoordinates(
    point: ReturnType<typeof toPointerCoordinates>,
  ): ReturnType<typeof toPointerCoordinates> {
    const normalizedX = Phaser.Math.Clamp(
      (point.normalizedX - HAND_POINTER_CAMERA_BOUNDS.left) /
        (HAND_POINTER_CAMERA_BOUNDS.right - HAND_POINTER_CAMERA_BOUNDS.left),
      0,
      1,
    )
    const normalizedY = Phaser.Math.Clamp(
      (point.normalizedY - HAND_POINTER_CAMERA_BOUNDS.top) /
        (HAND_POINTER_CAMERA_BOUNDS.bottom - HAND_POINTER_CAMERA_BOUNDS.top),
      0,
      1,
    )

    return {
      ...point,
      normalizedX,
      normalizedY,
      x: normalizedX * this.scale.width,
      y: normalizedY * this.scale.height,
    }
  }

  // 핀치 직전 호버 위치가 가까운 곳에 남아 있으면 그 위치를 펜다운 위치로 사용 — 손이
  // 핀치 모션 중에 살짝 어긋나는 걸 보정.
  private resolveStrokeStartPoint(currentPoint: Phaser.Math.Vector2): Phaser.Math.Vector2 {
    const hover = this.lastHoverPoint
    if (!hover) {
      return currentPoint
    }

    if (this.time.now - hover.capturedAt > HOVER_AIM_FRESHNESS_MS) {
      return currentPoint
    }

    const snapDistance = Math.max(28, this.drawBounds.width * HOVER_AIM_REJOIN_RATIO)
    const aimDistance = Phaser.Math.Distance.Between(
      hover.x,
      hover.y,
      currentPoint.x,
      currentPoint.y,
    )
    if (aimDistance > snapDistance) {
      return currentPoint
    }

    return this.clampToDrawBounds(hover.x, hover.y)
  }

  private drawHandPoint(point: Phaser.Math.Vector2) {
    const rawPoint = this.clampToDrawBounds(point.x, point.y)

    // raw 좌표 기준 점프 감지: 손이 한 프레임에 너무 멀리 튀면 연결선 끊기
    const jumpThreshold = this.getHandDrawJumpDistance()
    const hasJumped =
      this.isHandDrawing &&
      this.lastHandRawPoint !== null &&
      Phaser.Math.Distance.BetweenPoints(this.lastHandRawPoint, rawPoint) > jumpThreshold

    if (hasJumped) {
      this.commitStrokeRecord()
      this.handDrawingSmoother.reset()
      this.lastHandDrawPoint = null
    }
    this.lastHandRawPoint = rawPoint

    const filteredPoint = this.handDrawingSmoother.smooth(rawPoint)
    const currentPoint = this.clampToDrawBounds(filteredPoint.x, filteredPoint.y)

    if (!this.isHandDrawing) {
      const startPoint = this.resolveStrokeStartPoint(currentPoint)
      this.isHandDrawing = true
      this.strokeCount += 1
      this.lastHandDrawPoint = startPoint
      this.drawDot(startPoint.x, startPoint.y)
      this.beginStrokeRecord(startPoint.x, startPoint.y)
      this.lastHoverPoint = null

      if (!this.hasStartedDrawing) {
        this.hasStartedDrawing = true
      }

      return
    }

    if (!this.lastHandDrawPoint) {
      const startPoint = this.resolveStrokeStartPoint(currentPoint)
      this.lastHandDrawPoint = startPoint
      this.drawDot(startPoint.x, startPoint.y)
      this.beginStrokeRecord(startPoint.x, startPoint.y)
      this.lastHoverPoint = null
      return
    }

    if (
      Phaser.Math.Distance.BetweenPoints(this.lastHandDrawPoint, currentPoint) <
      this.getHandDrawMinDistance()
    ) {
      return
    }

    this.drawStroke(this.lastHandDrawPoint, currentPoint)
    this.extendStrokeRecord(currentPoint.x, currentPoint.y)
    this.lastHandDrawPoint = currentPoint
  }

  private stopHandDrawing() {
    if (this.isHandDrawing) {
      this.commitStrokeRecord()
    }
    this.isHandDrawing = false
    this.lastHandDrawPoint = null
    this.lastHandRawPoint = null
    this.handDrawingSmoother.reset()
  }

  private tryActivateConfirmDialogButtonFromHand(
    point: Phaser.Math.Vector2,
    timestampMs: number,
    isSelectingGesture: boolean,
  ) {
    const dialog = this.getActiveConfirmDialog()
    if (!dialog) {
      this.clearPendingHandDialogButton()
      return false
    }

    if (!isSelectingGesture) {
      this.clearPendingHandDialogButton()
      return true
    }

    const button = dialog.getButtonAt(point)
    dialog.setButtonHover(button)
    if (!button) {
      this.clearPendingHandDialogButton()
      return true
    }

    if (this.pendingHandDialogButton !== button) {
      this.pendingHandDialogButton = button
      this.pendingHandDialogButtonStartedAt = timestampMs
      this.activatedHandDialogButton = null
      return true
    }

    if (
      this.activatedHandDialogButton === button ||
      timestampMs - this.pendingHandDialogButtonStartedAt < HAND_DIALOG_SELECT_HOLD_MS
    ) {
      return true
    }

    this.activatedHandDialogButton = button
    dialog.selectButton(button)
    return true
  }

  private getActiveConfirmDialog() {
    return (
      this.roundIntroDialog ??
      this.quizResultDialog ??
      this.saveVisibilityConfirmDialog ??
      this.exitConfirmDialog
    )
  }

  private clearPendingHandDialogButton() {
    this.pendingHandDialogButton = null
    this.pendingHandDialogButtonStartedAt = 0
    this.activatedHandDialogButton = null
    this.getActiveConfirmDialog()?.setButtonHover(null)
  }

  private tryActivateActionButtonFromHand(point: Phaser.Math.Vector2, timestampMs: number) {
    const action = this.getHandActionAt(point)
    if (!action) {
      this.clearPendingHandAction()
      return false
    }

    this.setActionButtonHover(action)

    if (this.pendingHandAction !== action) {
      this.pendingHandAction = action
      this.pendingHandActionStartedAt = timestampMs
      this.activatedHandAction = null
      return true
    }

    if (
      this.activatedHandAction === action ||
      timestampMs - this.pendingHandActionStartedAt < 600
    ) {
      return true
    }

    this.activatedHandAction = action
    if (action === 'save') {
      if (this.isQuizMode) {
        this.requestJudgeDrawing()
      } else {
        this.requestSaveDrawing()
      }
    } else if (action === 'reset') {
      this.resetDrawing()
    } else if (action === 'undo') {
      this.undoLastStroke()
    } else {
      this.requestReturnToArtRoom()
    }

    return true
  }

  private getHandActionAt(point: Phaser.Math.Vector2): HandActionKind | null {
    const padding = this.getHandActionHitPadding()

    if (this.undoButton && this.containsExpandedBounds(this.undoButtonBounds, point, padding)) {
      return 'undo'
    }

    if (
      this.saveButton &&
      this.containsExpandedBounds(this.saveButton.getBounds(), point, padding)
    ) {
      return 'save'
    }

    if (
      this.quizSubmitButton &&
      this.containsExpandedBounds(this.quizSubmitButtonBounds, point, padding)
    ) {
      return 'save'
    }

    if (
      this.resetButton &&
      this.containsExpandedBounds(this.resetButton.getBounds(), point, padding)
    ) {
      return 'reset'
    }

    if (
      this.exitButton &&
      this.containsExpandedBounds(this.exitButton.getBounds(), point, padding)
    ) {
      return 'exit'
    }

    return null
  }

  private setActionButtonHover(action: HandActionKind | null) {
    this.applyActionButtonEffect(this.saveButton, this.saveButtonBaseScale, action === 'save')
    this.applyActionButtonEffect(this.resetButton, this.resetButtonBaseScale, action === 'reset')
    this.applyActionButtonEffect(this.exitButton, this.exitButtonBaseScale, action === 'exit')
    this.applyUndoButtonHover(action === 'undo')
    if (this.quizSubmitButton) {
      this.quizSubmitButton.setScale(
        this.quizSubmitButtonBaseScale.x * (action === 'save' ? 1.06 : 1),
        this.quizSubmitButtonBaseScale.y * (action === 'save' ? 1.06 : 1),
      )
    }
  }

  private applyUndoButtonHover(isActive: boolean) {
    const container = this.undoButton
    if (!container) return
    container.setScale(
      this.undoButtonBaseScale.x * (isActive ? 1.06 : 1),
      this.undoButtonBaseScale.y * (isActive ? 1.06 : 1),
    )
  }

  private applyActionButtonEffect(
    button: Phaser.GameObjects.Image | null,
    baseScale: { x: number; y: number },
    isActive: boolean,
  ) {
    if (!button) {
      return
    }

    if (isActive) {
      button.setTint(0xf9f1d9)
      button.setScale(baseScale.x * 1.06, baseScale.y * 1.06)
      return
    }

    button.clearTint()
    button.setScale(baseScale.x, baseScale.y)
  }

  private clearPendingHandAction() {
    this.pendingHandAction = null
    this.pendingHandActionStartedAt = 0
    this.activatedHandAction = null
    this.setActionButtonHover(null)
  }

  private trySelectToolFromHand(point: Phaser.Math.Vector2, timestampMs: number) {
    const tool = this.getHandToolAt(point)
    if (!tool) {
      this.clearPendingHandTool()
      return false
    }

    this.refreshToolButtons(tool)

    if (this.pendingHandTool !== tool) {
      this.pendingHandTool = tool
      this.pendingHandToolStartedAt = timestampMs
      return true
    }

    if (timestampMs - this.pendingHandToolStartedAt < 600) {
      return true
    }

    if (tool === this.currentTool && timestampMs - this.lastHandToolSelectedAt < 220) {
      return true
    }

    this.setDrawingTool(tool)
    this.lastHandToolSelectedAt = timestampMs
    return true
  }

  private getHandToolAt(point: Phaser.Math.Vector2): DrawingTool | null {
    const padding = this.getHandToolHitPadding()

    for (const tool of DRAWING_TOOLS) {
      const bounds = this.toolButtonFrames[tool]?.getBounds()
      if (bounds && this.containsExpandedBounds(bounds, point, padding)) {
        return tool
      }
    }

    return null
  }

  private getHandActionHitPadding() {
    return Math.max(36, Math.round(Math.min(this.scale.width, this.scale.height) * 0.045))
  }

  private getHandToolHitPadding() {
    return Math.max(24, Math.round(Math.min(this.scale.width, this.scale.height) * 0.03))
  }

  private containsExpandedBounds(
    bounds: Phaser.Geom.Rectangle,
    point: Phaser.Math.Vector2,
    padding: number,
  ) {
    return (
      point.x >= bounds.left - padding &&
      point.x <= bounds.right + padding &&
      point.y >= bounds.top - padding &&
      point.y <= bounds.bottom + padding
    )
  }

  private clearPendingHandTool() {
    this.pendingHandTool = null
    this.pendingHandToolStartedAt = 0
    this.refreshToolButtons()
  }

  private trySelectColorFromHand(point: Phaser.Math.Vector2, timestampMs: number) {
    const nearest = this.getPaletteColorAt(point.x, point.y)
    if (!nearest) {
      this.clearPendingHandColor()
      return false
    }

    if (this.pendingHandColor !== nearest.color) {
      this.pendingHandColor = nearest.color
      this.pendingHandColorStartedAt = timestampMs
      return true
    }

    if (timestampMs - this.pendingHandColorStartedAt < 600) {
      return true
    }

    if (nearest.color === this.currentColor && timestampMs - this.lastHandColorSelectedAt < 220) {
      return true
    }

    this.selectColor(nearest.color, nearest.x, nearest.y)
    this.lastHandColorSelectedAt = timestampMs
    this.clearPendingHandColor()

    return true
  }

  private clearPendingHandColor() {
    this.pendingHandColor = null
    this.pendingHandColorStartedAt = 0
  }

  private selectColor(color: number, _x: number, _y: number) {
    this.currentColor = color
    this.setDrawingTool('brush')
    this.paletteSelection.setVisible(false)
  }

  private getPaletteColorAt(x: number, y: number): PalettePoint | null {
    const nearest = this.getNearestPaletteColor(x, y)
    if (!nearest) {
      return null
    }

    const distance = Phaser.Math.Distance.Between(x, y, nearest.x, nearest.y)
    if (distance > this.getPaletteHitRadius()) {
      return null
    }

    return nearest
  }

  private getPaletteHitRadius() {
    return Math.max(24, Math.min(this.scale.width, this.scale.height) * 0.034)
  }

  private getNearestPaletteColor(x: number, y: number): PalettePoint | null {
    let nearest: PalettePoint | null = null
    let nearestDistance = Number.POSITIVE_INFINITY

    for (const point of this.palettePoints) {
      const distance = Phaser.Math.Distance.Between(x, y, point.x, point.y)
      if (distance < nearestDistance) {
        nearest = point
        nearestDistance = distance
      }
    }

    return nearest
  }

  private beginStrokeRecord(x: number, y: number) {
    // 진행 중 스트로크가 남아 있으면 먼저 마무리(예: jump 감지로 강제 분리될 때)
    if (this.currentStrokeRecord) {
      this.commitStrokeRecord()
    }
    this.currentStrokeRecord = {
      tool: this.currentTool,
      color: this.currentColor,
      size: this.getActiveStrokeSize(),
      points: [{ x, y }],
    }
  }

  private extendStrokeRecord(x: number, y: number) {
    if (!this.currentStrokeRecord) {
      this.beginStrokeRecord(x, y)
      return
    }
    this.currentStrokeRecord.points.push({ x, y })
  }

  private commitStrokeRecord() {
    const stroke = this.currentStrokeRecord
    this.currentStrokeRecord = null
    if (!stroke || stroke.points.length === 0) {
      return
    }
    this.strokeHistory.push(stroke)
    if (this.strokeHistory.length > MAX_STROKE_HISTORY) {
      this.strokeHistory.shift()
    }
    this.refreshUndoButton()
  }

  private undoLastStroke() {
    // 진행 중 스트로크가 있으면 먼저 그것부터 되돌림(이미 캔버스에 일부 찍혔으니까)
    if (this.currentStrokeRecord) {
      this.currentStrokeRecord = null
      this.isDrawing = false
      this.isHandDrawing = false
      this.activeDrawingPointerId = null
      this.lastDrawPoint = null
      this.lastHandDrawPoint = null
      this.lastHandRawPoint = null
      this.handDrawingSmoother.reset()
      this.redrawFromHistory()
      this.refreshUndoButton()
      return
    }

    if (this.strokeHistory.length === 0) {
      return
    }
    this.strokeHistory.pop()
    this.redrawFromHistory()
    if (this.strokeHistory.length === 0 && !this.editingArtwork) {
      this.hasStartedDrawing = false
      this.usedColors.clear()
    }
    this.refreshUndoButton()
  }

  private redrawFromHistory() {
    this.drawingTexture.clear()
    this.applyInitialArtworkImage()
    for (const stroke of this.strokeHistory) {
      this.replayStrokeRecord(stroke)
    }
  }

  private replayStrokeRecord(stroke: StrokeRecord) {
    const drawColor = stroke.tool === 'eraser' ? 0xffffff : stroke.color
    const first = stroke.points[0]
    if (!first) {
      return
    }

    this.brushStroke.clear()
    this.brushStroke.fillStyle(drawColor, 1)
    this.brushStroke.fillCircle(
      first.x - this.drawBounds.x,
      first.y - this.drawBounds.y,
      stroke.size / 2,
    )
    this.drawingTexture.draw(this.brushStroke)

    for (let i = 1; i < stroke.points.length; i += 1) {
      const from = stroke.points[i - 1]
      const to = stroke.points[i]
      this.brushStroke.clear()
      this.brushStroke.lineStyle(stroke.size, drawColor, 1)
      this.brushStroke.beginPath()
      this.brushStroke.moveTo(from.x - this.drawBounds.x, from.y - this.drawBounds.y)
      this.brushStroke.lineTo(to.x - this.drawBounds.x, to.y - this.drawBounds.y)
      this.brushStroke.strokePath()
      this.brushStroke.fillStyle(drawColor, 1)
      this.brushStroke.fillCircle(
        to.x - this.drawBounds.x,
        to.y - this.drawBounds.y,
        stroke.size / 2,
      )
      this.drawingTexture.draw(this.brushStroke)
    }
  }

  private drawDot(x: number, y: number) {
    const strokeSize = this.getActiveStrokeSize()
    this.brushStroke.clear()
    this.brushStroke.fillStyle(this.getActiveStrokeColor(), 1)
    this.brushStroke.fillCircle(x - this.drawBounds.x, y - this.drawBounds.y, strokeSize / 2)
    this.drawingTexture.draw(this.brushStroke)
    this.recordUsedColor()
  }

  private drawStroke(from: Phaser.Math.Vector2, to: Phaser.Math.Vector2) {
    const strokeSize = this.getActiveStrokeSize()
    const strokeColor = this.getActiveStrokeColor()
    this.brushStroke.clear()
    this.brushStroke.lineStyle(strokeSize, strokeColor, 1)
    this.brushStroke.beginPath()
    this.brushStroke.moveTo(from.x - this.drawBounds.x, from.y - this.drawBounds.y)
    this.brushStroke.lineTo(to.x - this.drawBounds.x, to.y - this.drawBounds.y)
    this.brushStroke.strokePath()
    this.brushStroke.fillStyle(strokeColor, 1)
    this.brushStroke.fillCircle(to.x - this.drawBounds.x, to.y - this.drawBounds.y, strokeSize / 2)
    this.drawingTexture.draw(this.brushStroke)
    this.recordUsedColor()
  }

  private recordUsedColor() {
    if (this.currentTool !== 'eraser') {
      this.usedColors.add(this.currentColor)
    }
  }

  private getActiveStrokeColor() {
    return this.currentTool === 'eraser' ? 0xffffff : this.currentColor
  }

  private getActiveStrokeSize() {
    const brushSize = this.getBrushSize()
    return this.currentTool === 'eraser' ? Math.round(brushSize * 2.1) : brushSize
  }

  private getBrushSize() {
    return Math.max(6, Math.round(this.drawBounds.width * 0.013))
  }

  private getHandDrawMinDistance() {
    return Phaser.Math.Clamp(
      Math.round(this.drawBounds.width * HAND_DRAW_MIN_DISTANCE_RATIO),
      4,
      12,
    )
  }

  private getHandDrawJumpDistance() {
    return Math.max(48, Math.round(this.drawBounds.width * HAND_DRAW_JUMP_DISTANCE_RATIO))
  }

  private getPointerDrawMinDistance() {
    return Phaser.Math.Clamp(
      Math.round(this.drawBounds.width * POINTER_DRAW_MIN_DISTANCE_RATIO),
      3,
      10,
    )
  }

  private clampToDrawBounds(x: number, y: number) {
    return new Phaser.Math.Vector2(
      Phaser.Math.Clamp(x, this.drawBounds.left, this.drawBounds.right),
      Phaser.Math.Clamp(y, this.drawBounds.top, this.drawBounds.bottom),
    )
  }

  private stopDrawing() {
    if (this.isDrawing) {
      this.commitStrokeRecord()
    }
    this.isDrawing = false
    this.activeDrawingPointerId = null
    this.lastDrawPoint = null
  }

  private resetDrawing() {
    this.stopDrawing()
    this.stopHandDrawing()
    this.handPointerSmoother.reset()
    this.handTrackingGuard.reset()
    this.drawingTexture.clear()
    this.applyInitialArtworkImage()
    this.strokeHistory = []
    this.currentStrokeRecord = null
    this.hasStartedDrawing = Boolean(this.editingArtwork)
    this.strokeCount = 0
    this.usedColors.clear()
    this.refreshUndoButton()
  }

  private requestSaveDrawing() {
    if (
      this.isTransitioning ||
      this.isSavingDrawing ||
      this.isExitConfirmOpen ||
      this.isSaveVisibilityConfirmOpen
    ) {
      return
    }

    this.stopDrawing()
    this.stopHandDrawing()
    this.showSaveVisibilityConfirm()
  }

  private requestJudgeDrawing() {
    if (
      this.isTransitioning ||
      this.isSavingDrawing ||
      this.isJudging ||
      this.isExitConfirmOpen ||
      this.isQuizResultOpen
    ) {
      return
    }
    if (!this.currentPrompt) {
      return
    }
    if (!this.hasStartedDrawing) {
      // 아직 한 획도 안 그렸으면 무시 — 헛 제출 방지
      return
    }

    this.stopDrawing()
    this.stopHandDrawing()
    void this.judgeAndSaveDrawing()
  }

  private async judgeAndSaveDrawing() {
    const prompt = this.currentPrompt
    if (!prompt) return

    this.isJudging = true
    this.showJudgingOverlay()
    const playDurationSeconds = this.getPlayDurationSeconds()

    let exported: ExportedDrawingPng | null = null
    let guessResult: DrawingGuessResult | null = null
    try {
      exported = await this.exportDrawingPng(playDurationSeconds, false)
      // 판정과 저장을 병렬로 — 판정이 실패해도 저장은 시도
      const [guess] = await Promise.all([
        submitDrawingGuess({
          prompt: prompt.word,
          image: exported.blob,
          filename: exported.filename,
        })
          .then(response => response.data)
          .catch(error => {
            console.error('Failed to judge drawing.', error)
            return null
          }),
        createArtwork({
          image: exported.blob,
          filename: exported.filename,
          sketchCode: null,
          playDurationSeconds: exported.playDurationSeconds,
          isPublic: exported.isPublic,
          colorCount: exported.colorCount,
        }).catch(error => {
          console.error('Failed to save quiz artwork.', error)
          return null
        }),
      ])
      guessResult = guess
    } finally {
      this.hideJudgingOverlay()
      this.isJudging = false
    }

    this.showQuizResultDialog(prompt, guessResult)
  }

  private showJudgingOverlay() {
    if (this.judgingOverlay) return
    const { width: vw, height: vh } = this.scale
    const backdrop = this.add
      .rectangle(0, 0, vw, vh, 0x000000, 0.42)
      .setOrigin(0, 0)
      .setInteractive()
    const text = this.add
      .text(vw / 2, vh / 2 - 16, 'AI가 살펴보는 중', {
        fontFamily: 'sans-serif',
        fontSize: '32px',
        color: '#fff8ec',
        stroke: '#3f2615',
        strokeThickness: 6,
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 0.5)

    // 점 3개 통통 튀는 애니메이션
    const dotSpacing = 22
    const dotY = vh / 2 + 32
    const dotCenterX = vw / 2
    const dotColor = 0xfff8ec
    const dotRadius = 7
    const dots: Phaser.GameObjects.Graphics[] = []
    const dotTweens: Phaser.Tweens.Tween[] = []
    for (let i = 0; i < 3; i += 1) {
      const dot = this.add.graphics()
      dot.fillStyle(dotColor, 1)
      dot.fillCircle(0, 0, dotRadius)
      dot.setPosition(dotCenterX + (i - 1) * dotSpacing, dotY)
      dots.push(dot)
      dotTweens.push(
        this.tweens.add({
          targets: dot,
          y: dotY - 12,
          duration: 380,
          delay: i * 130,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.InOut',
        }),
      )
    }

    const overlay = this.add.container(0, 0, [backdrop, text, ...dots]).setDepth(EXIT_CONFIRM_DEPTH)
    overlay.setData('dotTweens', dotTweens)
    this.judgingOverlay = overlay
  }

  private hideJudgingOverlay() {
    const tweens = this.judgingOverlay?.getData('dotTweens') as Phaser.Tweens.Tween[] | undefined
    tweens?.forEach(tween => tween.stop())
    this.judgingOverlay?.destroy()
    this.judgingOverlay = null
  }

  private showQuizResultDialog(prompt: DrawingPrompt, result: DrawingGuessResult | null) {
    if (this.isQuizResultOpen) return
    this.pauseHandInputForConfirmDialog()
    this.isQuizResultOpen = true

    const isFallback = result === null || result.source === 'FALLBACK'
    const isCorrect = result?.isMatch === true && !isFallback
    const guess = result?.guess?.trim() ?? ''

    this.quizResultDialog = createQuizResultDialog({
      scene: this,
      depth: EXIT_CONFIRM_DEPTH,
      isCorrect,
      isFallback,
      prompt: prompt.word,
      aiGuess: guess.length > 0 ? guess : null,
      onNext: () => {
        this.hideQuizResultDialog()
        this.startNextQuizRound()
      },
      onExit: () => {
        this.hideQuizResultDialog()
        this.returnToArtRoom()
      },
    })
  }

  private hideQuizResultDialog() {
    this.quizResultDialog?.setButtonHover(null)
    this.quizResultDialog?.destroy()
    this.quizResultDialog = null
    this.isQuizResultOpen = false
    this.clearPendingHandDialogButton()
  }

  private startNextQuizRound() {
    // 종료 전환(returnToArtRoom) 중이거나 종료 확인이 떠있는 동안엔 새 라운드 진입 차단 —
    // "그만하기"와 동시에 hand-tracking/중복 클릭으로 onNext 가 한 번 더 트리거돼도 안전.
    if (this.isTransitioning || this.isExitConfirmOpen) {
      return
    }
    this.currentPrompt = pickRandomPrompt(this.currentPrompt?.word)
    this.refreshPromptCard()
    this.resetDrawing()
    this.contentStartedAt = this.time.now
    if (this.currentPrompt) {
      this.showRoundIntro(this.currentPrompt)
    }
  }

  private showRoundIntro(prompt: DrawingPrompt) {
    if (this.isRoundIntroOpen || this.isTransitioning) return
    this.pauseHandInputForConfirmDialog()
    this.isRoundIntroOpen = true
    this.roundIntroDialog = createQuizRoundIntroDialog({
      scene: this,
      depth: EXIT_CONFIRM_DEPTH + 5,
      prompt: prompt.word,
      onStart: () => this.hideRoundIntro(),
      onExit: () => {
        this.hideRoundIntro()
        this.returnToArtRoom()
      },
    })
  }

  private hideRoundIntro() {
    this.roundIntroDialog?.setButtonHover(null)
    this.roundIntroDialog?.destroy()
    this.roundIntroDialog = null
    this.isRoundIntroOpen = false
    this.clearPendingHandDialogButton()
    // 인트로 닫고 나서야 실제 플레이 타이머 시작
    this.contentStartedAt = this.time.now
  }

  private saveDrawing(isPublic: boolean) {
    if (this.isSavingDrawing) {
      return
    }

    this.isSavingDrawing = true
    const playDurationSeconds = this.getPlayDurationSeconds()
    void this.exportDrawingPng(playDurationSeconds, isPublic)
      .then(exportedDrawing => {
        const colorCount = exportedDrawing.colorCount
        if (this.editingArtwork) {
          return updateArtwork({
            id: this.editingArtwork.id,
            image: exportedDrawing.blob,
            filename: exportedDrawing.filename,
            additionalPlayDurationSeconds: exportedDrawing.playDurationSeconds,
            isPublic: exportedDrawing.isPublic,
            colorCount,
          })
        }

        return createArtwork({
          image: exportedDrawing.blob,
          filename: exportedDrawing.filename,
          sketchCode: null,
          playDurationSeconds: exportedDrawing.playDurationSeconds,
          isPublic: exportedDrawing.isPublic,
          colorCount,
        })
      })
      .then(() => {
        this.hasStartedDrawing = false
        this.returnToArtRoom()
      })
      .catch(error => {
        console.error('Failed to save free drawing artwork.', error)
      })
      .finally(() => {
        this.isSavingDrawing = false
      })
  }

  private exportDrawingPng(
    playDurationSeconds: number,
    isPublic: boolean,
  ): Promise<ExportedDrawingPng> {
    return new Promise((resolve, reject) => {
      this.drawingTexture.snapshot(snapshot => {
        if (!(snapshot instanceof HTMLImageElement) && !(snapshot instanceof HTMLCanvasElement)) {
          reject(new Error('Drawing snapshot did not return an image.'))
          return
        }

        const width = Math.round(this.drawBounds.width)
        const height = Math.round(this.drawBounds.height)
        const outputCanvas = document.createElement('canvas')
        outputCanvas.width = width
        outputCanvas.height = height
        const context = outputCanvas.getContext('2d')

        if (!context) {
          reject(new Error('Failed to create drawing export canvas.'))
          return
        }

        context.fillStyle = '#ffffff'
        context.fillRect(0, 0, width, height)
        context.drawImage(snapshot, 0, 0, width, height)

        const colorCount = this.usedColors.size

        const dataUrl = outputCanvas.toDataURL('image/png')
        resolve({
          blob: this.dataUrlToBlob(dataUrl),
          dataUrl,
          filename: `free-drawing-${Date.now()}.png`,
          isPublic,
          playDurationSeconds,
          width,
          height,
          colorCount,
        })
      }, 'image/png')
    })
  }

  private getPlayDurationSeconds() {
    return Math.max(0, Math.floor((this.time.now - this.contentStartedAt) / 1000))
  }

  private dataUrlToBlob(dataUrl: string) {
    const [metadata, base64Data] = dataUrl.split(',')
    const mimeType = metadata.match(/^data:(.*?);/)?.[1] ?? 'image/png'
    const binary = atob(base64Data)
    const bytes = new Uint8Array(binary.length)

    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i)
    }

    return new Blob([bytes], { type: mimeType })
  }

  private requestReturnToArtRoom() {
    if (this.isTransitioning || this.isSavingDrawing || this.isSaveVisibilityConfirmOpen) {
      return
    }

    this.stopDrawing()
    this.stopHandDrawing()

    if (this.hasStartedDrawing) {
      this.showExitConfirm()
      return
    }

    this.returnToArtRoom()
  }

  private showExitConfirm() {
    if (this.isExitConfirmOpen) {
      return
    }

    this.pauseHandInputForConfirmDialog()
    this.isExitConfirmOpen = true
    this.exitConfirmDialog = createArtConfirmDialog(this, {
      depth: EXIT_CONFIRM_DEPTH,
      title: '아직 저장하지 않았어요',
      message: '나가면 지금 그린 그림은 사라져요.',
      secondaryButton: {
        label: '계속 그리기',
        fillColor: 0xfffbf1,
        strokeColor: 0xaa875b,
        textColor: '#5f3b22',
        onSelect: () => this.hideExitConfirm(),
      },
      primaryButton: {
        label: '나가기',
        fillColor: 0xb7603b,
        strokeColor: 0x7c3f27,
        textColor: '#ffffff',
        onSelect: () => {
          this.hideExitConfirm()
          this.returnToArtRoom()
        },
      },
    })
  }

  private showSaveVisibilityConfirm() {
    if (this.isSaveVisibilityConfirmOpen) {
      return
    }

    this.pauseHandInputForConfirmDialog()
    this.isSaveVisibilityConfirmOpen = true
    this.saveVisibilityConfirmDialog = createArtConfirmDialog(this, {
      depth: EXIT_CONFIRM_DEPTH,
      title: '공개 범위를 선택해줘',
      message: '저장한 그림을 다른 사람에게 보여줄까요?',
      secondaryButton: {
        label: '나만 보기',
        fillColor: 0xfffbf1,
        strokeColor: 0xaa875b,
        textColor: '#5f3b22',
        onSelect: () => {
          this.hideSaveVisibilityConfirm()
          this.saveDrawing(false)
        },
      },
      primaryButton: {
        label: '공개하기',
        fillColor: 0x65a843,
        strokeColor: 0x3f752a,
        textColor: '#ffffff',
        onSelect: () => {
          this.hideSaveVisibilityConfirm()
          this.saveDrawing(true)
        },
      },
    })
  }

  private pauseHandInputForConfirmDialog() {
    this.stopDrawing()
    this.stopHandDrawing()
    this.clearPendingHandAction()
    this.clearPendingHandTool()
    this.clearPendingHandDialogButton()
    this.handPointerSmoother.reset()
  }

  private hideExitConfirm() {
    this.exitConfirmDialog?.setButtonHover(null)
    this.exitConfirmDialog?.destroy()
    this.exitConfirmDialog = null
    this.isExitConfirmOpen = false
    this.clearPendingHandDialogButton()
  }

  private hideSaveVisibilityConfirm() {
    this.saveVisibilityConfirmDialog?.setButtonHover(null)
    this.saveVisibilityConfirmDialog?.destroy()
    this.saveVisibilityConfirmDialog = null
    this.isSaveVisibilityConfirmOpen = false
    this.clearPendingHandDialogButton()
  }

  private returnToArtRoom() {
    if (this.isTransitioning) {
      return
    }

    this.isTransitioning = true
    this.hideExitConfirm()
    this.hideSaveVisibilityConfirm()
    this.stopDrawing()
    this.stopHandTracking()
    this.cameras.main.fadeOut(220, 0, 0, 0)
    this.time.delayedCall(220, () => {
      this.scene.start('ArtSelectScene', {
        spawn: ART_ROOM_RETURN_SPAWN,
        suppressRumiDialog: true,
      })
    })
  }
}
