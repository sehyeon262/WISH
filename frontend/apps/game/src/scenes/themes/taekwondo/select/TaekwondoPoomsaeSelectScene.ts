import Phaser from 'phaser'
import { playSceneBgm } from '@/game/systems/sceneBgm'
import { assetPath } from '@/game/assets/assetPath'
import { fadeToScene } from '@/game/systems/sceneTransition'
import {
  DEFAULT_TAEKWONDO_BELT_COLOR,
  getTaekwondoPoomsaeLabel,
  getTaekwondoPoomsaeNumber,
  listTaekwondoMotionsByPoomsae,
  TAEKWONDO_POOMSAE_VALUES,
  type Poomsae,
  type TaekwondoBeltColor,
} from '@wish/api-client'
import {
  CUTE_CARD_PALETTES,
  drawCuteCardPanel,
  drawCutePillButton,
  type CuteCardPalette,
} from '@/game/ui/cuteCard'
import { addCoverBackground } from '@/game/world/background'

type PoomsaeOption = {
  id: string
  poomsae: Poomsae
  name: string
  difficulty: 'easy' | 'normal' | 'hard'
  imageKey: string
  isReady: boolean
  motionCount: number
}

type PoomsaeCard = {
  container: Phaser.GameObjects.Container
  panel: Phaser.GameObjects.Graphics
  starBox: Phaser.GameObjects.Graphics
  selectButton: Phaser.GameObjects.Graphics
  hitArea: Phaser.GameObjects.Zone
  starText: Phaser.GameObjects.Text
  title: Phaser.GameObjects.Text
  selectLabel: Phaser.GameObjects.Text
  image: Phaser.GameObjects.Image
  option: PoomsaeOption
  baseX: number
  baseY: number
  width: number
  height: number
  palette: CuteCardPalette
}

type TaekwondoPoomsaeSelectData = {
  beltColor?: TaekwondoBeltColor
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

const ASSET_KEYS = {
  background: 'taekwondo-room-background',
  deleteButton: 'taekwondo-poomsae-select-delete-button',
  guideArrow: 'taekwondo-guide-arrow',
} as const

const FADE_DURATION = 220
const OVERLAY_ALPHA = 0.06
const DELETE_BUTTON_ASPECT = 344 / 336
const CARD_GAP = 56
const CARD_ASPECT_RATIO = 408 / 612
const CARD_VISIBLE_COUNT = 3
const CARD_HEIGHT_RATIO = 0.72
const CARD_MIN_HEIGHT = 440
const CARD_MAX_HEIGHT = 610
const CARD_SELECTED_SCALE = 1.04
const CARD_NORMAL_SCALE = 0.98
const CARD_SCALE_TWEEN_DURATION = 110
const DRAG_CLICK_THRESHOLD = 8
const LIST_Y_RATIO = 0.5
const POOMSAE_GUIDE_DISMISSED_KEY = 'taekwondo-poomsae-guide-dismissed'
const CARD_LAYOUT = {
  starBoxY: -0.39,
  starBoxWidth: 0.58,
  starBoxHeight: 0.07,
  imageY: -0.07,
  imageSize: 0.44,
  titleY: 0.24,
  buttonY: 0.42,
  buttonWidth: 0.66,
  buttonHeight: 0.085,
} as const

const POOMSAE_IMAGE_FALLBACK_INDEX = 8
const POOMSAE_READY_ERROR_MESSAGE = '품새 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'
const POOMSAE_PARTIAL_ERROR_MESSAGE = '일부 품새 정보를 불러오지 못했어요.'
const POOMSAE_LOADING_MESSAGE = '품새 정보를 불러오는 중이에요.'
const POOMSAE_NOT_READY_SUFFIX = '은 아직 준비중이에요.'

function getPoomsaeNumber(poomsae: Poomsae) {
  return getTaekwondoPoomsaeNumber(poomsae)
}

function getPoomsaeId(poomsae: Poomsae) {
  return `taegeuk-${getPoomsaeNumber(poomsae)}`
}

function getPoomsaeDifficulty(poomsae: Poomsae): PoomsaeOption['difficulty'] {
  const number = getPoomsaeNumber(poomsae)
  if (number <= 2) return 'easy'
  if (number <= 5) return 'normal'
  return 'hard'
}

function getPoomsaeImageFileIndex(poomsae: Poomsae) {
  return Math.min(getPoomsaeNumber(poomsae), POOMSAE_IMAGE_FALLBACK_INDEX)
}

function createInitialPoomsaeOptions(): PoomsaeOption[] {
  return TAEKWONDO_POOMSAE_VALUES.map(poomsae => ({
    id: getPoomsaeId(poomsae),
    poomsae,
    name: getTaekwondoPoomsaeLabel(poomsae),
    difficulty: getPoomsaeDifficulty(poomsae),
    imageKey: `taekwondo-poomsae-${getPoomsaeNumber(poomsae)}`,
    isReady: false,
    motionCount: 0,
  }))
}

const DIFFICULTY_CARD_PALETTE: Record<PoomsaeOption['difficulty'], CuteCardPalette> = {
  easy: CUTE_CARD_PALETTES.butter,
  normal: CUTE_CARD_PALETTES.butter,
  hard: CUTE_CARD_PALETTES.butter,
}

const DIFFICULTY_STARS: Record<PoomsaeOption['difficulty'], number> = {
  easy: 1,
  normal: 2,
  hard: 3,
}

export class TaekwondoPoomsaeSelectScene extends Phaser.Scene {
  private beltColor: TaekwondoBeltColor = DEFAULT_TAEKWONDO_BELT_COLOR
  private poomsaeOptions: PoomsaeOption[] = createInitialPoomsaeOptions()
  private selectedOptionId = ''
  private optionCards: PoomsaeCard[] = []
  private guideOverlay: Phaser.GameObjects.Container | null = null
  private guideDontShowAgain = false
  private isPoomsaeLoading = false
  private isSceneShuttingDown = false
  private rail!: Phaser.GameObjects.Container
  private scrollX = 0
  private maxScrollX = 0
  private viewportX = 0
  private viewportWidth = 0
  private cardStep = 0
  private isDragging = false
  private didDrag = false
  private dragStartX = 0
  private dragStartScrollX = 0

  private readonly handleEscDown = () => {
    if (this.guideOverlay) {
      this.hidePoomsaeGuide(false)
      return
    }

    this.returnToDojang()
  }

  private readonly handleWheel = (
    _pointer: Phaser.Input.Pointer,
    _gameObjects: Phaser.GameObjects.GameObject[],
    deltaX: number,
    deltaY: number,
  ) => {
    this.setScroll(this.scrollX + deltaY + deltaX)
  }

  private readonly handlePointerMove = (pointer: Phaser.Input.Pointer) => {
    if (!this.isDragging) {
      return
    }

    if (Math.abs(pointer.x - this.dragStartX) > DRAG_CLICK_THRESHOLD) {
      this.didDrag = true
    }

    this.setScroll(this.dragStartScrollX - (pointer.x - this.dragStartX))
  }

  private readonly handlePointerUp = () => {
    this.isDragging = false
  }

  constructor() {
    super({ key: 'TaekwondoPoomsaeSelectScene' })
  }

  init(data: TaekwondoPoomsaeSelectData = {}) {
    this.beltColor = data.beltColor ?? DEFAULT_TAEKWONDO_BELT_COLOR
    this.poomsaeOptions = createInitialPoomsaeOptions()
    this.isPoomsaeLoading = false
    this.isSceneShuttingDown = false
  }

  preload() {
    this.load.image(
      ASSET_KEYS.background,
      assetPath('images/themes/taekwondo/background/taekwondo_inside.png'),
    )
    this.load.image(ASSET_KEYS.guideArrow, assetPath('images/themes/taekwondo/ui/guide_arrow.png'))
    this.load.image(ASSET_KEYS.deleteButton, assetPath('images/themes/taekwondo/ui/delete_btn.png'))
    this.poomsaeOptions.forEach(option => {
      this.load.image(
        option.imageKey,
        assetPath(
          `images/themes/taekwondo/characters/poomsae_${getPoomsaeImageFileIndex(option.poomsae)}.png`,
        ),
      )
    })
  }

  create() {
    playSceneBgm(this)
    const { width: vw, height: vh } = this.scale
    addCoverBackground(this, ASSET_KEYS.background)
    this.add.rectangle(vw / 2, vh / 2, vw, vh, 0x120d08, OVERLAY_ALPHA).setDepth(1)

    this.createHorizontalOptionList(vw, vh)
    this.createDeleteButton(vw, vh)

    this.optionCards.forEach(card => this.updateCardStyle(card))
    this.showCards()
    this.showPoomsaeGuideIfNeeded(vw, vh)
    void this.loadPoomsaeReadiness()

    this.input.keyboard?.on('keydown-ESC', this.handleEscDown)
    this.input.on('wheel', this.handleWheel)
    this.input.on('pointermove', this.handlePointerMove)
    this.input.on('pointerup', this.handlePointerUp)
    this.input.on('pointerupoutside', this.handlePointerUp)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.removeSceneListeners())

    this.cameras.main.fadeIn(FADE_DURATION, 0, 0, 0)
  }

  private async loadPoomsaeReadiness() {
    this.isPoomsaeLoading = true
    this.optionCards.forEach(card => this.updateCardStyle(card))

    try {
      const { motionsByPoomsae, failedPoomsae } = await listTaekwondoMotionsByPoomsae()

      if (!this.canUpdatePoomsaeCards()) {
        return
      }

      this.poomsaeOptions = this.poomsaeOptions.map(option => {
        const motions = motionsByPoomsae[option.poomsae] ?? []
        return {
          ...option,
          isReady: motions.length > 0,
          motionCount: motions.length,
        }
      })
      this.syncCardsWithOptions()

      if (failedPoomsae.length > 0) {
        this.showTemporaryNotice(
          failedPoomsae.length === TAEKWONDO_POOMSAE_VALUES.length
            ? POOMSAE_READY_ERROR_MESSAGE
            : POOMSAE_PARTIAL_ERROR_MESSAGE,
        )
      }
    } catch (error) {
      console.warn('[TaekwondoPoomsaeSelectScene] Failed to load poomsae readiness.', {
        message: getErrorMessage(error),
      })
      if (this.canUpdatePoomsaeCards()) {
        this.poomsaeOptions = this.poomsaeOptions.map(option => ({
          ...option,
          isReady: false,
          motionCount: 0,
        }))
        this.syncCardsWithOptions()
        this.showTemporaryNotice(POOMSAE_READY_ERROR_MESSAGE)
      }
    } finally {
      if (this.canUpdatePoomsaeCards()) {
        this.isPoomsaeLoading = false
        this.optionCards.forEach(card => this.updateCardStyle(card))
      }
    }
  }

  private syncCardsWithOptions() {
    if (!this.canUpdatePoomsaeCards()) {
      return
    }

    this.optionCards.forEach(card => {
      const option = this.poomsaeOptions.find(item => item.id === card.option.id)
      if (option) {
        card.option = option
      }
    })
  }

  private canUpdatePoomsaeCards() {
    return !this.isSceneShuttingDown && this.scene.isActive() && this.optionCards.length > 0
  }

  private getLatestOption(optionId: string) {
    return this.poomsaeOptions.find(option => option.id === optionId)
  }

  private createHorizontalOptionList(vw: number, vh: number) {
    const cardHeight = Phaser.Math.Clamp(vh * CARD_HEIGHT_RATIO, CARD_MIN_HEIGHT, CARD_MAX_HEIGHT)
    const cardWidth = cardHeight * CARD_ASPECT_RATIO
    const viewportHeight = cardHeight * CARD_SELECTED_SCALE + 28
    const viewportY = vh * LIST_Y_RATIO

    this.cardStep = cardWidth + CARD_GAP
    this.viewportWidth = Math.min(
      vw * 0.82,
      cardWidth * CARD_VISIBLE_COUNT + CARD_GAP * (CARD_VISIBLE_COUNT - 1),
    )
    this.viewportX = vw / 2 - this.viewportWidth / 2

    const maskShape = this.add
      .rectangle(
        this.viewportX,
        viewportY - viewportHeight / 2,
        this.viewportWidth,
        viewportHeight,
        0xffffff,
        0,
      )
      .setOrigin(0)
      .setVisible(false)
    const mask = maskShape.createGeometryMask()

    this.rail = this.add.container(this.viewportX, viewportY).setDepth(3)
    this.rail.setMask(mask)

    const contentWidth =
      this.poomsaeOptions.length * cardWidth +
      Math.max(0, this.poomsaeOptions.length - 1) * CARD_GAP
    this.maxScrollX = Math.max(0, contentWidth - this.viewportWidth)

    this.optionCards = this.poomsaeOptions.map((option, index) =>
      this.createOptionCard(
        option,
        index * this.cardStep + cardWidth / 2,
        0,
        cardWidth,
        cardHeight,
      ),
    )

    const dragZone = this.add
      .zone(this.viewportX, viewportY - viewportHeight / 2, this.viewportWidth, viewportHeight)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true })
      .setDepth(2)
    dragZone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.startDrag(pointer)
    })
  }

  private createDeleteButton(vw: number, vh: number) {
    const size = Math.round(Phaser.Math.Clamp(vh * 0.073, 48, 76))
    const width = size * DELETE_BUTTON_ASPECT
    const x = vw - size * 1.25
    const y = size * 1.15

    const button = this.add
      .image(x, y, ASSET_KEYS.deleteButton)
      .setDisplaySize(width, size)
      .setDepth(6)

    const hitArea = this.add
      .rectangle(x, y, width, size, 0xffffff, 0)
      .setInteractive({ useHandCursor: true })
      .setDepth(7)

    hitArea.on('pointerdown', () => {
      this.returnToDojang()
    })
    hitArea.on('pointerover', () => button.setTint(0xffefc4))
    hitArea.on('pointerout', () => button.clearTint())
  }

  private createOptionCard(
    option: PoomsaeOption,
    x: number,
    y: number,
    width: number,
    height: number,
  ): PoomsaeCard {
    const panel = this.add.graphics()
    const hitArea = this.add
      .zone(0, 0, width, height)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })

    const starBox = this.add.graphics()
    const starText = this.add
      .text(
        0,
        height * CARD_LAYOUT.starBoxY,
        Array.from({ length: DIFFICULTY_STARS[option.difficulty] }, () => '★').join('  '),
        {
          fontFamily: 'sans-serif',
          fontSize: `${Math.round(width * 0.065)}px`,
          color: '#ffce46',
          fontStyle: '700',
        },
      )
      .setOrigin(0.5)

    const image = this.add
      .image(0, height * CARD_LAYOUT.imageY, option.imageKey)
      .setDisplaySize(width * 0.55, height * CARD_LAYOUT.imageSize)

    const title = this.add
      .text(0, height * CARD_LAYOUT.titleY, option.name, {
        fontFamily: 'sans-serif',
        fontSize: `${Math.round(width * 0.095)}px`,
        color: '#303030',
        fontStyle: '700',
      })
      .setOrigin(0.5)

    const selectButton = this.add.graphics()
    const selectLabel = this.add
      .text(0, height * CARD_LAYOUT.buttonY, '선택', {
        fontFamily: 'sans-serif',
        fontSize: `${Math.round(width * 0.06)}px`,
        color: '#303030',
        fontStyle: '700',
      })
      .setOrigin(0.5)

    const container = this.add
      .container(x, y, [panel, starBox, selectButton, starText, image, title, selectLabel, hitArea])
      .setAlpha(0)
      .setVisible(false)
      .setSize(width, height)
      .setData('optionId', option.id)
    this.rail.add(container)

    const card = {
      container,
      panel,
      starBox,
      selectButton,
      hitArea,
      starText,
      title,
      selectLabel,
      image,
      option,
      baseX: x,
      baseY: y,
      width,
      height,
      palette: DIFFICULTY_CARD_PALETTE[option.difficulty],
    }

    hitArea.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.startDrag(pointer)
      this.updateSelection(card.container.getData('optionId'))
    })
    hitArea.on('pointerup', () => {
      const optionId = card.container.getData('optionId')
      if (this.selectedOptionId !== optionId) {
        return
      }

      if (this.didDrag) {
        this.clearSelection()
        return
      }

      this.clearSelection()
      const latestOption = this.getLatestOption(optionId)
      if (latestOption) {
        this.startPoomsaePractice(latestOption)
      }
    })
    hitArea.on('pointerupoutside', () => this.clearSelection())
    hitArea.on('pointerout', () => {
      if (this.selectedOptionId === card.container.getData('optionId')) {
        this.clearSelection()
        return
      }

      this.updateCardStyle(card)
    })

    return card
  }

  private showCards() {
    this.optionCards.forEach((card, index) => {
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
  }

  private startDrag(pointer: Phaser.Input.Pointer) {
    this.isDragging = true
    this.didDrag = false
    this.dragStartX = pointer.x
    this.dragStartScrollX = this.scrollX
  }

  private setScroll(scrollX: number) {
    this.scrollX = Phaser.Math.Clamp(scrollX, 0, this.maxScrollX)
    this.rail.x = this.viewportX - this.scrollX
  }

  private updateSelection(optionId: string) {
    this.selectedOptionId = optionId
    this.optionCards.forEach(card => this.updateCardStyle(card, true))
  }

  private clearSelection() {
    this.selectedOptionId = ''
    this.optionCards.forEach(card => this.updateCardStyle(card, true))
  }

  private updateCardStyle(card: PoomsaeCard, animateScale = false) {
    const isSelected = card.container.getData('optionId') === this.selectedOptionId
    const { width, height } = card.container
    const option = card.option
    const targetScale = isSelected ? CARD_SELECTED_SCALE : CARD_NORMAL_SCALE

    this.setCardScale(card, targetScale, animateScale)
    card.title.setColor(isSelected ? '#1f0e02' : '#2d1606')
    card.selectLabel.setText(this.isPoomsaeLoading ? '확인중' : option.isReady ? '선택' : '준비중')
    card.selectLabel.setColor('#ffffff')
    card.image.setAlpha(option.isReady || this.isPoomsaeLoading ? 1 : 0.52)
    card.starText.setAlpha(option.isReady || this.isPoomsaeLoading ? 1 : 0.45)
    drawCuteCardPanel(
      card.panel,
      width,
      height,
      card.palette,
      isSelected ? 'selected' : 'default',
      28,
    )
    this.drawDifficultyStarPill(
      card.starBox,
      0,
      height * CARD_LAYOUT.starBoxY,
      width * CARD_LAYOUT.starBoxWidth,
      height * CARD_LAYOUT.starBoxHeight,
      isSelected,
    )
    drawCutePillButton(
      card.selectButton,
      0,
      height * CARD_LAYOUT.buttonY,
      width * CARD_LAYOUT.buttonWidth,
      height * CARD_LAYOUT.buttonHeight,
      card.palette,
      isSelected ? 'selected' : 'default',
    )
  }

  private setCardScale(card: PoomsaeCard, scale: number, animate: boolean) {
    if (!animate) {
      card.container.setScale(scale)
      return
    }

    this.tweens.add({
      targets: card.container,
      scaleX: scale,
      scaleY: scale,
      duration: CARD_SCALE_TWEEN_DURATION,
      ease: 'Sine.easeOut',
    })
  }

  private drawDifficultyStarPill(
    graphics: Phaser.GameObjects.Graphics,
    cx: number,
    cy: number,
    width: number,
    height: number,
    isSelected: boolean,
  ) {
    const palette = CUTE_CARD_PALETTES.butter
    const radius = height / 2
    graphics.clear()
    graphics.fillStyle(palette.accent, isSelected ? 1 : 0.22)
    graphics.fillRoundedRect(cx - width / 2, cy - height / 2, width, height, radius)
    graphics.fillStyle(0xffffff, isSelected ? 0.28 : 0.38)
    graphics.fillRoundedRect(cx - width / 2 + 3, cy - height / 2 + 3, width - 6, height / 2, radius)
    graphics.lineStyle(1.5, palette.accent, isSelected ? 1 : 0.55)
    graphics.strokeRoundedRect(cx - width / 2, cy - height / 2, width, height, radius)
  }
  private startPoomsaePractice(option: PoomsaeOption) {
    this.isDragging = false

    if (this.isPoomsaeLoading) {
      this.showTemporaryNotice(POOMSAE_LOADING_MESSAGE)
      return
    }

    if (option.isReady) {
      fadeToScene(this, 'TaekwondoPoomsaePracticeScene', {
        duration: FADE_DURATION,
        data: {
          poomsaeId: option.id,
          poomsaeName: option.name,
          poomsae: option.poomsae,
          beltColor: this.beltColor,
        },
      })
      return
    }

    this.showTemporaryNotice(`${option.name}${POOMSAE_NOT_READY_SUFFIX}`)
  }

  private showTemporaryNotice(message: string) {
    const { width: vw, height: vh } = this.scale
    const notice = this.add
      .text(vw / 2, vh * 0.78, message, {
        fontFamily: 'sans-serif',
        fontSize: `${Math.round(Phaser.Math.Clamp(vh * 0.026, 17, 24))}px`,
        color: '#fff3cf',
        fontStyle: '700',
      })
      .setOrigin(0.5)
      .setStroke('#3b1f08', 5)
      .setDepth(5)

    this.tweens.add({
      targets: notice,
      alpha: 0,
      y: notice.y - 18,
      duration: 900,
      delay: 900,
      onComplete: () => notice.destroy(),
    })
  }

  private showPoomsaeGuideIfNeeded(vw: number, vh: number) {
    if (this.maxScrollX <= 0 || this.isPoomsaeGuideDismissed()) {
      return
    }

    this.guideDontShowAgain = false

    const overlay = this.add.container(0, 0).setDepth(40).setScrollFactor(0)
    const blocker = this.add
      .rectangle(vw / 2, vh / 2, vw, vh, 0x1f1b16, 0.58)
      .setInteractive({ useHandCursor: false })
    blocker.on(
      'pointerdown',
      (
        _pointer: Phaser.Input.Pointer,
        _x: number,
        _y: number,
        event: Phaser.Types.Input.EventData,
      ) => event.stopPropagation(),
    )
    blocker.on(
      'pointerup',
      (
        _pointer: Phaser.Input.Pointer,
        _x: number,
        _y: number,
        event: Phaser.Types.Input.EventData,
      ) => event.stopPropagation(),
    )

    const arrow = this.add
      .image(vw * 0.78, vh * 0.5, ASSET_KEYS.guideArrow)
      .setAlpha(0.5)
      .setDisplaySize(vw * 0.35, vw * 0.35 * (1086 / 1448))

    const guideText = this.add
      .text(vw * 0.52, vh * 0.72, '옆으로 쓸어넘겨\n더 많은 품새를 볼 수 있어요.', {
        fontFamily: 'sans-serif',
        fontSize: `${Math.round(Phaser.Math.Clamp(vh * 0.032, 20, 30))}px`,
        color: '#ffffff',
        fontStyle: '700',
        lineSpacing: 8,
      })
      .setOrigin(0, 0.5)
      .setShadow(0, 2, '#3a3027', 4, false, true)

    const checkbox = this.add.graphics()
    const checkboxLabel = this.add
      .text(vw * 0.52 + 38, vh * 0.84, '다시 보지 않기', {
        fontFamily: 'sans-serif',
        fontSize: `${Math.round(Phaser.Math.Clamp(vh * 0.022, 16, 21))}px`,
        color: '#ffffff',
        fontStyle: '700',
      })
      .setOrigin(0, 0.5)
      .setShadow(0, 1, '#3a3027', 3, false, true)
    const checkboxZone = this.add
      .zone(vw * 0.52 + 108, vh * 0.84, 230, 44)
      .setInteractive({ useHandCursor: true })
    checkboxZone.on(
      'pointerdown',
      (
        _pointer: Phaser.Input.Pointer,
        _x: number,
        _y: number,
        event: Phaser.Types.Input.EventData,
      ) => {
        event.stopPropagation()
        this.guideDontShowAgain = !this.guideDontShowAgain
        this.drawGuideCheckbox(checkbox, vw * 0.52, vh * 0.84)
      },
    )
    checkboxZone.on(
      'pointerup',
      (
        _pointer: Phaser.Input.Pointer,
        _x: number,
        _y: number,
        event: Phaser.Types.Input.EventData,
      ) => event.stopPropagation(),
    )

    const confirmButton = this.add.graphics()
    const confirmLabel = this.add
      .text(vw * 0.82, vh * 0.84, '확인', {
        fontFamily: 'sans-serif',
        fontSize: `${Math.round(Phaser.Math.Clamp(vh * 0.023, 17, 22))}px`,
        color: '#ffffff',
        fontStyle: '700',
      })
      .setOrigin(0.5)
      .setShadow(0, 1, '#5b3f1c', 3, false, true)
    const confirmZone = this.add
      .zone(vw * 0.82, vh * 0.84, 132, 48)
      .setInteractive({ useHandCursor: true })
    confirmZone.on(
      'pointerdown',
      (
        _pointer: Phaser.Input.Pointer,
        _x: number,
        _y: number,
        event: Phaser.Types.Input.EventData,
      ) => {
        event.stopPropagation()
        this.hidePoomsaeGuide(this.guideDontShowAgain)
      },
    )
    confirmZone.on(
      'pointerup',
      (
        _pointer: Phaser.Input.Pointer,
        _x: number,
        _y: number,
        event: Phaser.Types.Input.EventData,
      ) => event.stopPropagation(),
    )

    this.drawGuideCheckbox(checkbox, vw * 0.52, vh * 0.84)
    this.drawGuideConfirmButton(confirmButton, vw * 0.82, vh * 0.84)

    overlay.add([
      blocker,
      arrow,
      guideText,
      checkbox,
      checkboxLabel,
      checkboxZone,
      confirmButton,
      confirmLabel,
      confirmZone,
    ])
    this.guideOverlay = overlay
  }

  private drawGuideCheckbox(graphics: Phaser.GameObjects.Graphics, x: number, y: number) {
    graphics.clear()
    graphics.fillStyle(0xffffff, 0.92)
    graphics.fillRoundedRect(x - 16, y - 16, 32, 32, 6)
    graphics.lineStyle(2, 0x8a5a1a, 1)
    graphics.strokeRoundedRect(x - 16, y - 16, 32, 32, 6)

    if (!this.guideDontShowAgain) {
      return
    }

    graphics.lineStyle(4, 0xe6b86a, 1)
    graphics.beginPath()
    graphics.moveTo(x - 8, y)
    graphics.lineTo(x - 1, y + 8)
    graphics.lineTo(x + 11, y - 9)
    graphics.strokePath()
  }

  private drawGuideConfirmButton(graphics: Phaser.GameObjects.Graphics, x: number, y: number) {
    const width = 132
    const height = 48
    graphics.clear()
    graphics.fillStyle(0xe6b86a, 0.96)
    graphics.fillRoundedRect(x - width / 2, y - height / 2, width, height, height / 2)
    graphics.fillStyle(0xffffff, 0.28)
    graphics.fillRoundedRect(
      x - width / 2 + 4,
      y - height / 2 + 4,
      width - 8,
      height / 2,
      height / 2,
    )
    graphics.lineStyle(1.5, 0xffffff, 0.9)
    graphics.strokeRoundedRect(x - width / 2, y - height / 2, width, height, height / 2)
  }

  private hidePoomsaeGuide(savePreference: boolean) {
    if (savePreference) {
      this.setPoomsaeGuideDismissed()
    }

    this.guideOverlay?.destroy()
    this.guideOverlay = null
  }

  private isPoomsaeGuideDismissed() {
    try {
      return localStorage.getItem(POOMSAE_GUIDE_DISMISSED_KEY) === 'true'
    } catch {
      return false
    }
  }

  private setPoomsaeGuideDismissed() {
    try {
      localStorage.setItem(POOMSAE_GUIDE_DISMISSED_KEY, 'true')
    } catch {
      // Ignore storage failures; the guide can simply appear again next time.
    }
  }

  private returnToDojang() {
    this.isDragging = false
    fadeToScene(this, 'TaekwondoSelectScene', {
      duration: FADE_DURATION,
      data: { beltColor: this.beltColor },
    })
  }

  private removeSceneListeners() {
    this.isSceneShuttingDown = true
    this.isDragging = false
    this.didDrag = false
    this.guideOverlay?.destroy()
    this.guideOverlay = null
    this.input.keyboard?.off('keydown-ESC', this.handleEscDown)
    this.input.off('wheel', this.handleWheel)
    this.input.off('pointermove', this.handlePointerMove)
    this.input.off('pointerup', this.handlePointerUp)
    this.input.off('pointerupoutside', this.handlePointerUp)
  }
}
