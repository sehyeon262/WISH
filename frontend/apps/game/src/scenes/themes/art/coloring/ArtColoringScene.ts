import Phaser from 'phaser'
import { playSceneBgm } from '@/game/systems/sceneBgm'
import { createArtwork, updateArtwork } from '@wish/api-client'
import { assetPath } from '@/game/assets/assetPath'
import { createSceneWeatherLayer } from '@/features/weather/phaserWeatherLayer'
import { HandTracker, type TrackedHand } from '@/game/motion/handTracker'
import { detectIndexFingerGesture } from '@/game/motion/indexFingerGesture'
import { toPointerCanvasCoordinates } from '@/game/motion/pointerCanvasCoordinates'
import { toPointerConfidence } from '@/game/motion/pointerConfidence'
import { toPointerCoordinates } from '@/game/motion/pointerCoordinates'
import { getPointerReference } from '@/game/motion/pointerReference'
import { PointerSmoother } from '@/game/motion/pointerSmoother'
import { PointerTrackingGuard } from '@/game/motion/pointerTrackingGuard'
import { createArtCameraPreview, type ArtCameraPreview } from '../ui/artCameraPreview'
import { getArtBrushColorOverlayTextureKey } from '../ui/artBrushColorOverlayTexture'
import {
  createArtConfirmDialog,
  type ArtConfirmDialog,
  type ArtConfirmDialogButtonRole,
} from '../ui/artConfirmDialog'
import { getColoringOption, coloringOptions, type ColoringOption } from './coloringOptions'

const CANVAS_SOURCE_SIZE = { width: 1535, height: 1024 }
const CANVAS_DRAW_AREA = { x: 120, y: 150, width: 1288, height: 620 }
const DELETE_BUTTON_SIZE = { width: 344, height: 336 }
const ART_ROOM_RETURN_SPAWN = { xRatio: 0.5, yRatio: 0.76 }
const FILLABLE_WHITE_THRESHOLD = 245
const HAND_FILL_COOLDOWN_MS = 320
const HAND_FILL_HOLD_MS = 900
const HAND_FILL_STILL_RADIUS = 58
const EXIT_CONFIRM_DEPTH = 60
const BRUSH_CURSOR_DEPTH = EXIT_CONFIRM_DEPTH + 12
const BRUSH_CURSOR_OVERLAY_DEPTH = BRUSH_CURSOR_DEPTH + 1
const HAND_DIALOG_SELECT_HOLD_MS = 450
const HAND_POINTER_REJECT_MARGIN = 0.08
const HAND_POINTER_CAMERA_BOUNDS = { left: 0.06, right: 0.94, top: 0.06, bottom: 0.78 } as const
type ColoringTool = 'brush' | 'eraser'
const COLORING_TOOLS: ColoringTool[] = ['brush', 'eraser']
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

type ArtColoringSceneData = {
  coloringId?: string
  suppressIntroDialog?: boolean
  editArtwork?: EditableArtworkSceneData
}
type EditableArtworkSceneData = {
  id: number
  imageTextureKey: string
  isPublic: boolean
}

type PalettePoint = { color: number; x: number; y: number }
type HandPointerState = {
  point: Phaser.Math.Vector2
  isColoringGesture: boolean
}
type HandActionKind = 'save' | 'reset' | 'exit'
type CachedFillRegion = {
  pixelIndices: Uint32Array
  bounds: { minX: number; minY: number; maxX: number; maxY: number }
}
type ExportedColoringPng = {
  blob: Blob
  filename: string
  isPublic: boolean
  playDurationSeconds: number
}

export class ArtColoringScene extends Phaser.Scene {
  private selectedOption: ColoringOption = coloringOptions[0]
  private drawBounds = new Phaser.Geom.Rectangle()
  private coloringBaseBounds = new Phaser.Geom.Rectangle()
  private paletteBounds = new Phaser.Geom.Rectangle()
  private coloringTexture!: Phaser.GameObjects.RenderTexture
  private paletteSelection!: Phaser.GameObjects.Arc
  private cameraPreview: ArtCameraPreview | null = null
  private brushCursor: Phaser.GameObjects.Image | null = null
  private brushColorOverlay: Phaser.GameObjects.Image | null = null
  private handFillGauge: Phaser.GameObjects.Graphics | null = null
  private toolButtons: Partial<Record<ColoringTool, Phaser.GameObjects.Image>> = {}
  private toolButtonFrames: Partial<Record<ColoringTool, Phaser.GameObjects.Arc>> = {}
  private toolButtonGlows: Partial<Record<ColoringTool, Phaser.GameObjects.Image>> = {}
  private toolButtonBaseScales: Partial<Record<ColoringTool, { x: number; y: number }>> = {}
  private saveButton: Phaser.GameObjects.Image | null = null
  private resetButton: Phaser.GameObjects.Image | null = null
  private exitButton: Phaser.GameObjects.Image | null = null
  private currentTool: ColoringTool = 'brush'
  private currentColor: number = PALETTE_SWATCHES[0].color
  private palettePoints: PalettePoint[] = []
  private handTracker: HandTracker | null = null
  private readonly handPointerSmoother = new PointerSmoother({ alpha: 0.24 })
  private readonly handTrackingGuard = new PointerTrackingGuard<Phaser.Math.Vector2>({
    holdDurationMs: 40,
  })
  private isTransitioning = false
  private isDrawing = false
  private activeDrawingPointerId: number | null = null
  private isStartingHandTracker = false
  private handTrackingDisposed = false
  private hasStartedColoring = false
  private strokeCount = 0
  private saveButtonBaseScale = { x: 1, y: 1 }
  private resetButtonBaseScale = { x: 1, y: 1 }
  private exitButtonBaseScale = { x: 1, y: 1 }
  private sourceImageData: ImageData | null = null
  private sourceImageSize = { width: 0, height: 0 }
  private sourceFillBounds = { minX: 0, minY: 0, maxX: 0, maxY: 0 }
  private regionIdByPixel: Int32Array | null = null
  private cachedFillRegions: CachedFillRegion[] = []
  private filledRegionColorById: Int32Array | null = null
  private fillTextureIndex = 0
  private lastHandColorSelectedAt = 0
  private pendingHandColor: number | null = null
  private pendingHandColorStartedAt = 0
  private pendingHandTool: ColoringTool | null = null
  private pendingHandToolStartedAt = 0
  private lastHandToolSelectedAt = 0
  private pendingHandAction: HandActionKind | null = null
  private pendingHandActionStartedAt = 0
  private activatedHandAction: HandActionKind | null = null
  private pendingHandDialogButton: ArtConfirmDialogButtonRole | null = null
  private pendingHandDialogButtonStartedAt = 0
  private activatedHandDialogButton: ArtConfirmDialogButtonRole | null = null
  private lastHandFillRegionId: number | null = null
  private lastHandFillAt = 0
  private pendingHandFillRegionId: number | null = null
  private pendingHandFillStartedAt = 0
  private readonly pendingHandFillPoint = new Phaser.Math.Vector2()
  private pendingHandFillColor: number | null = null
  private isSavingColoring = false
  private isExitConfirmOpen = false
  private exitConfirmDialog: ArtConfirmDialog | null = null
  private isSaveVisibilityConfirmOpen = false
  private saveVisibilityConfirmDialog: ArtConfirmDialog | null = null
  private editingArtwork: EditableArtworkSceneData | null = null
  private contentStartedAt = 0

  private readonly handlePointerDown = (pointer: Phaser.Input.Pointer) => {
    if (
      this.isTransitioning ||
      this.isSavingColoring ||
      this.isExitConfirmOpen ||
      this.isSaveVisibilityConfirmOpen
    ) {
      return
    }

    if (!this.handTracker?.isStarted && !this.isStartingHandTracker) {
      this.startHandColoringMode()
    }

    if (!Phaser.Geom.Rectangle.Contains(this.drawBounds, pointer.x, pointer.y)) {
      return
    }

    if (this.activeDrawingPointerId !== null) {
      return
    }

    if (this.currentTool === 'eraser') {
      this.activeDrawingPointerId = pointer.id
      this.isDrawing = true
      if (this.fillRegionAt(pointer.x, pointer.y, 0xffffff)) {
        this.handleSuccessfulFill()
      }
      return
    }

    if (this.fillRegionAt(pointer.x, pointer.y)) {
      this.handleSuccessfulFill()
    }
  }

  private readonly handlePointerMove = (pointer: Phaser.Input.Pointer) => {
    if (
      this.isTransitioning ||
      this.isSavingColoring ||
      this.isExitConfirmOpen ||
      this.isSaveVisibilityConfirmOpen
    ) {
      this.stopDrawing()
      return
    }

    if (this.activeDrawingPointerId !== pointer.id) {
      return
    }

    if (this.currentTool !== 'eraser' || !this.isDrawing || !pointer.isDown) {
      return
    }

    if (!Phaser.Geom.Rectangle.Contains(this.drawBounds, pointer.x, pointer.y)) {
      this.stopDrawing()
      return
    }

    if (this.fillRegionAt(pointer.x, pointer.y, 0xffffff)) {
      this.handleSuccessfulFill()
    }
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

    this.requestReturnToArtRoom()
  }

  constructor() {
    super({ key: 'ArtColoringScene' })
  }

  init(data: ArtColoringSceneData = {}) {
    this.selectedOption = getColoringOption(data.coloringId)
    this.editingArtwork = data.editArtwork ?? null
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
    coloringOptions.forEach(option => {
      this.load.image(option.assetKey, option.imagePath)
    })
  }

  create() {
    playSceneBgm(this)
    this.contentStartedAt = this.time.now
    this.isTransitioning = false
    this.isDrawing = false
    this.hasStartedColoring = false
    this.strokeCount = 0
    this.handTrackingDisposed = false
    this.currentTool = 'brush'
    this.brushCursor = null
    this.brushColorOverlay = null
    this.cameraPreview = null
    this.toolButtons = {}
    this.toolButtonFrames = {}
    this.toolButtonGlows = {}
    this.toolButtonBaseScales = {}
    this.lastHandFillRegionId = null
    this.lastHandFillAt = 0
    this.pendingHandFillRegionId = null
    this.pendingHandFillStartedAt = 0
    this.pendingHandFillPoint.set(0, 0)
    this.pendingHandFillColor = null
    this.handFillGauge = null
    this.pendingHandTool = null
    this.pendingHandToolStartedAt = 0
    this.lastHandToolSelectedAt = 0
    this.clearPendingHandDialogButton()
    this.isSavingColoring = false
    this.isExitConfirmOpen = false
    this.exitConfirmDialog = null
    this.isSaveVisibilityConfirmOpen = false
    this.saveVisibilityConfirmDialog = null
    this.sourceImageData = null
    this.sourceImageSize = { width: 0, height: 0 }
    this.sourceFillBounds = { minX: 0, minY: 0, maxX: 0, maxY: 0 }
    this.regionIdByPixel = null
    this.cachedFillRegions = []
    this.filledRegionColorById = null
    this.fillTextureIndex = 0
    const { width: vw, height: vh } = this.scale

    const background = this.add.image(vw / 2, vh / 2, 'art-room-background')
    const backgroundSource = background.texture.getSourceImage() as HTMLImageElement
    const backgroundScale = Math.max(vw / backgroundSource.width, vh / backgroundSource.height)
    background.setScale(backgroundScale).setDepth(0)

    this.add.rectangle(vw / 2, vh / 2, vw, vh, 0xf4ead7, 0.08).setDepth(1)
    createSceneWeatherLayer(this)
    this.createCanvas(vw, vh)
    this.createHeader(vw)
    this.createExitButton(vw)
    this.createColoringBase()
    if (this.applyInitialArtworkImage()) {
      this.hasStartedColoring = true
    }
    this.createPalette(vw, vh)
    this.createActionButtons()
    this.createToolSelector()
    this.createCameraPreview(vw, vh)
    this.createBrushCursor()
    this.createHandFillGauge()

    this.input.on('pointerdown', this.handlePointerDown)
    this.input.on('pointermove', this.handlePointerMove)
    this.input.on('pointerup', this.handlePointerUp)
    this.input.on('pointerupoutside', this.handlePointerUp)
    this.input.keyboard!.on('keydown-ESC', this.handleEscDown)
    this.startHandColoringMode()
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.off('pointerdown', this.handlePointerDown)
      this.input.off('pointermove', this.handlePointerMove)
      this.input.off('pointerup', this.handlePointerUp)
      this.input.off('pointerupoutside', this.handlePointerUp)
      this.input.keyboard?.off('keydown-ESC', this.handleEscDown)
      this.input.setDefaultCursor('default')
      this.hideExitConfirm()
      this.hideSaveVisibilityConfirm()
      this.cameraPreview?.destroy()
      this.cameraPreview = null
      this.stopHandTracking()
      this.brushCursor = null
      this.brushColorOverlay = null
    })

    this.cameras.main.fadeIn(220, 0, 0, 0)
  }

  update(time: number) {
    const pointer = this.input.activePointer
    this.updateBrushCursorPosition(pointer.x, pointer.y)

    this.cameraPreview?.update()
    this.updateHandColoring(time)
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

    const scaleX = canvas.displayWidth / CANVAS_SOURCE_SIZE.width
    const scaleY = canvas.displayHeight / CANVAS_SOURCE_SIZE.height

    this.drawBounds.setTo(
      canvas.x - canvas.displayWidth / 2 + CANVAS_DRAW_AREA.x * scaleX,
      canvas.y - canvas.displayHeight / 2 + CANVAS_DRAW_AREA.y * scaleY,
      CANVAS_DRAW_AREA.width * scaleX,
      CANVAS_DRAW_AREA.height * scaleY,
    )

    this.coloringTexture = this.add
      .renderTexture(
        this.drawBounds.x,
        this.drawBounds.y,
        this.drawBounds.width,
        this.drawBounds.height,
      )
      .setOrigin(0, 0)
      .setDepth(8)
  }

  private createHeader(vw: number) {
    const headerX = this.drawBounds.left
    const headerTop = Math.max(28, this.drawBounds.top - 108)

    this.add
      .text(headerX, headerTop, '색칠하기', {
        fontFamily: 'sans-serif',
        fontSize: `${Math.max(28, Math.round(vw * 0.02))}px`,
        color: '#fff8ec',
        stroke: '#59361d',
        strokeThickness: 6,
      })
      .setDepth(10)
      .setOrigin(0, 0)

    this.add
      .text(headerX, headerTop + 44, `${this.selectedOption.label} 도안에 예쁜 색을 채워봐.`, {
        fontFamily: 'sans-serif',
        fontSize: `${Math.max(16, Math.round(vw * 0.01))}px`,
        color: '#fff6ea',
        stroke: '#5f4129',
        strokeThickness: 4,
      })
      .setDepth(10)
      .setOrigin(0, 0)
  }

  private createExitButton(vw: number) {
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
        _x: number,
        _y: number,
        event: Phaser.Types.Input.EventData,
      ) => {
        event.stopPropagation()
        this.requestReturnToArtRoom()
      },
    )
  }

  private createColoringBase() {
    const source = this.textures
      .get(this.selectedOption.assetKey)
      .getSourceImage() as HTMLImageElement
    const scale = Math.min(
      (this.drawBounds.width * 0.82) / source.width,
      (this.drawBounds.height * 0.9) / source.height,
    )
    const displayWidth = source.width * scale
    const displayHeight = source.height * scale

    this.coloringBaseBounds.setTo(
      this.drawBounds.centerX - displayWidth / 2,
      this.drawBounds.centerY - displayHeight / 2,
      displayWidth,
      displayHeight,
    )
    this.add
      .rectangle(
        this.coloringBaseBounds.centerX,
        this.coloringBaseBounds.centerY,
        this.coloringBaseBounds.width,
        this.coloringBaseBounds.height,
        0xffffff,
        1,
      )
      .setDepth(6)
    this.prepareSourceImageData(source)
  }

  private applyInitialArtworkImage() {
    if (!this.editingArtwork || !this.textures.exists(this.editingArtwork.imageTextureKey)) {
      return false
    }

    const image = this.add
      .image(0, 0, this.editingArtwork.imageTextureKey)
      .setOrigin(0, 0)
      .setDisplaySize(this.drawBounds.width, this.drawBounds.height)
      .setVisible(false)
    this.coloringTexture.draw(image)
    image.destroy()
    return true
  }

  private createPalette(vw: number, vh: number) {
    // coloring 씬은 캔버스가 가로로 넓어 팔레트 세로 길이를 free-drawing보다 작게 잡는다.
    const paletteHeight = Math.min(this.drawBounds.height * 0.78, vh * 0.4)
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
          this.selectColor(swatch.color)
        },
      )
    })

    const firstPoint = this.palettePoints[0]
    if (firstPoint) {
      this.selectColor(this.currentColor)
    }
  }

  private createActionButtons() {
    const saveSource = this.textures.get('art-ui-save-btn').getSourceImage() as HTMLImageElement
    const resetSource = this.textures.get('art-ui-reset-btn').getSourceImage() as HTMLImageElement
    const resetButtonHeight = 48
    const resetButtonWidth = Math.round(
      resetButtonHeight * (resetSource.width / resetSource.height),
    )
    const saveButtonHeight = 44
    const saveButtonWidth = Math.round(saveButtonHeight * (saveSource.width / saveSource.height))
    const buttonGap = 2
    const buttonY = Math.min(
      this.scale.height - saveButtonHeight / 2 - 18,
      this.drawBounds.bottom + saveButtonHeight / 2 + 6,
    )
    const rowRight = this.drawBounds.right - 54
    const resetButtonX = rowRight - resetButtonWidth / 2
    const saveButtonX = rowRight - resetButtonWidth - buttonGap - saveButtonWidth / 2

    const saveButton = this.add.image(saveButtonX, buttonY, 'art-ui-save-btn').setDepth(15)
    saveButton.setDisplaySize(saveButtonWidth, saveButtonHeight)
    this.saveButton = saveButton
    this.saveButtonBaseScale = { x: saveButton.scaleX, y: saveButton.scaleY }
    saveButton.setInteractive({ useHandCursor: true })
    saveButton.on('pointerover', () =>
      this.applyActionButtonEffect(saveButton, this.saveButtonBaseScale, true),
    )
    saveButton.on('pointerout', () =>
      this.applyActionButtonEffect(saveButton, this.saveButtonBaseScale, false),
    )
    saveButton.on(
      'pointerdown',
      (
        _pointer: Phaser.Input.Pointer,
        _localX: number,
        _localY: number,
        event: Phaser.Types.Input.EventData,
      ) => {
        event.stopPropagation()
        this.requestSaveColoring()
      },
    )

    const resetButton = this.add.image(resetButtonX, buttonY, 'art-ui-reset-btn').setDepth(15)
    resetButton.setDisplaySize(resetButtonWidth, resetButtonHeight)
    this.resetButton = resetButton
    this.resetButtonBaseScale = { x: resetButton.scaleX, y: resetButton.scaleY }
    resetButton.setInteractive({ useHandCursor: true })
    resetButton.on('pointerover', () =>
      this.applyActionButtonEffect(resetButton, this.resetButtonBaseScale, true),
    )
    resetButton.on('pointerout', () =>
      this.applyActionButtonEffect(resetButton, this.resetButtonBaseScale, false),
    )
    resetButton.on(
      'pointerdown',
      (
        _pointer: Phaser.Input.Pointer,
        _localX: number,
        _localY: number,
        event: Phaser.Types.Input.EventData,
      ) => {
        event.stopPropagation()
        this.resetColoring()
      },
    )
  }

  private createToolSelector() {
    const iconSize = Math.max(68, Math.min(90, Math.round(this.scale.width * 0.044)))
    const hitSize = iconSize + 8
    const hitRadius = hitSize / 2
    const gap = Math.max(10, Math.round(hitSize * 0.14))
    const totalHeight = COLORING_TOOLS.length * hitSize + (COLORING_TOOLS.length - 1) * gap
    const x = Math.min(
      this.scale.width - hitRadius - 18,
      this.paletteBounds.right + gap + hitRadius,
    )
    const maxTop = Math.max(16, this.scale.height - totalHeight - 16)
    const startY = Phaser.Math.Clamp(this.paletteBounds.centerY - totalHeight / 2, 16, maxTop)

    COLORING_TOOLS.forEach((tool, index) => {
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
          this.setColoringTool(tool)
        },
      )
    })

    this.refreshToolButtons()
  }

  private createCameraPreview(vw: number, vh: number) {
    const panelCenterX = vw * 0.878
    const paletteHeight = Math.min(this.drawBounds.height * 0.88, vh * 0.41)
    const paletteBottom = this.drawBounds.top + 2 + paletteHeight
    const availableTop = paletteBottom + Math.max(10, vh * 0.012)
    const availableBottom = vh - Math.max(14, vh * 0.018)
    const availableHeight = Math.max(120, availableBottom - availableTop)
    const panelWidth = Math.max(160, Math.min(vw * 0.21, 360, availableHeight * (4 / 3)))
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

  private createHandFillGauge() {
    this.handFillGauge = this.add.graphics().setDepth(21).setVisible(false)
    this.handFillGauge.setScrollFactor(0)
  }

  private setColoringTool(tool: ColoringTool) {
    this.currentTool = tool
    this.resetHandFillState()
    this.clearPendingHandTool()
    this.refreshToolButtons()
    this.updateBrushCursorTexture()
    if (tool === 'brush') {
      this.stopDrawing()
    }
  }

  private refreshToolButtons(hoveredTool: ColoringTool | null = null) {
    COLORING_TOOLS.forEach(tool => {
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

  private startHandColoringMode(delegate: 'GPU' | 'CPU' = 'GPU') {
    if (this.handTracker || this.isStartingHandTracker) {
      return
    }

    const tracker = new HandTracker({ delegate })
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
      .catch(error => {
        this.isStartingHandTracker = false
        tracker.stop()

        if (this.handTracker === tracker) {
          this.handTracker = null
        }

        if (!this.handTrackingDisposed && delegate === 'GPU') {
          console.warn('Hand tracking GPU start failed, retrying with CPU.', error)
          this.startHandColoringMode('CPU')
          return
        }

        console.warn('Hand tracking start failed.', error)
      })
  }

  private stopHandTracking() {
    this.handTrackingDisposed = true
    this.isStartingHandTracker = false
    this.clearPendingHandAction()
    this.clearPendingHandColor()
    this.clearPendingHandTool()
    this.clearPendingHandDialogButton()
    this.resetHandFillState()
    this.handPointerSmoother.reset()
    this.handTrackingGuard.reset()
    this.handTracker?.stop()
    this.handTracker = null
  }

  private updateHandColoring(timestampMs: number) {
    const tracker = this.handTracker
    if (!tracker?.isStarted || this.isDrawing || this.isTransitioning || this.isSavingColoring) {
      this.clearPendingHandFill()
      return
    }

    const result = tracker.detect(timestampMs)
    const handState = result.hands[0] ? this.getHandPointerState(result.hands[0]) : null
    const tracking = this.handTrackingGuard.update(handState?.point ?? null, result.timestampMs)

    if (tracking.shouldResetSmoother) {
      this.handPointerSmoother.reset()
      this.resetHandFillState()
    }

    if (!tracking.point) {
      this.clearPendingHandAction()
      this.clearPendingHandTool()
      this.clearPendingHandDialogButton()
      this.resetHandFillState()
      return
    }

    const smoothedPoint = this.handPointerSmoother.smooth(tracking.point)
    this.updateBrushCursorPosition(smoothedPoint.x, smoothedPoint.y)

    const isTrackedFrame = tracking.status === 'tracked'
    if (
      this.tryActivateConfirmDialogButtonFromHand(
        smoothedPoint,
        result.timestampMs,
        tracking.status !== 'missing',
      )
    ) {
      this.clearPendingHandAction()
      this.clearPendingHandTool()
      this.resetHandFillState()
      return
    }

    if (isTrackedFrame && !handState?.isColoringGesture) {
      this.clearPendingHandAction()
      this.clearPendingHandTool()
      this.resetHandFillState()
      return
    }

    if (isTrackedFrame) {
      if (this.tryActivateActionButtonFromHand(smoothedPoint, result.timestampMs)) {
        this.resetHandFillState()
        this.clearPendingHandTool()
        return
      }

      if (this.trySelectToolFromHand(smoothedPoint, result.timestampMs)) {
        this.resetHandFillState()
        return
      }

      if (this.trySelectColorFromHand(smoothedPoint, result.timestampMs)) {
        this.resetHandFillState()
        this.clearPendingHandTool()
        return
      }
    } else if (this.pendingHandFillRegionId === null) {
      return
    }

    if (
      isTrackedFrame &&
      (!handState ||
        !Phaser.Geom.Rectangle.Contains(this.drawBounds, handState.point.x, handState.point.y))
    ) {
      this.resetHandFillState()
      this.handPointerSmoother.reset()
      return
    }

    if (!Phaser.Geom.Rectangle.Contains(this.drawBounds, smoothedPoint.x, smoothedPoint.y)) {
      this.resetHandFillState()
      this.handPointerSmoother.reset()
      return
    }

    if (this.currentTool === 'eraser') {
      this.tryFillFromHand(smoothedPoint, result.timestampMs, 0xffffff)
      return
    }

    this.tryFillFromHand(smoothedPoint, result.timestampMs)
  }

  private getHandPointerState(hand: TrackedHand): HandPointerState | null {
    const confidence = toPointerConfidence(hand.score, { activeThreshold: 0.35 })
    if (hand.score !== undefined && !confidence.isConfident) {
      return null
    }

    const pointerReference = getPointerReference(hand)
    if (!pointerReference) {
      return null
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
      isColoringGesture: detectIndexFingerGesture(hand).isIndexOnlyGesture,
    }
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
    return this.saveVisibilityConfirmDialog ?? this.exitConfirmDialog
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
      this.requestSaveColoring()
    } else if (action === 'reset') {
      this.resetColoring()
    } else {
      this.requestReturnToArtRoom()
    }

    return true
  }

  private getHandActionAt(point: Phaser.Math.Vector2): HandActionKind | null {
    const padding = this.getHandActionHitPadding()

    if (
      this.saveButton &&
      this.containsExpandedBounds(this.saveButton.getBounds(), point, padding)
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

    this.setColoringTool(tool)
    this.lastHandToolSelectedAt = timestampMs
    return true
  }

  private getHandToolAt(point: Phaser.Math.Vector2): ColoringTool | null {
    const padding = this.getHandToolHitPadding()

    for (const tool of COLORING_TOOLS) {
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
    const nearest = this.getNearestPaletteColor(point.x, point.y)
    if (!nearest) {
      return false
    }

    const distance = Phaser.Math.Distance.Between(point.x, point.y, nearest.x, nearest.y)
    const hitRadius = Math.max(24, Math.min(this.scale.width, this.scale.height) * 0.034)
    if (distance > hitRadius) {
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

    this.selectColor(nearest.color)
    this.lastHandColorSelectedAt = timestampMs
    this.clearPendingHandColor()
    return true
  }

  private clearPendingHandColor() {
    this.pendingHandColor = null
    this.pendingHandColorStartedAt = 0
  }

  private resetHandFillState() {
    this.clearPendingHandFill()
    this.lastHandFillRegionId = null
    this.lastHandFillAt = 0
  }

  private clearPendingHandFill() {
    this.pendingHandFillRegionId = null
    this.pendingHandFillStartedAt = 0
    this.pendingHandFillColor = null
    this.handFillGauge?.clear()
    this.handFillGauge?.setVisible(false)
  }

  private tryFillFromHand(
    point: Phaser.Math.Vector2,
    timestampMs: number,
    color = this.currentColor,
  ) {
    const regionId = this.getRegionIdAt(point.x, point.y)
    if (regionId < 0) {
      this.resetHandFillState()
      return
    }

    if (this.lastHandFillRegionId === regionId) {
      this.clearPendingHandFill()
      return
    }

    if (this.lastHandFillAt > 0 && timestampMs - this.lastHandFillAt < HAND_FILL_COOLDOWN_MS) {
      this.clearPendingHandFill()
      return
    }

    if (this.pendingHandFillRegionId !== regionId || this.pendingHandFillColor !== color) {
      this.startPendingHandFill(regionId, point, timestampMs, color)
      return
    }

    const movedDistance = Phaser.Math.Distance.Between(
      point.x,
      point.y,
      this.pendingHandFillPoint.x,
      this.pendingHandFillPoint.y,
    )
    if (movedDistance > HAND_FILL_STILL_RADIUS) {
      this.startPendingHandFill(regionId, point, timestampMs, color)
      return
    }

    const progress = Phaser.Math.Clamp(
      (timestampMs - this.pendingHandFillStartedAt) / HAND_FILL_HOLD_MS,
      0,
      1,
    )
    this.drawHandFillGauge(point, progress, color)
    if (progress < 1) {
      return
    }

    this.lastHandFillRegionId = regionId
    this.lastHandFillAt = timestampMs
    this.clearPendingHandFill()
    if (this.fillRegionById(regionId, color)) {
      this.handleSuccessfulFill()
    }
  }

  private startPendingHandFill(
    regionId: number,
    point: Phaser.Math.Vector2,
    timestampMs: number,
    color: number,
  ) {
    this.pendingHandFillRegionId = regionId
    this.pendingHandFillStartedAt = timestampMs
    this.pendingHandFillPoint.copy(point)
    this.pendingHandFillColor = color
    this.drawHandFillGauge(point, 0, color)
  }

  private drawHandFillGauge(point: Phaser.Math.Vector2, progress: number, color: number) {
    const gauge = this.handFillGauge
    if (!gauge) {
      return
    }

    const radius = Math.max(24, Math.min(38, Math.round(this.drawBounds.width * 0.032)))
    const lineWidth = Math.max(4, Math.round(radius * 0.14))
    const startAngle = -Math.PI / 2
    const endAngle = startAngle + Math.PI * 2 * Phaser.Math.Clamp(progress, 0, 1)
    const progressColor = this.currentTool === 'eraser' ? 0xfffbf1 : color

    gauge.clear()
    gauge.setVisible(true)
    gauge.lineStyle(lineWidth + 4, 0x3f220c, 0.2)
    gauge.strokeCircle(point.x, point.y, radius)
    gauge.lineStyle(lineWidth, 0xffffff, 0.78)
    gauge.strokeCircle(point.x, point.y, radius)
    gauge.lineStyle(lineWidth, progressColor, 1)
    gauge.beginPath()
    gauge.arc(point.x, point.y, radius, startAngle, endAngle, false)
    gauge.strokePath()
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

  private selectColor(color: number) {
    this.currentColor = color
    this.setColoringTool('brush')
    this.paletteSelection.setVisible(false)
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

  private handleSuccessfulFill() {
    this.strokeCount += 1

    if (!this.hasStartedColoring) {
      this.hasStartedColoring = true
    }
  }

  private countUsedColors() {
    const filled = this.filledRegionColorById
    if (!filled) {
      return 0
    }
    const colors = new Set<number>()
    for (let i = 0; i < filled.length; i += 1) {
      const color = filled[i]
      if (color >= 0 && color !== 0xffffff) {
        colors.add(color)
      }
    }
    return colors.size
  }

  private prepareSourceImageData(source: HTMLImageElement) {
    const sourceWidth = Math.max(1, Math.round(this.drawBounds.width))
    const sourceHeight = Math.max(1, Math.round(this.drawBounds.height))
    const sourceCanvas = document.createElement('canvas')
    sourceCanvas.width = sourceWidth
    sourceCanvas.height = sourceHeight
    const context = sourceCanvas.getContext('2d', { willReadFrequently: true })

    if (!context) {
      this.sourceImageData = null
      return
    }

    const imageOffsetX = this.coloringBaseBounds.x - this.drawBounds.x
    const imageOffsetY = this.coloringBaseBounds.y - this.drawBounds.y

    context.drawImage(
      source,
      imageOffsetX,
      imageOffsetY,
      this.coloringBaseBounds.width,
      this.coloringBaseBounds.height,
    )

    this.sourceImageData = context.getImageData(0, 0, sourceWidth, sourceHeight)
    this.sourceImageSize = { width: sourceWidth, height: sourceHeight }
    this.sourceFillBounds = {
      minX: Math.max(0, Math.floor(imageOffsetX)),
      minY: Math.max(0, Math.floor(imageOffsetY)),
      maxX: Math.min(sourceWidth - 1, Math.ceil(imageOffsetX + this.coloringBaseBounds.width) - 1),
      maxY: Math.min(
        sourceHeight - 1,
        Math.ceil(imageOffsetY + this.coloringBaseBounds.height) - 1,
      ),
    }
    this.createMaskedColoringLayers(this.sourceImageData)
    this.prepareFillRegions()
  }

  private isFillableSourcePixel(dataIndex: number) {
    if (!this.sourceImageData) {
      return false
    }

    const data = this.sourceImageData.data
    const alpha = data[dataIndex + 3]
    const red = data[dataIndex]
    const green = data[dataIndex + 1]
    const blue = data[dataIndex + 2]

    return (
      alpha > 16 &&
      red >= FILLABLE_WHITE_THRESHOLD &&
      green >= FILLABLE_WHITE_THRESHOLD &&
      blue >= FILLABLE_WHITE_THRESHOLD
    )
  }

  private prepareFillRegions() {
    if (!this.sourceImageData) {
      this.regionIdByPixel = null
      this.cachedFillRegions = []
      this.filledRegionColorById = null
      return
    }

    const { width, height } = this.sourceImageSize
    const totalPixels = width * height
    const fillablePixelMask = new Uint8Array(totalPixels)
    const visitedPixels = new Uint8Array(totalPixels)
    const regionIdByPixel = new Int32Array(totalPixels).fill(-1)
    const cachedFillRegions: CachedFillRegion[] = []
    const { minX, minY, maxX, maxY } = this.sourceFillBounds

    if (maxX < minX || maxY < minY) {
      this.regionIdByPixel = regionIdByPixel
      this.cachedFillRegions = cachedFillRegions
      this.filledRegionColorById = new Int32Array(0)
      return
    }

    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const pixelIndex = y * width + x
        if (this.isFillableSourcePixel(pixelIndex * 4)) {
          fillablePixelMask[pixelIndex] = 1
        }
      }
    }

    const stack = new Int32Array(totalPixels)
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const seedIndex = y * width + x
        if (!fillablePixelMask[seedIndex] || visitedPixels[seedIndex]) {
          continue
        }

        const pixelIndices: number[] = []
        let stackLength = 1
        let minRegionX = x
        let maxRegionX = x
        let minRegionY = y
        let maxRegionY = y
        let touchesExterior = false
        stack[0] = seedIndex
        visitedPixels[seedIndex] = 1

        while (stackLength > 0) {
          stackLength -= 1
          const pixelIndex = stack[stackLength]
          pixelIndices.push(pixelIndex)

          const pixelX = pixelIndex % width
          const pixelY = Math.floor(pixelIndex / width)
          minRegionX = Math.min(minRegionX, pixelX)
          maxRegionX = Math.max(maxRegionX, pixelX)
          minRegionY = Math.min(minRegionY, pixelY)
          maxRegionY = Math.max(maxRegionY, pixelY)
          if (pixelX <= minX || pixelX >= maxX || pixelY <= minY || pixelY >= maxY) {
            touchesExterior = true
          }

          stackLength = this.pushFillNeighbor(
            pixelIndex - 1,
            stack,
            stackLength,
            fillablePixelMask,
            visitedPixels,
            pixelX > minX,
          )
          stackLength = this.pushFillNeighbor(
            pixelIndex + 1,
            stack,
            stackLength,
            fillablePixelMask,
            visitedPixels,
            pixelX < maxX,
          )
          stackLength = this.pushFillNeighbor(
            pixelIndex - width,
            stack,
            stackLength,
            fillablePixelMask,
            visitedPixels,
            pixelY > minY,
          )
          stackLength = this.pushFillNeighbor(
            pixelIndex + width,
            stack,
            stackLength,
            fillablePixelMask,
            visitedPixels,
            pixelY < maxY,
          )
        }

        if (touchesExterior) {
          continue
        }

        const regionId = cachedFillRegions.length
        for (const pixelIndex of pixelIndices) {
          regionIdByPixel[pixelIndex] = regionId
        }

        cachedFillRegions.push({
          pixelIndices: Uint32Array.from(pixelIndices),
          bounds: {
            minX: minRegionX,
            minY: minRegionY,
            maxX: maxRegionX,
            maxY: maxRegionY,
          },
        })
      }
    }

    this.regionIdByPixel = regionIdByPixel
    this.cachedFillRegions = cachedFillRegions
    this.filledRegionColorById = new Int32Array(cachedFillRegions.length).fill(-1)
  }

  private pushFillNeighbor(
    pixelIndex: number,
    stack: Int32Array,
    stackLength: number,
    fillablePixelMask: Uint8Array,
    visitedPixels: Uint8Array,
    canPush: boolean,
  ) {
    if (!canPush || !fillablePixelMask[pixelIndex] || visitedPixels[pixelIndex]) {
      return stackLength
    }

    visitedPixels[pixelIndex] = 1
    stack[stackLength] = pixelIndex
    return stackLength + 1
  }

  private createMaskedColoringLayers(sourceImageData: ImageData) {
    const { width, height } = sourceImageData
    const maskCanvas = document.createElement('canvas')
    const lineCanvas = document.createElement('canvas')
    maskCanvas.width = width
    maskCanvas.height = height
    lineCanvas.width = width
    lineCanvas.height = height

    const maskContext = maskCanvas.getContext('2d')
    const lineContext = lineCanvas.getContext('2d')
    if (!maskContext || !lineContext) {
      return
    }

    const maskImageData = maskContext.createImageData(width, height)
    const lineImageData = lineContext.createImageData(width, height)
    const sourceData = sourceImageData.data
    const maskData = maskImageData.data
    const lineData = lineImageData.data

    for (let dataIndex = 0; dataIndex < sourceData.length; dataIndex += 4) {
      const alpha = sourceData[dataIndex + 3]
      if (alpha <= 16) {
        continue
      }

      const red = sourceData[dataIndex]
      const green = sourceData[dataIndex + 1]
      const blue = sourceData[dataIndex + 2]
      const isFillable =
        red >= FILLABLE_WHITE_THRESHOLD &&
        green >= FILLABLE_WHITE_THRESHOLD &&
        blue >= FILLABLE_WHITE_THRESHOLD

      if (isFillable) {
        maskData[dataIndex] = 255
        maskData[dataIndex + 1] = 255
        maskData[dataIndex + 2] = 255
        maskData[dataIndex + 3] = 255
        continue
      }

      lineData[dataIndex] = red
      lineData[dataIndex + 1] = green
      lineData[dataIndex + 2] = blue
      lineData[dataIndex + 3] = alpha
    }

    maskContext.putImageData(maskImageData, 0, 0)
    lineContext.putImageData(lineImageData, 0, 0)

    const maskTextureKey = `art-coloring-mask-${this.selectedOption.id}`
    if (this.replaceCanvasTexture(maskTextureKey, maskCanvas)) {
      const maskImage = this.add
        .image(this.drawBounds.x, this.drawBounds.y, maskTextureKey)
        .setOrigin(0, 0)
        .setVisible(false)
      this.coloringTexture.setMask(maskImage.createBitmapMask())
    }

    const lineTextureKey = `art-coloring-line-${this.selectedOption.id}`
    if (this.replaceCanvasTexture(lineTextureKey, lineCanvas)) {
      this.add
        .image(this.drawBounds.x, this.drawBounds.y, lineTextureKey)
        .setOrigin(0, 0)
        .setDepth(9)
    }
  }

  private replaceCanvasTexture(textureKey: string, canvas: HTMLCanvasElement) {
    if (this.textures.exists(textureKey)) {
      this.textures.remove(textureKey)
    }

    const texture = this.textures.addCanvas(textureKey, canvas)
    if (!texture) {
      return false
    }

    texture.refresh()
    return true
  }

  private fillRegionAt(sceneX: number, sceneY: number, color = this.currentColor) {
    const regionId = this.getRegionIdAt(sceneX, sceneY)
    if (regionId < 0) {
      return false
    }

    return this.fillRegionById(regionId, color)
  }

  private getRegionIdAt(sceneX: number, sceneY: number) {
    const regionIdByPixel = this.regionIdByPixel
    if (
      !regionIdByPixel ||
      !Phaser.Geom.Rectangle.Contains(this.drawBounds, sceneX, sceneY) ||
      !Phaser.Geom.Rectangle.Contains(this.coloringBaseBounds, sceneX, sceneY)
    ) {
      return -1
    }

    const sourceX = Phaser.Math.Clamp(
      Math.floor(sceneX - this.drawBounds.x),
      0,
      this.sourceImageSize.width - 1,
    )
    const sourceY = Phaser.Math.Clamp(
      Math.floor(sceneY - this.drawBounds.y),
      0,
      this.sourceImageSize.height - 1,
    )

    return regionIdByPixel[sourceY * this.sourceImageSize.width + sourceX] ?? -1
  }

  private fillRegionById(regionId: number, color = this.currentColor) {
    const fillRegion = this.cachedFillRegions[regionId]
    if (!fillRegion) {
      return false
    }

    if (this.filledRegionColorById?.[regionId] === color) {
      return false
    }

    const { bounds, pixelIndices } = fillRegion
    const textureWidth = bounds.maxX - bounds.minX + 1
    const textureHeight = bounds.maxY - bounds.minY + 1
    const fillCanvas = document.createElement('canvas')
    fillCanvas.width = textureWidth
    fillCanvas.height = textureHeight
    const context = fillCanvas.getContext('2d')

    if (!context) {
      return false
    }

    const fillImageData = context.createImageData(textureWidth, textureHeight)
    const data = fillImageData.data
    const red = (color >> 16) & 0xff
    const green = (color >> 8) & 0xff
    const blue = color & 0xff

    for (const pixelIndex of pixelIndices) {
      const pixelX = (pixelIndex % this.sourceImageSize.width) - bounds.minX
      const pixelY = Math.floor(pixelIndex / this.sourceImageSize.width) - bounds.minY
      const dataIndex = (pixelY * textureWidth + pixelX) * 4
      data[dataIndex] = red
      data[dataIndex + 1] = green
      data[dataIndex + 2] = blue
      data[dataIndex + 3] = 255
    }

    context.putImageData(fillImageData, 0, 0)
    const textureKey = `art-coloring-fill-${this.selectedOption.id}-${this.fillTextureIndex}`
    this.fillTextureIndex += 1
    const fillTexture = this.textures.addCanvas(textureKey, fillCanvas)
    if (!fillTexture) {
      return false
    }

    fillTexture.refresh()

    const fillImage = this.add
      .image(bounds.minX, bounds.minY, textureKey)
      .setOrigin(0, 0)
      .setVisible(false)
    this.coloringTexture.draw(fillImage)
    fillImage.destroy()
    this.textures.remove(textureKey)
    if (this.filledRegionColorById) {
      this.filledRegionColorById[regionId] = color
    }
    return true
  }

  private stopDrawing() {
    this.isDrawing = false
    this.activeDrawingPointerId = null
  }

  private resetColoring() {
    this.stopDrawing()
    this.clearPendingHandAction()
    this.clearPendingHandColor()
    this.clearPendingHandTool()
    this.handPointerSmoother.reset()
    this.handTrackingGuard.reset()
    this.resetHandFillState()
    this.filledRegionColorById?.fill(-1)
    this.coloringTexture.clear()
    this.hasStartedColoring = false
    this.strokeCount = 0
  }

  private requestSaveColoring() {
    if (
      this.isTransitioning ||
      this.isSavingColoring ||
      this.isExitConfirmOpen ||
      this.isSaveVisibilityConfirmOpen
    ) {
      return
    }

    this.stopDrawing()
    this.showSaveVisibilityConfirm()
  }

  private saveColoring(isPublic: boolean) {
    if (this.isSavingColoring) {
      return
    }

    this.isSavingColoring = true
    const playDurationSeconds = this.getPlayDurationSeconds()
    const colorCount = this.countUsedColors()
    void this.exportColoringPng(playDurationSeconds, isPublic)
      .then(exportedColoring => {
        if (!exportedColoring) {
          throw new Error('Failed to create coloring export image.')
        }

        if (this.editingArtwork) {
          return updateArtwork({
            id: this.editingArtwork.id,
            image: exportedColoring.blob,
            filename: exportedColoring.filename,
            additionalPlayDurationSeconds: exportedColoring.playDurationSeconds,
            isPublic: exportedColoring.isPublic,
            colorCount,
          })
        }

        return createArtwork({
          image: exportedColoring.blob,
          filename: exportedColoring.filename,
          sketchCode: this.getSelectedSketchCode(),
          playDurationSeconds: exportedColoring.playDurationSeconds,
          isPublic: exportedColoring.isPublic,
          colorCount,
        })
      })
      .then(() => {
        this.hasStartedColoring = false
        this.returnToArtRoom()
      })
      .catch(error => {
        console.error('Failed to save coloring artwork.', error)
      })
      .finally(() => {
        this.isSavingColoring = false
      })
  }

  private exportColoringPng(
    playDurationSeconds: number,
    isPublic: boolean,
  ): Promise<ExportedColoringPng | null> {
    if (!this.sourceImageData) {
      return Promise.resolve(null)
    }

    return new Promise(resolve => {
      this.coloringTexture.snapshot(snapshot => {
        const outputCanvas = document.createElement('canvas')
        outputCanvas.width = this.sourceImageSize.width
        outputCanvas.height = this.sourceImageSize.height
        const context = outputCanvas.getContext('2d')

        if (!context) {
          resolve(null)
          return
        }

        context.fillStyle = '#ffffff'
        context.fillRect(0, 0, outputCanvas.width, outputCanvas.height)

        if (snapshot instanceof HTMLImageElement || snapshot instanceof HTMLCanvasElement) {
          context.drawImage(snapshot, 0, 0, outputCanvas.width, outputCanvas.height)
        }

        const outputImageData = context.getImageData(0, 0, outputCanvas.width, outputCanvas.height)
        this.drawSavedLineArt(outputImageData.data)
        context.putImageData(outputImageData, 0, 0)
        outputCanvas.toBlob(blob => {
          if (!blob) {
            resolve(null)
            return
          }

          resolve({
            blob,
            filename: `coloring-${this.selectedOption.id}-${Date.now()}.png`,
            isPublic,
            playDurationSeconds,
          })
        }, 'image/png')
      }, 'image/png')
    })
  }

  private getSelectedSketchCode() {
    const selectedIndex = coloringOptions.findIndex(option => option.id === this.selectedOption.id)
    return Math.max(1, selectedIndex + 1)
  }

  private getPlayDurationSeconds() {
    return Math.max(0, Math.floor((this.time.now - this.contentStartedAt) / 1000))
  }

  private drawSavedLineArt(outputData: Uint8ClampedArray) {
    if (!this.sourceImageData) {
      return
    }

    const sourceData = this.sourceImageData.data
    for (let dataIndex = 0; dataIndex < sourceData.length; dataIndex += 4) {
      const alpha = sourceData[dataIndex + 3]
      if (alpha <= 16 || this.isFillableSourcePixel(dataIndex)) {
        continue
      }

      const sourceAlpha = alpha / 255
      const inverseAlpha = 1 - sourceAlpha
      outputData[dataIndex] = Math.round(
        sourceData[dataIndex] * sourceAlpha + outputData[dataIndex] * inverseAlpha,
      )
      outputData[dataIndex + 1] = Math.round(
        sourceData[dataIndex + 1] * sourceAlpha + outputData[dataIndex + 1] * inverseAlpha,
      )
      outputData[dataIndex + 2] = Math.round(
        sourceData[dataIndex + 2] * sourceAlpha + outputData[dataIndex + 2] * inverseAlpha,
      )
      outputData[dataIndex + 3] = 255
    }
  }

  private requestReturnToArtRoom() {
    if (this.isTransitioning || this.isSavingColoring || this.isSaveVisibilityConfirmOpen) {
      return
    }

    this.stopDrawing()

    if (this.hasStartedColoring) {
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
      message: '나가면 지금 색칠한 그림은 사라져요.',
      secondaryButton: {
        label: '계속 색칠하기',
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
          this.saveColoring(false)
        },
      },
      primaryButton: {
        label: '공개하기',
        fillColor: 0x65a843,
        strokeColor: 0x3f752a,
        textColor: '#ffffff',
        onSelect: () => {
          this.hideSaveVisibilityConfirm()
          this.saveColoring(true)
        },
      },
    })
  }

  private pauseHandInputForConfirmDialog() {
    this.stopDrawing()
    this.clearPendingHandAction()
    this.clearPendingHandColor()
    this.clearPendingHandTool()
    this.clearPendingHandDialogButton()
    this.resetHandFillState()
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

    this.hideExitConfirm()
    this.hideSaveVisibilityConfirm()
    this.stopDrawing()
    this.stopHandTracking()
    this.isTransitioning = true
    this.cameras.main.fadeOut(180, 0, 0, 0)
    this.time.delayedCall(180, () => {
      this.scene.start('ArtSelectScene', {
        spawn: ART_ROOM_RETURN_SPAWN,
        suppressRumiDialog: true,
      })
    })
  }
}
