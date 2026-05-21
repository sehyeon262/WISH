import Phaser from 'phaser'
import { playSceneBgm } from '@/game/systems/sceneBgm'
import { assetPath } from '@/game/assets/assetPath'
import { fadeToScene } from '@/game/systems/sceneTransition'
import { PHOTO_BOOTH_FRAMES, type PhotoFrame } from './frames'

const FRAME_PREVIEW_CELL_MAX_W = 320
const FRAME_PREVIEW_MAX_H = 430
const FRAME_GAP = 44
const FRAME_SIDE_MARGIN = 72
const FRAMES_ROW_TOP = 220
const FONT = "'Jua', 'Apple SD Gothic Neo', sans-serif"

type FrameItem = {
  frame: PhotoFrame
  image: Phaser.GameObjects.Image
  highlight: Phaser.GameObjects.Rectangle
}

const getFramePreviewSize = (frame: PhotoFrame, maxW: number, maxH: number) => {
  const fitByWidth = maxW / frame.aspect <= maxH
  return fitByWidth ? { w: maxW, h: maxW / frame.aspect } : { w: maxH * frame.aspect, h: maxH }
}

export class PhotoBoothFrameSelectScene extends Phaser.Scene {
  private isTransitioning = false
  private currentIndex = 0
  private frameItems: FrameItem[] = []

  constructor() {
    super({ key: 'PhotoBoothFrameSelectScene' })
  }

  preload() {
    PHOTO_BOOTH_FRAMES.forEach(frame => {
      this.load.image(frame.overlayKey, assetPath(frame.overlayPath))
    })
  }

  create() {
    playSceneBgm(this)
    const { width: vw, height: vh } = this.scale
    this.isTransitioning = false
    this.currentIndex = 0
    this.frameItems = []

    // 거의 불투명한 흰 배경 — paused 마을이 아주 어렴풋이만 비춤.
    this.add.rectangle(0, 0, vw, vh, 0xffffff, 0.94).setOrigin(0)

    this.add
      .text(60, 80, '1  프레임 선택', {
        fontFamily: FONT,
        fontSize: '36px',
        color: '#ff7aa3',
      })
      .setOrigin(0, 0.5)
    this.add
      .text(60, 122, '원하는 프레임을 선택하세요', {
        fontFamily: FONT,
        fontSize: '15px',
        color: '#b39e8d',
      })
      .setOrigin(0, 0.5)

    const badgeBg = this.add
      .rectangle(vw - 60, 80, 90, 38, 0xfff0f4, 1)
      .setOrigin(1, 0.5)
      .setStrokeStyle(2, 0xffc1d8, 1)
    this.add
      .text(badgeBg.x - badgeBg.width / 2, 80, '4 cut', {
        fontFamily: FONT,
        fontSize: '18px',
        color: '#ff7aa3',
      })
      .setOrigin(0.5)

    const frameCount = PHOTO_BOOTH_FRAMES.length
    const availableRowW = Math.max(320, vw - FRAME_SIDE_MARGIN * 2)
    const cellW = Math.max(
      80,
      Math.min(
        FRAME_PREVIEW_CELL_MAX_W,
        (availableRowW - FRAME_GAP * (frameCount - 1)) / frameCount,
      ),
    )
    const maxPreviewH = Math.max(180, Math.min(FRAME_PREVIEW_MAX_H, vh - FRAMES_ROW_TOP - 150))
    const previewSizes = PHOTO_BOOTH_FRAMES.map(frame =>
      getFramePreviewSize(frame, cellW, maxPreviewH),
    )
    const totalWidth = cellW * frameCount + FRAME_GAP * (frameCount - 1)
    const rowStartX = (vw - totalWidth) / 2

    PHOTO_BOOTH_FRAMES.forEach((frame, index) => {
      const { w: frameW, h: frameH } = previewSizes[index]!
      const cellX = rowStartX + index * (cellW + FRAME_GAP) + cellW / 2
      const cellY = FRAMES_ROW_TOP + maxPreviewH / 2
      const frameX = cellX
      const frameY = cellY

      const highlight = this.add
        .rectangle(frameX, frameY, frameW + 22, frameH + 22, 0xfff0f4, 1)
        .setOrigin(0.5)
        .setStrokeStyle(4, 0xff7aa3, 1)
        .setVisible(false)

      // 회색 슬롯 배경 먼저 (프레임 PNG 의 투명 슬롯 영역으로 비춰 보임)
      frame.slots.forEach(slot => {
        const slotW = slot.wRatio * frameW
        const slotH = slot.hRatio * frameH
        const slotX = frameX - frameW / 2 + slot.xRatio * frameW + slotW / 2
        const slotY = frameY - frameH / 2 + slot.yRatio * frameH + slotH / 2
        this.add.rectangle(slotX, slotY, slotW, slotH, 0xdcdcdc, 1).setOrigin(0.5)
      })

      // 프레임 PNG 가 슬롯 위에 (데코가 회색 배경을 덮음)
      const image = this.add
        .image(frameX, frameY, frame.overlayKey)
        .setOrigin(0.5)
        .setDisplaySize(frameW, frameH)
        .setInteractive({ useHandCursor: true })

      image.on('pointerdown', () => this.selectIndex(index))

      this.frameItems.push({ frame, image, highlight })
    })

    this.createNextButton(vw - 140, vh - 60)
    this.createBackButton(120, vh - 60)

    this.input.keyboard?.on('keydown-ESC', () => this.returnToVillage())
    this.input.keyboard?.on('keydown-LEFT', () => this.selectPrev())
    this.input.keyboard?.on('keydown-RIGHT', () => this.selectNext())
    this.input.keyboard?.on('keydown-ENTER', () => this.confirmSelection())

    this.renderSelection()
    // 검은 fadeIn 대신 카메라 알파를 0 → 1 로 트윈 — 마을이 보이는 상태에서 자연스럽게 위에 떠오름.
    this.cameras.main.setAlpha(0)
    this.tweens.add({
      targets: this.cameras.main,
      alpha: 1,
      duration: 250,
      ease: 'Sine.easeOut',
    })
  }

  private createNextButton(x: number, y: number) {
    const button = this.add
      .rectangle(x, y, 200, 56, 0xff8ba0, 1)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
    this.add
      .text(x, y, '다음 →', {
        fontFamily: FONT,
        fontSize: '20px',
        color: '#ffffff',
      })
      .setOrigin(0.5)
    button.on('pointerdown', () => this.confirmSelection())
    button.on('pointerover', () => button.setFillStyle(0xffa3b6))
    button.on('pointerout', () => button.setFillStyle(0xff8ba0))
  }

  private createBackButton(x: number, y: number) {
    const button = this.add
      .rectangle(x, y, 160, 48, 0xffffff, 1)
      .setOrigin(0.5)
      .setStrokeStyle(2, 0xffc1d8, 1)
      .setInteractive({ useHandCursor: true })
    this.add
      .text(x, y, '← 마을로', {
        fontFamily: FONT,
        fontSize: '16px',
        color: '#ff7aa3',
      })
      .setOrigin(0.5)
    button.on('pointerdown', () => this.returnToVillage())
    button.on('pointerover', () => button.setFillStyle(0xffe9f1))
    button.on('pointerout', () => button.setFillStyle(0xffffff))
  }

  private selectPrev() {
    this.selectIndex(
      (this.currentIndex - 1 + PHOTO_BOOTH_FRAMES.length) % PHOTO_BOOTH_FRAMES.length,
    )
  }

  private selectNext() {
    this.selectIndex((this.currentIndex + 1) % PHOTO_BOOTH_FRAMES.length)
  }

  private selectIndex(index: number) {
    if (this.currentIndex === index) return
    this.currentIndex = index
    this.renderSelection()
  }

  private renderSelection() {
    this.frameItems.forEach((item, index) => {
      item.highlight.setVisible(index === this.currentIndex)
    })
  }

  private confirmSelection() {
    if (this.isTransitioning) return
    const frame = PHOTO_BOOTH_FRAMES[this.currentIndex]
    this.isTransitioning = true
    fadeToScene(this, 'PhotoBoothCameraScene', {
      duration: 250,
      data: { frameId: frame.id },
    })
  }

  private returnToVillage() {
    if (this.isTransitioning) return
    this.isTransitioning = true
    // 마을은 paused 상태로 계속 살아 있으므로 fadeToScene 으로 새로 시작하지 않고 resume.
    // 카메라 알파만 0 으로 트윈해 자연스럽게 사라지고, 끝나면 자기 자신만 stop.
    this.tweens.add({
      targets: this.cameras.main,
      alpha: 0,
      duration: 250,
      ease: 'Sine.easeIn',
      onComplete: () => {
        this.scene.resume('VillageScene')
        this.scene.stop()
      },
    })
  }
}
