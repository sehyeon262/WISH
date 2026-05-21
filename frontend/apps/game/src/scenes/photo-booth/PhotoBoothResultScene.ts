import Phaser from 'phaser'
import { playSceneBgm } from '@/game/systems/sceneBgm'
import { assetPath } from '@/game/assets/assetPath'
import { fadeToScene } from '@/game/systems/sceneTransition'
import { PHOTO_BOOTH_FRAMES, type PhotoFrame } from './frames'
import { applyPhotoFilter, PHOTO_FILTERS, type PhotoFilter, type PhotoFilterId } from './filters'
import { exitPhotoBoothToVillage } from './navigation'
import { createRoundedButton } from './roundedUi'

const FONT = "'Jua', 'Apple SD Gothic Neo', sans-serif"
const FILTER_PANEL_W = 220
const FILTER_BUTTON_H = 96
const FILTER_THUMB_W = 80
const FILTER_THUMB_H = 60
const FILTER_BUTTON_GAP = 16

type SlotDisplay = {
  index: number
  x: number
  y: number
  w: number
  h: number
  image: Phaser.GameObjects.Image | null
  mask: Phaser.GameObjects.Graphics | null
  textureKey: string | null
}

type FilterButton = {
  id: PhotoFilterId
  drawBg: (active: boolean, hover: boolean) => void
  thumbX: number
  thumbY: number
  thumbImage: Phaser.GameObjects.Image | null
  thumbTextureKey: string | null
  label: Phaser.GameObjects.Text
}

type PhotoBoothResultSceneData = {
  frameId?: string
  captures?: string[]
  allCaptures?: string[]
}

export class PhotoBoothResultScene extends Phaser.Scene {
  private isTransitioning = false
  private frame!: PhotoFrame
  /** 선택된 4장 원본 dataURL. 필터 적용 기준. */
  private originalCaptures: string[] = []
  /** 카메라에서 찍은 전체 8장 (다시 고르기 시 Pick 으로 전달). */
  private allCaptures: string[] = []
  /** 현재 필터 적용된 4장 dataURL (다운로드용). */
  private filteredCaptures: string[] = []
  private currentFilter: PhotoFilterId = 'original'
  private slotDisplays: SlotDisplay[] = []
  private filterButtons: FilterButton[] = []
  private isFilterApplying = false
  private filterRequestId = 0

  constructor() {
    super({ key: 'PhotoBoothResultScene' })
  }

  preload() {
    PHOTO_BOOTH_FRAMES.forEach(frame => {
      this.load.image(frame.overlayKey, assetPath(frame.overlayPath))
    })
  }

  create(data: PhotoBoothResultSceneData = {}) {
    playSceneBgm(this)
    const { width: vw, height: vh } = this.scale
    this.isTransitioning = false
    this.frame = PHOTO_BOOTH_FRAMES.find(f => f.id === data.frameId) ?? PHOTO_BOOTH_FRAMES[0]
    this.originalCaptures = data.captures ?? []
    this.allCaptures = data.allCaptures ?? data.captures ?? []
    this.filteredCaptures = [...this.originalCaptures]
    this.currentFilter = 'original'
    this.slotDisplays = []
    this.filterButtons = []
    this.isFilterApplying = false
    this.filterRequestId = 0

    this.add.rectangle(0, 0, vw, vh, 0xffffff).setOrigin(0)

    this.add
      .text(60, 60, '4  필터 선택', {
        fontFamily: FONT,
        fontSize: '34px',
        color: '#ff7aa3',
        resolution: 2,
      })
      .setOrigin(0, 0)
    this.add
      .text(60, 100, '필터를 골라 인생네컷을 완성해요', {
        fontFamily: FONT,
        fontSize: '15px',
        color: '#b39e8d',
        resolution: 2,
      })
      .setOrigin(0, 0)

    // 프레임 + 슬롯 (왼쪽 영역)
    const CONTENT_TOP = 150
    const BOTTOM_GAP = 180
    const frameAreaRight = vw - FILTER_PANEL_W - 80
    const frameAreaLeft = 80
    const frameAreaW = frameAreaRight - frameAreaLeft
    const frameAreaH = vh - CONTENT_TOP - BOTTOM_GAP
    const fitByWidth = frameAreaW / this.frame.aspect <= frameAreaH
    const frameW = fitByWidth ? frameAreaW : frameAreaH * this.frame.aspect
    const frameH = fitByWidth ? frameAreaW / this.frame.aspect : frameAreaH
    const frameX = frameAreaLeft + frameAreaW / 2
    const frameY = CONTENT_TOP + frameH / 2
    const frameLeft = frameX - frameW / 2
    const frameTop = frameY - frameH / 2

    // 프레임 PNG 의 슬롯은 이미 투명(alpha=0)이므로 사진 위에 원본 그대로 올리면
    // 데코는 그대로, 슬롯 영역만 사진이 비춤.
    this.add
      .image(frameX, frameY, this.frame.overlayKey)
      .setOrigin(0.5)
      .setDisplaySize(frameW, frameH)
      .setDepth(2)

    this.frame.slots.forEach((slot, index) => {
      const slotW = slot.wRatio * frameW
      const slotH = slot.hRatio * frameH
      const slotX = frameLeft + slot.xRatio * frameW + slotW / 2
      const slotY = frameTop + slot.yRatio * frameH + slotH / 2
      const display: SlotDisplay = {
        index,
        x: slotX,
        y: slotY,
        w: slotW,
        h: slotH,
        image: null,
        mask: null,
        textureKey: null,
      }
      this.slotDisplays.push(display)
      const dataUrl = this.originalCaptures[index]
      if (dataUrl) {
        void this.replaceSlotImage(display, dataUrl)
      }
    })

    // 필터 패널 (오른쪽)
    const panelX = vw - FILTER_PANEL_W / 2 - 40
    const panelTopY = CONTENT_TOP
    PHOTO_FILTERS.forEach((filter, i) => {
      const y = panelTopY + i * (FILTER_BUTTON_H + FILTER_BUTTON_GAP) + FILTER_BUTTON_H / 2
      const button = this.createFilterButton(panelX, y, filter)
      this.filterButtons.push(button)
    })

    // 첫번째 캡처 원본으로 썸네일 4종 미리 생성
    if (this.originalCaptures.length > 0) {
      void this.buildFilterThumbnails(this.originalCaptures[0])
    }

    // 하단 버튼 (라운드)
    const buttonY = vh - 80
    createRoundedButton(this, {
      x: 150,
      y: buttonY,
      w: 220,
      h: 52,
      fill: 0xffffff,
      fillHover: 0xffe9f1,
      stroke: { color: 0xffc1d8, width: 2 },
      label: '← 사진 다시 고르기',
      labelColor: '#ff7aa3',
      labelSize: 15,
      depth: 20,
      onClick: () => this.backToPick(),
    })
    createRoundedButton(this, {
      x: vw - 140,
      y: buttonY,
      w: 220,
      h: 60,
      fill: 0xff8ba0,
      fillHover: 0xffa3b6,
      label: '다음 →',
      labelColor: '#ffffff',
      labelSize: 22,
      depth: 20,
      onClick: () => this.confirm(),
    })

    this.input.keyboard?.on('keydown-ESC', () => this.exitToVillage())

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanupTextures())

    this.refreshFilterHighlight()
    this.cameras.main.fadeIn(250, 0, 0, 0)
  }

  private createFilterButton(x: number, y: number, filter: PhotoFilter): FilterButton {
    const bgGraphics = this.add.graphics().setDepth(10)
    const drawBg = (active: boolean, hover: boolean) => {
      bgGraphics.clear()
      bgGraphics.lineStyle(active ? 3 : 2, active ? 0xff7aa3 : 0xe5d8cc, 1)
      const fillColor = active ? 0xfff0f4 : hover ? 0xfff8fa : 0xffffff
      bgGraphics.fillStyle(fillColor, 1)
      const left = x - FILTER_PANEL_W / 2
      const top = y - FILTER_BUTTON_H / 2
      bgGraphics.fillRoundedRect(left, top, FILTER_PANEL_W, FILTER_BUTTON_H, 18)
      bgGraphics.strokeRoundedRect(left, top, FILTER_PANEL_W, FILTER_BUTTON_H, 18)
    }
    drawBg(false, false)

    const thumbX = x - FILTER_PANEL_W / 2 + FILTER_THUMB_W / 2 + 14
    const thumbY = y
    const thumbBgGfx = this.add.graphics().setDepth(11)
    thumbBgGfx.fillStyle(0xf5f0ea, 1)
    thumbBgGfx.lineStyle(1, 0xe5d8cc, 1)
    thumbBgGfx.fillRoundedRect(
      thumbX - FILTER_THUMB_W / 2,
      thumbY - FILTER_THUMB_H / 2,
      FILTER_THUMB_W,
      FILTER_THUMB_H,
      10,
    )
    thumbBgGfx.strokeRoundedRect(
      thumbX - FILTER_THUMB_W / 2,
      thumbY - FILTER_THUMB_H / 2,
      FILTER_THUMB_W,
      FILTER_THUMB_H,
      10,
    )

    const label = this.add
      .text(thumbX + FILTER_THUMB_W / 2 + 16, y, filter.label, {
        fontFamily: FONT,
        fontSize: '18px',
        color: '#b39e8d',
        resolution: 2,
      })
      .setOrigin(0, 0.5)
      .setDepth(11)

    const hitArea = this.add
      .rectangle(x, y, FILTER_PANEL_W, FILTER_BUTTON_H, 0x000000, 0)
      .setOrigin(0.5)
      .setDepth(12)
      .setInteractive({ useHandCursor: true })
    hitArea.on('pointerdown', () => void this.selectFilter(filter.id))
    hitArea.on('pointerover', () => {
      if (this.currentFilter !== filter.id) drawBg(false, true)
    })
    hitArea.on('pointerout', () => {
      if (this.currentFilter !== filter.id) drawBg(false, false)
    })

    return {
      id: filter.id,
      drawBg,
      thumbX,
      thumbY,
      thumbImage: null,
      thumbTextureKey: null,
      label,
    }
  }

  private async buildFilterThumbnails(referenceDataUrl: string) {
    for (const filter of PHOTO_FILTERS) {
      try {
        const filtered = await applyPhotoFilter(referenceDataUrl, filter.id)
        if (!this.scene.isActive()) return
        const img = await this.loadHtmlImage(filtered)
        if (!this.scene.isActive()) return
        const button = this.filterButtons.find(b => b.id === filter.id)
        if (!button) continue
        const key = `photo-booth-filter-thumb-${filter.id}-${Date.now()}`
        this.textures.addImage(key, img)
        const thumb = this.add.image(button.thumbX, button.thumbY, key).setOrigin(0.5)
        const scale = Math.max(FILTER_THUMB_W / thumb.width, FILTER_THUMB_H / thumb.height)
        thumb.setScale(scale)
        const mask = this.make
          .graphics({ x: 0, y: 0 }, false)
          .fillRect(
            button.thumbX - FILTER_THUMB_W / 2,
            button.thumbY - FILTER_THUMB_H / 2,
            FILTER_THUMB_W,
            FILTER_THUMB_H,
          )
        thumb.setMask(mask.createGeometryMask())
        thumb.setDepth(12)
        button.thumbImage = thumb
        button.thumbTextureKey = key
      } catch (err) {
        console.warn('필터 썸네일 생성 실패', filter.id, err)
      }
    }
  }

  private async selectFilter(filter: PhotoFilterId) {
    if (this.currentFilter === filter || this.isFilterApplying) return
    this.currentFilter = filter
    this.refreshFilterHighlight()

    const requestId = ++this.filterRequestId
    this.isFilterApplying = true
    try {
      const filteredUrls = await Promise.all(
        this.originalCaptures.map(url => applyPhotoFilter(url, filter)),
      )
      if (requestId !== this.filterRequestId || !this.scene.isActive()) return
      this.filteredCaptures = filteredUrls
      for (let i = 0; i < this.slotDisplays.length; i += 1) {
        const display = this.slotDisplays[i]
        const url = filteredUrls[i]
        if (!url) continue
        await this.replaceSlotImage(display, url)
        if (requestId !== this.filterRequestId || !this.scene.isActive()) return
      }
    } finally {
      this.isFilterApplying = false
    }
  }

  private refreshFilterHighlight() {
    this.filterButtons.forEach(button => {
      const active = button.id === this.currentFilter
      button.drawBg(active, false)
      button.label.setColor(active ? '#ff7aa3' : '#b39e8d')
    })
  }

  private async replaceSlotImage(display: SlotDisplay, dataUrl: string) {
    const img = await this.loadHtmlImage(dataUrl)
    if (!this.scene.isActive()) return
    const key = `photo-booth-slot-${display.index}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    this.textures.addImage(key, img)

    display.image?.destroy()
    display.mask?.destroy()
    if (display.textureKey && this.textures.exists(display.textureKey)) {
      this.textures.remove(display.textureKey)
    }

    const image = this.add.image(display.x, display.y, key).setOrigin(0.5).setDepth(1)
    const scale = Math.max(display.w / image.width, display.h / image.height)
    image.setScale(scale)
    const mask = this.make
      .graphics({ x: 0, y: 0 }, false)
      .fillRect(display.x - display.w / 2, display.y - display.h / 2, display.w, display.h)
    image.setMask(mask.createGeometryMask())

    display.image = image
    display.mask = mask
    display.textureKey = key
  }

  private loadHtmlImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = reject
      img.src = src
    })
  }

  private cleanupTextures() {
    this.slotDisplays.forEach(display => {
      if (display.textureKey && this.textures.exists(display.textureKey)) {
        this.textures.remove(display.textureKey)
      }
    })
    this.filterButtons.forEach(button => {
      if (button.thumbTextureKey && this.textures.exists(button.thumbTextureKey)) {
        this.textures.remove(button.thumbTextureKey)
      }
    })
  }

  private backToPick() {
    if (this.isTransitioning) return
    this.isTransitioning = true
    fadeToScene(this, 'PhotoBoothPickScene', {
      duration: 250,
      data: { frameId: this.frame.id, captures: this.allCaptures },
    })
  }

  private confirm() {
    if (this.isTransitioning) return
    this.isTransitioning = true
    fadeToScene(this, 'PhotoBoothSaveScene', {
      duration: 250,
      data: {
        frameId: this.frame.id,
        captures: this.filteredCaptures,
        allCaptures: this.allCaptures,
      },
    })
  }

  private exitToVillage() {
    if (this.isTransitioning) return
    this.isTransitioning = true
    exitPhotoBoothToVillage(this)
  }
}
