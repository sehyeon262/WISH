import Phaser from 'phaser'
import { PUBLIC_PHOTO_BOOTHS_QUERY_KEY } from '@/features/photoGallery'
import { playSceneBgm } from '@/game/systems/sceneBgm'
import { queryClient } from '@/queryClient'
import { createPhotoBooth } from '@wish/api-client'
import { assetPath } from '@/game/assets/assetPath'
import { fadeToScene } from '@/game/systems/sceneTransition'
import { PHOTO_BOOTH_FRAMES, type PhotoFrame } from './frames'
import { exitPhotoBoothToVillage, PHOTO_BOOTH_RETURN_SPAWN } from './navigation'
import { createRoundedButton, drawRoundedCard } from './roundedUi'

const FONT = "'Jua', 'Apple SD Gothic Neo', sans-serif"
const RIGHT_PANEL_W = 320
const HORIZ_MARGIN = 80
const TITLE_TOP = 70
const SUBTITLE_TOP = 110
const CONTENT_TOP = 170
const BOTTOM_MARGIN = 100
const BUTTON_BOTTOM_OFFSET = 80

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

type PhotoBoothSaveSceneData = {
  frameId?: string
  captures?: string[]
  allCaptures?: string[]
}

export class PhotoBoothSaveScene extends Phaser.Scene {
  private isTransitioning = false
  private frame!: PhotoFrame
  private captures: string[] = []
  private allCaptures: string[] = []
  private slotDisplays: SlotDisplay[] = []
  private isPublic = true
  private publicToggleBgGraphics!: Phaser.GameObjects.Graphics
  private publicToggleHitArea!: Phaser.GameObjects.Rectangle
  private publicToggleKnob!: Phaser.GameObjects.Arc
  private publicLabel!: Phaser.GameObjects.Text
  private toggleCenterX = 0
  private toggleCenterY = 0
  private toggleW = 64
  private toggleH = 32

  constructor() {
    super({ key: 'PhotoBoothSaveScene' })
  }

  preload() {
    PHOTO_BOOTH_FRAMES.forEach(frame => {
      this.load.image(frame.overlayKey, assetPath(frame.overlayPath))
    })
  }

  create(data: PhotoBoothSaveSceneData = {}) {
    playSceneBgm(this)
    const { width: vw, height: vh } = this.scale
    this.isTransitioning = false
    this.frame = PHOTO_BOOTH_FRAMES.find(f => f.id === data.frameId) ?? PHOTO_BOOTH_FRAMES[0]
    this.captures = data.captures ?? []
    this.allCaptures = data.allCaptures ?? data.captures ?? []
    this.slotDisplays = []
    this.isPublic = true

    this.add.rectangle(0, 0, vw, vh, 0xffffff).setOrigin(0)

    this.add
      .text(60, TITLE_TOP, '5  저장하기', {
        fontFamily: FONT,
        fontSize: '34px',
        color: '#ff7aa3',
        resolution: 2,
      })
      .setOrigin(0, 0)
    this.add
      .text(60, SUBTITLE_TOP, '다운로드하고, 다른 친구들과 공유할 수도 있어요', {
        fontFamily: FONT,
        fontSize: '15px',
        color: '#b39e8d',
        resolution: 2,
      })
      .setOrigin(0, 0)

    // 좌측 프레임 미리보기 (사진 아래 + 프레임 위)
    const frameAreaRight = vw - RIGHT_PANEL_W - HORIZ_MARGIN
    const frameAreaLeft = HORIZ_MARGIN
    const frameAreaW = frameAreaRight - frameAreaLeft
    const frameAreaH = vh - CONTENT_TOP - BOTTOM_MARGIN - BUTTON_BOTTOM_OFFSET
    const fitByWidth = frameAreaW / this.frame.aspect <= frameAreaH
    const frameW = fitByWidth ? frameAreaW : frameAreaH * this.frame.aspect
    const frameH = fitByWidth ? frameAreaW / this.frame.aspect : frameAreaH
    const frameX = frameAreaLeft + frameAreaW / 2
    const frameY = CONTENT_TOP + frameH / 2
    const frameLeft = frameX - frameW / 2
    const frameTop = frameY - frameH / 2

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
      const dataUrl = this.captures[index]
      if (dataUrl) void this.loadSlot(display, dataUrl)
    })

    this.add
      .image(frameX, frameY, this.frame.overlayKey)
      .setOrigin(0.5)
      .setDisplaySize(frameW, frameH)
      .setDepth(2)

    // 우측 패널
    const panelLeftX = vw - RIGHT_PANEL_W - HORIZ_MARGIN / 2
    const panelCenterX = panelLeftX + RIGHT_PANEL_W / 2

    // 다운로드 버튼
    createRoundedButton(this, {
      x: panelCenterX,
      y: CONTENT_TOP + 36,
      w: RIGHT_PANEL_W,
      h: 64,
      fill: 0xff8ba0,
      fillHover: 0xffa3b6,
      label: '⬇  다운로드',
      labelColor: '#ffffff',
      labelSize: 20,
      onClick: () => void this.downloadComposite(),
    })

    // 공개 설정 카드 (라운드)
    const cardCenterX = panelCenterX
    const cardCenterY = CONTENT_TOP + 158
    const cardH = 150
    const cardGfx = this.add.graphics()
    drawRoundedCard(cardGfx, {
      x: cardCenterX,
      y: cardCenterY,
      w: RIGHT_PANEL_W,
      h: cardH,
      r: 20,
      fill: 0xfff5f7,
      stroke: { color: 0xffe0ec, width: 2 },
    })
    this.add
      .text(panelLeftX + 24, cardCenterY - cardH / 2 + 22, '공개 설정', {
        fontFamily: FONT,
        fontSize: '17px',
        color: '#ff7aa3',
        resolution: 2,
      })
      .setOrigin(0, 0)
    this.publicLabel = this.add
      .text(panelLeftX + 24, cardCenterY - cardH / 2 + 56, '공개 (모두 보기)', {
        fontFamily: FONT,
        fontSize: '14px',
        color: '#ff7aa3',
        resolution: 2,
      })
      .setOrigin(0, 0)
    this.add
      .text(panelLeftX + 24, cardCenterY - cardH / 2 + 86, '공개 시 다른 친구들도 볼 수 있어요', {
        fontFamily: FONT,
        fontSize: '12px',
        color: '#cdb9a5',
        resolution: 2,
      })
      .setOrigin(0, 0)

    // 토글 (둥근 pill)
    this.toggleCenterX = panelLeftX + RIGHT_PANEL_W - 60
    this.toggleCenterY = cardCenterY - cardH / 2 + 62
    this.publicToggleBgGraphics = this.add.graphics()
    this.publicToggleHitArea = this.add
      .rectangle(this.toggleCenterX, this.toggleCenterY, this.toggleW, this.toggleH, 0x000000, 0)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
    const knobOffset = (this.toggleW - this.toggleH) / 2
    this.publicToggleKnob = this.add.circle(
      this.toggleCenterX + (this.isPublic ? knobOffset : -knobOffset),
      this.toggleCenterY,
      this.toggleH / 2 - 3,
      0xffffff,
      1,
    )
    this.drawToggleBg()
    this.publicToggleHitArea.on('pointerdown', () => this.togglePublic())

    // 하단 버튼: 이전 / 확인 (라운드 pill)
    const buttonY = vh - BUTTON_BOTTOM_OFFSET
    createRoundedButton(this, {
      x: 150,
      y: buttonY,
      w: 220,
      h: 52,
      fill: 0xffffff,
      fillHover: 0xffe9f1,
      stroke: { color: 0xffc1d8, width: 2 },
      label: '← 필터 다시 고르기',
      labelColor: '#ff7aa3',
      labelSize: 15,
      onClick: () => this.backToFilter(),
    })

    createRoundedButton(this, {
      x: vw - 140,
      y: buttonY,
      w: 220,
      h: 60,
      fill: 0xff8ba0,
      fillHover: 0xffa3b6,
      label: '확인',
      labelColor: '#ffffff',
      labelSize: 22,
      onClick: () => this.confirm(),
    })

    this.input.keyboard?.on('keydown-ESC', () => this.exitToVillage())
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanupTextures())

    document.fonts
      .load("32px 'Jua'", '5 저장하기 다운로드 공개 비공개 필터 다시 고르기 확인 나만 모두 보기')
      .then(() => {
        if (!this.scene.isActive()) return
        this.children.list.forEach(obj => {
          if (obj instanceof Phaser.GameObjects.Text) {
            const t = obj.text
            obj.setText(' ').setText(t)
          }
        })
      })
      .catch(() => undefined)

    this.cameras.main.fadeIn(250, 0, 0, 0)
  }

  private togglePublic() {
    this.isPublic = !this.isPublic
    this.drawToggleBg()
    const knobOffset = (this.toggleW - this.toggleH) / 2
    this.tweens.add({
      targets: this.publicToggleKnob,
      x: this.toggleCenterX + (this.isPublic ? knobOffset : -knobOffset),
      duration: 150,
      ease: 'Sine.easeOut',
    })
    if (this.isPublic) {
      this.publicLabel.setText('공개 (모두 보기)').setColor('#ff7aa3')
    } else {
      this.publicLabel.setText('비공개 (나만 보기)').setColor('#b39e8d')
    }
  }

  private drawToggleBg() {
    const r = this.toggleH / 2
    const left = this.toggleCenterX - this.toggleW / 2
    const top = this.toggleCenterY - this.toggleH / 2
    this.publicToggleBgGraphics.clear()
    this.publicToggleBgGraphics.fillStyle(this.isPublic ? 0xff8ba0 : 0xe5d8cc, 1)
    this.publicToggleBgGraphics.fillRoundedRect(left, top, this.toggleW, this.toggleH, r)
  }

  private async loadSlot(display: SlotDisplay, dataUrl: string) {
    const img = await this.loadHtmlImage(dataUrl)
    if (!this.scene.isActive()) return
    const key = `photo-booth-save-${display.index}-${Date.now()}`
    this.textures.addImage(key, img)
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

  /**
   * 프레임 native 해상도로 사진 4컷 + 프레임 PNG 합성. 다운로드와 업로드에서 공유.
   * 반환 캔버스의 toBlob/toDataURL 결과는 무손실 PNG.
   */
  private async buildCompositeCanvas(): Promise<HTMLCanvasElement | null> {
    const source = this.textures.get(this.frame.overlayKey).getSourceImage() as HTMLImageElement
    const c = document.createElement('canvas')
    c.width = source.width
    c.height = source.height
    const ctx = c.getContext('2d')
    if (!ctx) return null
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'

    for (let i = 0; i < this.frame.slots.length; i += 1) {
      const slot = this.frame.slots[i]
      const url = this.captures[i]
      if (!url) continue
      try {
        const img = await this.loadHtmlImage(url)
        const dx = slot.xRatio * c.width
        const dy = slot.yRatio * c.height
        const dw = slot.wRatio * c.width
        const dh = slot.hRatio * c.height
        const scale = Math.max(dw / img.width, dh / img.height)
        const drawW = img.width * scale
        const drawH = img.height * scale
        const drawX = dx + dw / 2 - drawW / 2
        const drawY = dy + dh / 2 - drawH / 2
        ctx.save()
        ctx.beginPath()
        ctx.rect(dx, dy, dw, dh)
        ctx.clip()
        ctx.drawImage(img, drawX, drawY, drawW, drawH)
        ctx.restore()
      } catch (err) {
        console.warn(`합성 이미지 로드 실패 (slot ${i})`, err)
      }
    }
    ctx.drawImage(source, 0, 0)
    return c
  }

  private canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
    return new Promise(resolve => {
      canvas.toBlob(blob => resolve(blob), 'image/png')
    })
  }

  private canvasToThumbnailBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
    const maxSide = 420
    const scale = Math.min(1, maxSide / Math.max(canvas.width, canvas.height))
    const thumbnailCanvas = document.createElement('canvas')
    thumbnailCanvas.width = Math.max(1, Math.round(canvas.width * scale))
    thumbnailCanvas.height = Math.max(1, Math.round(canvas.height * scale))

    const ctx = thumbnailCanvas.getContext('2d')
    if (!ctx) return Promise.resolve(null)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, thumbnailCanvas.width, thumbnailCanvas.height)
    ctx.drawImage(canvas, 0, 0, thumbnailCanvas.width, thumbnailCanvas.height)

    return new Promise(resolve => {
      thumbnailCanvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.82)
    })
  }

  private async downloadComposite() {
    const c = await this.buildCompositeCanvas()
    if (!c) return
    const blob = await this.canvasToBlob(c)
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `인생네컷-${this.frame.id}-${Date.now()}.png`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  private cleanupTextures() {
    this.slotDisplays.forEach(display => {
      if (display.textureKey && this.textures.exists(display.textureKey)) {
        this.textures.remove(display.textureKey)
      }
    })
  }

  private backToFilter() {
    if (this.isTransitioning) return
    this.isTransitioning = true
    fadeToScene(this, 'PhotoBoothResultScene', {
      duration: 250,
      data: {
        frameId: this.frame.id,
        captures: this.captures,
        allCaptures: this.allCaptures,
      },
    })
  }

  private async confirm() {
    if (this.isTransitioning) return
    this.isTransitioning = true

    try {
      const canvas = await this.buildCompositeCanvas()
      const blob = canvas ? await this.canvasToBlob(canvas) : null
      if (blob) {
        const thumbnail = canvas ? await this.canvasToThumbnailBlob(canvas) : null
        const timestamp = Date.now()
        await createPhotoBooth({
          frameId: this.frame.id,
          isPublic: this.isPublic,
          image: blob,
          filename: `photo-booth-${this.frame.id}-${timestamp}.png`,
          thumbnail,
          thumbnailFilename: `photo-booth-${this.frame.id}-${timestamp}-thumb.jpg`,
        })
        if (this.isPublic) {
          await queryClient.invalidateQueries({ queryKey: [PUBLIC_PHOTO_BOOTHS_QUERY_KEY] })
        }
      } else {
        console.warn('[Save] 합성 캔버스 생성 실패 — 업로드 스킵')
      }
    } catch (err) {
      // 업로드 실패해도 마을 복귀는 진행 (UX). 추후 토스트 등으로 안내 가능.
      console.error('[Save] 사진 업로드 실패', err)
    }

    fadeToScene(this, 'VillageScene', {
      duration: 250,
      data: { spawn: PHOTO_BOOTH_RETURN_SPAWN, portalCooldownMs: 250 },
    })
  }

  private exitToVillage() {
    if (this.isTransitioning) return
    this.isTransitioning = true
    exitPhotoBoothToVillage(this)
  }
}
