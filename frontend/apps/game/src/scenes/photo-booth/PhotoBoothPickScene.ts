import Phaser from 'phaser'
import { playSceneBgm } from '@/game/systems/sceneBgm'
import { fadeToScene } from '@/game/systems/sceneTransition'
import { PHOTO_BOOTH_FRAMES, type PhotoFrame } from './frames'
import { exitPhotoBoothToVillage } from './navigation'

const FONT = "'Jua', 'Apple SD Gothic Neo', sans-serif"
const THUMB_MAX_W = 320
const THUMB_ASPECT = 4 / 3
const THUMB_GAP_X = 20
const THUMB_GAP_Y = 20
const THUMB_COLS = 4
const THUMB_ROWS = 2
const GRID_TOP = 170
const GRID_SIDE_MARGIN = 70
const GRID_BOTTOM_SPACE = 110

type ThumbnailSlot = {
  index: number
  x: number
  y: number
  w: number
  h: number
  bg: Phaser.GameObjects.Rectangle
  overlay: Phaser.GameObjects.Rectangle
  orderBadge: Phaser.GameObjects.Container
  orderBadgeText: Phaser.GameObjects.Text
  image: Phaser.GameObjects.Image | null
  textureKey: string | null
}

type PhotoBoothPickSceneData = {
  frameId?: string
  captures?: string[]
}

export class PhotoBoothPickScene extends Phaser.Scene {
  private isTransitioning = false
  private frame!: PhotoFrame
  private captures: string[] = []
  private thumbnailSlots: ThumbnailSlot[] = []
  /** 사용자가 클릭한 순서대로 저장된 thumbnail index 목록. */
  private selectedIndices: number[] = []
  private nextButton!: Phaser.GameObjects.Rectangle
  private nextButtonText!: Phaser.GameObjects.Text
  private counterText!: Phaser.GameObjects.Text

  constructor() {
    super({ key: 'PhotoBoothPickScene' })
  }

  create(data: PhotoBoothPickSceneData = {}) {
    playSceneBgm(this)
    const { width: vw, height: vh } = this.scale
    this.isTransitioning = false
    this.frame = PHOTO_BOOTH_FRAMES.find(f => f.id === data.frameId) ?? PHOTO_BOOTH_FRAMES[0]
    this.captures = data.captures ?? []
    this.thumbnailSlots = []
    this.selectedIndices = []

    this.add.rectangle(0, 0, vw, vh, 0xffffff).setOrigin(0)

    this.add
      .text(60, 80, '3  사진 선택', {
        fontFamily: FONT,
        fontSize: '36px',
        color: '#ff7aa3',
      })
      .setOrigin(0, 0.5)
    this.add
      .text(60, 122, `프레임에 넣을 4장을 순서대로 골라요`, {
        fontFamily: FONT,
        fontSize: '15px',
        color: '#b39e8d',
      })
      .setOrigin(0, 0.5)

    const counterBg = this.add
      .rectangle(vw - 60, 80, 110, 38, 0xfff0f4, 1)
      .setOrigin(1, 0.5)
      .setStrokeStyle(2, 0xffc1d8, 1)
    this.counterText = this.add
      .text(counterBg.x - counterBg.width / 2, 80, '0 / 4', {
        fontFamily: FONT,
        fontSize: '18px',
        color: '#ff7aa3',
      })
      .setOrigin(0.5)

    const maxGridW = Math.max(360, vw - GRID_SIDE_MARGIN * 2)
    const maxGridH = Math.max(280, vh - GRID_TOP - GRID_BOTTOM_SPACE)
    const thumbW = Math.min(
      THUMB_MAX_W,
      (maxGridW - (THUMB_COLS - 1) * THUMB_GAP_X) / THUMB_COLS,
      ((maxGridH - (THUMB_ROWS - 1) * THUMB_GAP_Y) / THUMB_ROWS) * THUMB_ASPECT,
    )
    const thumbH = thumbW / THUMB_ASPECT
    const gridW = THUMB_COLS * thumbW + (THUMB_COLS - 1) * THUMB_GAP_X
    const gridH = THUMB_ROWS * thumbH + (THUMB_ROWS - 1) * THUMB_GAP_Y
    const gridLeft = (vw - gridW) / 2
    const gridTop = Math.max(GRID_TOP, (vh - gridH) / 2 + 10)

    for (let i = 0; i < this.captures.length && i < THUMB_COLS * THUMB_ROWS; i += 1) {
      const col = i % THUMB_COLS
      const row = Math.floor(i / THUMB_COLS)
      const x = gridLeft + col * (thumbW + THUMB_GAP_X) + thumbW / 2
      const y = gridTop + row * (thumbH + THUMB_GAP_Y) + thumbH / 2

      const bg = this.add
        .rectangle(x, y, thumbW, thumbH, 0xf5f0ea, 1)
        .setOrigin(0.5)
        .setStrokeStyle(3, 0xe5d8cc, 1)
        .setInteractive({ useHandCursor: true })

      const overlay = this.add.rectangle(x, y, thumbW, thumbH, 0xff7aa3, 0).setOrigin(0.5)

      const badgeBg = this.add.circle(0, 0, 22, 0xff7aa3, 1).setStrokeStyle(3, 0xffffff, 1)
      const badgeText = this.add
        .text(0, 0, '', {
          fontFamily: FONT,
          fontSize: '20px',
          color: '#ffffff',
        })
        .setOrigin(0.5)
      const orderBadge = this.add
        .container(x + thumbW / 2 - 22, y - thumbH / 2 + 22, [badgeBg, badgeText])
        .setVisible(false)

      const slot: ThumbnailSlot = {
        index: i,
        x,
        y,
        w: thumbW,
        h: thumbH,
        bg,
        overlay,
        orderBadge,
        orderBadgeText: badgeText,
        image: null,
        textureKey: null,
      }
      this.thumbnailSlots.push(slot)

      bg.on('pointerdown', () => this.toggleSelect(i))
      this.loadThumbnail(slot, this.captures[i])
    }

    const buttonY = vh - 60

    const retakeBg = this.add
      .rectangle(120, buttonY, 160, 48, 0xffffff, 1)
      .setOrigin(0.5)
      .setStrokeStyle(2, 0xffc1d8, 1)
      .setInteractive({ useHandCursor: true })
    this.add
      .text(120, buttonY, '← 다시 찍기', {
        fontFamily: FONT,
        fontSize: '16px',
        color: '#ff7aa3',
      })
      .setOrigin(0.5)
    retakeBg.on('pointerdown', () => this.backToCamera())
    retakeBg.on('pointerover', () => retakeBg.setFillStyle(0xffe9f1))
    retakeBg.on('pointerout', () => retakeBg.setFillStyle(0xffffff))

    this.nextButton = this.add
      .rectangle(vw - 140, buttonY, 200, 56, 0xe5d8cc, 1)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
    this.nextButtonText = this.add
      .text(vw - 140, buttonY, '다음 →', {
        fontFamily: FONT,
        fontSize: '20px',
        color: '#ffffff',
      })
      .setOrigin(0.5)
    this.nextButton.on('pointerdown', () => this.confirm())
    this.nextButton.on('pointerover', () => {
      if (this.selectedIndices.length === this.frame.cutCount) {
        this.nextButton.setFillStyle(0xffa3b6)
      }
    })
    this.nextButton.on('pointerout', () => this.refreshNextButtonStyle())

    this.input.keyboard?.on('keydown-ESC', () => this.exitToVillage())

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanupTextures())

    this.refreshNextButtonStyle()
    this.cameras.main.fadeIn(250, 0, 0, 0)
  }

  private loadThumbnail(slot: ThumbnailSlot, dataUrl: string) {
    if (!dataUrl) return
    const img = new Image()
    img.onload = () => {
      if (!this.scene.isActive()) return
      const key = `photo-booth-pick-${slot.index}-${Date.now()}`
      this.textures.addImage(key, img)
      const image = this.add.image(slot.x, slot.y, key).setOrigin(0.5)
      const scale = Math.max(slot.w / image.width, slot.h / image.height)
      image.setScale(scale)
      const mask = this.make
        .graphics({ x: 0, y: 0 }, false)
        .fillRect(slot.x - slot.w / 2, slot.y - slot.h / 2, slot.w, slot.h)
      image.setMask(mask.createGeometryMask())
      slot.image = image
      slot.textureKey = key
      slot.overlay.setDepth(image.depth + 1)
      slot.orderBadge.setDepth(image.depth + 2)
      slot.bg.setDepth(image.depth - 1)
    }
    img.src = dataUrl
  }

  private toggleSelect(index: number) {
    const existing = this.selectedIndices.indexOf(index)
    if (existing >= 0) {
      this.selectedIndices.splice(existing, 1)
    } else {
      if (this.selectedIndices.length >= this.frame.cutCount) return
      this.selectedIndices.push(index)
    }
    this.refreshSelectionVisuals()
  }

  private refreshSelectionVisuals() {
    this.thumbnailSlots.forEach(slot => {
      const order = this.selectedIndices.indexOf(slot.index)
      if (order >= 0) {
        slot.overlay.setAlpha(0.28)
        slot.bg.setStrokeStyle(3, 0xff7aa3, 1)
        slot.orderBadge.setVisible(true)
        slot.orderBadgeText.setText(String(order + 1))
      } else {
        slot.overlay.setAlpha(0)
        slot.bg.setStrokeStyle(3, 0xe5d8cc, 1)
        slot.orderBadge.setVisible(false)
      }
    })
    this.counterText.setText(`${this.selectedIndices.length} / ${this.frame.cutCount}`)
    this.refreshNextButtonStyle()
  }

  private refreshNextButtonStyle() {
    const ready = this.selectedIndices.length === this.frame.cutCount
    this.nextButton.setFillStyle(ready ? 0xff8ba0 : 0xe5d8cc)
    this.nextButtonText.setColor(ready ? '#ffffff' : '#fff4e6')
  }

  private confirm() {
    if (this.isTransitioning) return
    if (this.selectedIndices.length !== this.frame.cutCount) return
    const pickedCaptures = this.selectedIndices.map(i => this.captures[i])
    this.isTransitioning = true
    fadeToScene(this, 'PhotoBoothResultScene', {
      duration: 250,
      data: {
        frameId: this.frame.id,
        captures: pickedCaptures,
        allCaptures: this.captures,
      },
    })
  }

  private backToCamera() {
    if (this.isTransitioning) return
    this.isTransitioning = true
    fadeToScene(this, 'PhotoBoothCameraScene', {
      duration: 250,
      data: { frameId: this.frame.id },
    })
  }

  private exitToVillage() {
    if (this.isTransitioning) return
    this.isTransitioning = true
    exitPhotoBoothToVillage(this)
  }

  private cleanupTextures() {
    this.thumbnailSlots.forEach(slot => {
      if (slot.textureKey && this.textures.exists(slot.textureKey)) {
        this.textures.remove(slot.textureKey)
      }
    })
  }
}
