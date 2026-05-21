import Phaser from 'phaser'
import { playSceneBgm } from '@/game/systems/sceneBgm'
import { assetPath } from '@/game/assets/assetPath'
import { fadeToScene } from '@/game/systems/sceneTransition'
import { PHOTO_BOOTH_FRAMES, type PhotoFrame } from './frames'
import { exitPhotoBoothToVillage } from './navigation'

const FONT = "'Jua', 'Apple SD Gothic Neo', sans-serif"
const TOTAL_CAPTURES = 8
const COUNTDOWN_SECONDS = 5
const COUNTDOWN_INTERVAL_MS = 1000
const POST_CAPTURE_DELAY_MS = 700
const PREVIEW_MAX_W = 820
const THUMB_W = 96
const THUMB_H = 72
const THUMB_GAP = 8
const THUMB_COLS = 2
const THUMB_ROWS = 4
const PANEL_GAP = 50
const THUMB_PANEL_W = THUMB_COLS * THUMB_W + (THUMB_COLS - 1) * THUMB_GAP
const THUMB_PANEL_H = THUMB_ROWS * THUMB_H + (THUMB_ROWS - 1) * THUMB_GAP

type ThumbnailSlot = {
  x: number
  y: number
  bg: Phaser.GameObjects.Rectangle
  numberText: Phaser.GameObjects.Text
  image: Phaser.GameObjects.Image | null
  mask: Phaser.GameObjects.Graphics | null
  textureKey: string | null
}

type PhotoBoothCameraSceneData = {
  frameId?: string
}

export class PhotoBoothCameraScene extends Phaser.Scene {
  private isTransitioning = false
  private frame!: PhotoFrame
  private mediaStream?: MediaStream
  private video?: Phaser.GameObjects.Video
  private currentCut = 0
  private captures: string[] = []
  private cutCounterText!: Phaser.GameObjects.Text
  private countdownText!: Phaser.GameObjects.Text
  private flashOverlay!: Phaser.GameObjects.Rectangle
  private captureButtonBg!: Phaser.GameObjects.Arc
  private captureButtonInner!: Phaser.GameObjects.Arc
  private captureButtonLabel!: Phaser.GameObjects.Text
  private backButtonGroup: Phaser.GameObjects.GameObject[] = []
  private thumbnailSlots: ThumbnailSlot[] = []
  private previewOverlay?: Phaser.GameObjects.Image
  private previewOverlayMask?: Phaser.GameObjects.Graphics
  private isCountingDown = false
  private previewX = 0
  private previewY = 0
  private previewW = 480
  private previewH = 360
  private slotAspect = 1.2

  constructor() {
    super({ key: 'PhotoBoothCameraScene' })
  }

  preload() {
    PHOTO_BOOTH_FRAMES.forEach(frame => {
      if (!this.textures.exists(frame.overlayKey)) {
        this.load.image(frame.overlayKey, assetPath(frame.overlayPath))
      }
    })
  }

  create(data: PhotoBoothCameraSceneData = {}) {
    playSceneBgm(this)
    const { width: vw, height: vh } = this.scale
    this.isTransitioning = false
    this.currentCut = 0
    this.captures = []
    this.thumbnailSlots = []
    this.isCountingDown = false

    const frameId = data.frameId
    this.frame = PHOTO_BOOTH_FRAMES.find(f => f.id === frameId) ?? PHOTO_BOOTH_FRAMES[0]

    // 슬롯 가로:세로 비율 = (슬롯wRatio / 슬롯hRatio) * 프레임 aspect
    const firstSlot = this.frame.slots[0]
    this.slotAspect = (firstSlot.wRatio / firstSlot.hRatio) * this.frame.aspect

    // 뷰포트에 맞춰 프리뷰 크기 자동 조정 (vw, vh 제약 모두 고려)
    const horizMargin = 80
    const maxPreviewW = vw - horizMargin * 2 - PANEL_GAP - THUMB_PANEL_W
    const titleSpace = 140
    const bottomSpace = 60
    const maxPreviewH = vh - titleSpace - bottomSpace
    this.previewW = Math.min(PREVIEW_MAX_W, maxPreviewW)
    this.previewH = this.previewW / this.slotAspect
    if (this.previewH > maxPreviewH) {
      this.previewH = maxPreviewH
      this.previewW = this.previewH * this.slotAspect
    }

    this.add.rectangle(0, 0, vw, vh, 0xfff8f3).setOrigin(0)

    const groupW = this.previewW + PANEL_GAP + THUMB_PANEL_W
    const groupLeft = Math.max(40, (vw - groupW) / 2)
    const previewX = groupLeft + this.previewW / 2
    const previewY = Math.max(titleSpace + this.previewH / 2, vh / 2 + 10)
    this.previewX = previewX
    this.previewY = previewY
    const panelLeft = groupLeft + this.previewW + PANEL_GAP
    const panelTopY = previewY - this.previewH / 2

    // 헤더: 좌측 타이틀, 우측 카운터 — 같은 y선상으로 정렬
    const headerY = previewY - this.previewH / 2 - 70
    this.add
      .text(groupLeft, headerY, '2  촬영', {
        fontFamily: FONT,
        fontSize: '32px',
        color: '#ff7aa3',
        resolution: 2,
      })
      .setOrigin(0, 0)
    this.add
      .text(groupLeft, headerY + 42, '8장 촬영 후 4장을 골라요', {
        fontFamily: FONT,
        fontSize: '14px',
        color: '#b39e8d',
        resolution: 2,
      })
      .setOrigin(0, 0)

    this.add
      .text(panelLeft + THUMB_PANEL_W, headerY, '남은 컷', {
        fontFamily: FONT,
        fontSize: '13px',
        color: '#b39e8d',
        resolution: 2,
      })
      .setOrigin(1, 0)
    this.cutCounterText = this.add
      .text(panelLeft + THUMB_PANEL_W, headerY + 22, `0 / ${TOTAL_CAPTURES}`, {
        fontFamily: FONT,
        fontSize: '24px',
        color: '#ff7aa3',
        resolution: 2,
      })
      .setOrigin(1, 0)

    this.add.rectangle(previewX, previewY, this.previewW, this.previewH, 0xffffff, 1).setOrigin(0.5)
    this.add
      .rectangle(previewX, previewY, this.previewW, this.previewH, 0xffffff, 0)
      .setOrigin(0.5)
      .setStrokeStyle(3, 0xffc1d8, 1)
      .setDepth(5)

    this.updatePreviewOverlay()

    this.flashOverlay = this.add
      .rectangle(previewX, previewY, this.previewW, this.previewH, 0xffffff, 0)
      .setOrigin(0.5)
      .setDepth(9)

    this.countdownText = this.add
      .text(previewX, previewY, '', {
        fontFamily: FONT,
        fontSize: '200px',
        color: '#ffffff',
        stroke: '#ff7aa3',
        strokeThickness: 12,
        resolution: 2,
      })
      .setOrigin(0.5)
      .setDepth(10)
      .setAlpha(0)

    for (let i = 0; i < TOTAL_CAPTURES; i += 1) {
      const col = i % THUMB_COLS
      const row = Math.floor(i / THUMB_COLS)
      const x = panelLeft + col * (THUMB_W + THUMB_GAP) + THUMB_W / 2
      const y = panelTopY + row * (THUMB_H + THUMB_GAP) + THUMB_H / 2
      const bg = this.add
        .rectangle(x, y, THUMB_W, THUMB_H, 0xffffff, 1)
        .setOrigin(0.5)
        .setStrokeStyle(2, 0xffe0ec, 1)
      const numberText = this.add
        .text(x, y, String(i + 1), {
          fontFamily: FONT,
          fontSize: '24px',
          color: '#d6c8b8',
          resolution: 2,
        })
        .setOrigin(0.5)
      this.thumbnailSlots.push({ x, y, bg, numberText, image: null, mask: null, textureKey: null })
    }

    // 촬영 버튼 (셔터 스타일): 핑크 링 + 흰 내부, 라벨은 아래
    const captureButtonX = panelLeft + THUMB_PANEL_W / 2
    const captureButtonY = panelTopY + THUMB_PANEL_H + 110
    this.captureButtonBg = this.add
      .circle(captureButtonX, captureButtonY, 38, 0xff7aa3, 1)
      .setStrokeStyle(4, 0xffffff, 1)
      .setInteractive({ useHandCursor: true })
    this.captureButtonInner = this.add.circle(captureButtonX, captureButtonY, 22, 0xffffff, 1)
    this.captureButtonLabel = this.add
      .text(captureButtonX, captureButtonY + 56, '촬영', {
        fontFamily: FONT,
        fontSize: '16px',
        color: '#ff7aa3',
        resolution: 2,
      })
      .setOrigin(0.5)
    this.captureButtonBg.on('pointerdown', () => void this.startCaptureSession())
    this.captureButtonBg.on('pointerover', () => {
      if (!this.isCountingDown) this.captureButtonBg.setFillStyle(0xff9bb8)
    })
    this.captureButtonBg.on('pointerout', () => {
      if (!this.isCountingDown) this.captureButtonBg.setFillStyle(0xff7aa3)
    })

    // 프레임 선택 버튼 제거됨 — ESC 키로만 이동 가능
    this.backButtonGroup = []

    this.input.keyboard?.on('keydown-ESC', () => this.exitToVillage())
    this.input.keyboard?.on('keydown-SPACE', () => void this.startCaptureSession())

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup())

    this.cameras.main.fadeIn(250, 0, 0, 0)

    void this.startWebcam(previewX, previewY)

    // Jua 폰트가 Google Fonts 에서 Unicode 서브셋별로 lazy 로드되기 때문에
    // 한글 일부 글자가 서브셋 미로딩으로 폴백 폰트로 그려지는 문제 우회.
    // 필요한 한글을 명시적으로 load 한 뒤 모든 Text 를 re-render.
    document.fonts
      .load(
        "32px 'Jua'",
        '촬영하기 8장 후 4장을 골라요 남은 컷 다시 찍기 마을로 프레임 선택 사진 필터 다음 확인',
      )
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
  }

  private async startWebcam(px: number, py: number) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { min: 1280, ideal: 1920 },
          height: { min: 720, ideal: 1440 },
          facingMode: 'user',
          frameRate: { ideal: 30 },
        },
        audio: false,
      })
      const track = stream.getVideoTracks()[0]
      if (track && import.meta.env.DEV) {
        console.log('[Webcam] track settings', track.getSettings())
      }

      if (!this.scene.isActive()) {
        stream.getTracks().forEach(track => track.stop())
        return
      }

      this.mediaStream = stream

      const phaserVideo = this.add.video(px, py)
      phaserVideo.loadMediaStream(stream)
      phaserVideo.setOrigin(0.5)
      phaserVideo.setFlipX(true)
      phaserVideo.setDepth(0)
      phaserVideo.play(true)
      // 프리뷰 영역 밖으로 안 새어나가도록 mask 로 클립 (메타데이터 로드 전에도 안전)
      const clipMask = this.make
        .graphics({ x: 0, y: 0 }, false)
        .fillRect(px - this.previewW / 2, py - this.previewH / 2, this.previewW, this.previewH)
      phaserVideo.setMask(clipMask.createGeometryMask())
      this.video = phaserVideo

      const tryApplySize = (attempts = 0) => {
        if (!this.scene.isActive() || !this.video) return
        const v = this.video.video as HTMLVideoElement | null
        if (v && v.videoWidth > 0 && v.readyState >= 2) {
          this.applyVideoPreviewCover(v.videoWidth, v.videoHeight)
          return
        }
        if (attempts < 50) {
          this.time.delayedCall(100, () => tryApplySize(attempts + 1))
        }
      }
      tryApplySize()
    } catch (err) {
      console.warn('카메라 권한 거부됨', err)
      this.showPermissionError()
    }
  }

  private applyVideoPreviewCover(videoWidth: number, videoHeight: number) {
    if (!this.video || videoWidth <= 0 || videoHeight <= 0) return

    const sourceAspect = videoWidth / videoHeight
    const previewAspect = this.previewW / this.previewH
    const displayW = sourceAspect > previewAspect ? this.previewH * sourceAspect : this.previewW
    const displayH = sourceAspect > previewAspect ? this.previewH : this.previewW / sourceAspect

    this.video.setDisplaySize(displayW, displayH)
  }

  private showPermissionError() {
    const { width: vw, height: vh } = this.scale
    this.add
      .text(
        vw / 2,
        vh / 2 - 40,
        '카메라 권한이 필요해요.\n브라우저 주소창 옆에서 허용한 뒤 다시 들어와주세요.',
        {
          fontFamily: FONT,
          fontSize: '20px',
          color: '#d45a7a',
          align: 'center',
          resolution: 2,
        },
      )
      .setOrigin(0.5)
    this.captureButtonBg.disableInteractive().setFillStyle(0xe5d8cc)
  }

  private async startCaptureSession() {
    if (this.isCountingDown || !this.video) return
    if (this.currentCut >= TOTAL_CAPTURES) {
      this.captures = []
      this.currentCut = 0
      this.clearThumbnails()
      this.updateCutCounter()
      this.updatePreviewOverlay()
    }

    this.isCountingDown = true
    this.captureButtonBg.disableInteractive().setVisible(false)
    this.captureButtonInner.setVisible(false)
    this.captureButtonLabel.setVisible(false)
    this.backButtonGroup.forEach(obj => {
      const visible = obj as Phaser.GameObjects.GameObject & { setVisible: (v: boolean) => unknown }
      visible.setVisible(false)
    })

    while (this.currentCut < TOTAL_CAPTURES && this.scene.isActive()) {
      for (let n = COUNTDOWN_SECONDS; n >= 1; n -= 1) {
        if (!this.scene.isActive()) return
        this.countdownText.setText(String(n)).setAlpha(1)
        await this.wait(COUNTDOWN_INTERVAL_MS)
      }
      this.countdownText.setAlpha(0)

      const dataUrl = this.captureCurrentFrame()
      this.captures.push(dataUrl)
      const slotIndex = this.currentCut
      this.currentCut += 1
      this.flashCapture()
      this.fillThumbnail(slotIndex, dataUrl)
      this.updateCutCounter()
      this.updatePreviewOverlay()

      if (this.currentCut < TOTAL_CAPTURES) {
        await this.wait(POST_CAPTURE_DELAY_MS)
      }
    }

    this.isCountingDown = false

    if (this.currentCut >= TOTAL_CAPTURES) {
      this.goToPick()
    }
  }

  private flashCapture() {
    this.flashOverlay.setAlpha(0.85)
    this.tweens.add({
      targets: this.flashOverlay,
      alpha: 0,
      duration: 280,
      ease: 'Sine.easeOut',
    })
  }

  private updateCutCounter() {
    this.cutCounterText.setText(`${this.currentCut} / ${TOTAL_CAPTURES}`)
  }

  private updatePreviewOverlay() {
    const slot = this.frame.slots[this.currentCut % this.frame.cutCount]
    if (!slot || !this.textures.exists(this.frame.overlayKey)) {
      this.previewOverlay?.setVisible(false)
      return
    }

    if (!this.previewOverlay) {
      this.previewOverlay = this.add.image(0, 0, this.frame.overlayKey).setOrigin(0.5).setDepth(4)
      this.previewOverlayMask = this.make.graphics({ x: 0, y: 0 }, false)
      this.previewOverlayMask.fillRect(
        this.previewX - this.previewW / 2,
        this.previewY - this.previewH / 2,
        this.previewW,
        this.previewH,
      )
      this.previewOverlay.setMask(this.previewOverlayMask.createGeometryMask())
    }

    const frameDisplayW = this.previewW / slot.wRatio
    const frameDisplayH = this.previewH / slot.hRatio
    const frameLeft = this.previewX - slot.xRatio * frameDisplayW - this.previewW / 2
    const frameTop = this.previewY - slot.yRatio * frameDisplayH - this.previewH / 2

    this.previewOverlay
      .setPosition(frameLeft + frameDisplayW / 2, frameTop + frameDisplayH / 2)
      .setDisplaySize(frameDisplayW, frameDisplayH)
      .setVisible(true)
  }

  private captureCurrentFrame(): string {
    if (!this.video) return ''
    const source = this.video.video as HTMLVideoElement | null
    if (!source) return ''
    const sourceW = source.videoWidth || 1280
    const sourceH = source.videoHeight || 960
    const sourceAspect = sourceW / sourceH

    // 슬롯 비율(this.slotAspect)에 맞춰 중앙 크롭
    let cropW: number
    let cropH: number
    if (sourceAspect > this.slotAspect) {
      cropH = sourceH
      cropW = sourceH * this.slotAspect
    } else {
      cropW = sourceW
      cropH = sourceW / this.slotAspect
    }
    const cropX = (sourceW - cropW) / 2
    const cropY = (sourceH - cropH) / 2

    const c = document.createElement('canvas')
    c.width = Math.round(cropW)
    c.height = Math.round(cropH)
    const ctx = c.getContext('2d')
    if (!ctx) return ''
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.translate(c.width, 0)
    ctx.scale(-1, 1)
    ctx.drawImage(source, cropX, cropY, cropW, cropH, 0, 0, c.width, c.height)
    if (import.meta.env.DEV) {
      console.log(
        `[Capture] source=${sourceW}x${sourceH} crop=${Math.round(cropW)}x${Math.round(cropH)}`,
      )
    }
    return c.toDataURL('image/png')
  }

  private fillThumbnail(index: number, dataUrl: string) {
    const slot = this.thumbnailSlots[index]
    if (!slot) return

    const img = new Image()
    img.onload = () => {
      if (!this.scene.isActive()) return
      const key = `photo-booth-thumb-${index}-${Date.now()}`
      this.textures.addImage(key, img)
      const image = this.add.image(slot.x, slot.y, key).setOrigin(0.5)
      const scale = Math.max(THUMB_W / image.width, THUMB_H / image.height)
      image.setScale(scale)
      const mask = this.make
        .graphics({ x: 0, y: 0 }, false)
        .fillRect(slot.x - THUMB_W / 2, slot.y - THUMB_H / 2, THUMB_W, THUMB_H)
      image.setMask(mask.createGeometryMask())
      slot.numberText.setVisible(false)
      slot.image = image
      slot.mask = mask
      slot.textureKey = key
    }
    img.src = dataUrl
  }

  private clearThumbnails() {
    this.thumbnailSlots.forEach((slot, i) => {
      slot.image?.destroy()
      slot.mask?.destroy()
      if (slot.textureKey && this.textures.exists(slot.textureKey)) {
        this.textures.remove(slot.textureKey)
      }
      slot.image = null
      slot.mask = null
      slot.textureKey = null
      slot.numberText.setVisible(true).setText(String(i + 1))
    })
  }

  private wait(ms: number) {
    return new Promise<void>(resolve => this.time.delayedCall(ms, () => resolve()))
  }

  private goToPick() {
    if (this.isTransitioning) return
    this.isTransitioning = true
    fadeToScene(this, 'PhotoBoothPickScene', {
      duration: 250,
      data: { frameId: this.frame.id, captures: this.captures },
    })
  }

  private exitToVillage() {
    if (this.isTransitioning) return
    this.isTransitioning = true
    exitPhotoBoothToVillage(this)
  }

  private cleanup() {
    this.mediaStream?.getTracks().forEach(track => track.stop())
    this.mediaStream = undefined
    if (this.video) {
      try {
        this.video.stop()
      } catch {
        // already stopped
      }
      this.video.destroy()
      this.video = undefined
    }
    this.previewOverlay?.destroy()
    this.previewOverlay = undefined
    this.previewOverlayMask?.destroy()
    this.previewOverlayMask = undefined
    this.thumbnailSlots.forEach(slot => {
      if (slot.textureKey && this.textures.exists(slot.textureKey)) {
        this.textures.remove(slot.textureKey)
      }
    })
  }
}
