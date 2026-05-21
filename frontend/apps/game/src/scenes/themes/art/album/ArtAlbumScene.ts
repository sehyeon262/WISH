import Phaser from 'phaser'
import { playSceneBgm } from '@/game/systems/sceneBgm'
import {
  deleteArtwork as requestDeleteArtwork,
  getArtwork,
  getMyArtworks,
  type Artwork,
  type ArtworkPage,
} from '@wish/api-client'
import { assetPath } from '@/game/assets/assetPath'
import { createArtConfirmDialog, type ArtConfirmDialog } from '../ui/artConfirmDialog'
import { coloringOptions } from '../coloring/coloringOptions'

const ALBUM_PAGE_SIZE = 4
const ARTWORKS_SORT = 'createdAt,desc'
const ALBUM_DEPTH = 40

type ArtworkSlot = {
  x: number
  y: number
  width: number
  height: number
}

type TextureCrop = {
  x: number
  y: number
  width: number
  height: number
}

type LoadArtworkPageOptions = {
  showLoadingStatus?: boolean
  pageTurnComplete?: Promise<void>
}

const ACTION_BUTTON_CROPS: Record<string, TextureCrop> = {
  'art-ui-edit-action': { x: 346, y: 377, width: 965, height: 305 },
  'art-ui-delete-action': { x: 60, y: 153, width: 1654, height: 541 },
}

export class ArtAlbumScene extends Phaser.Scene {
  private albumLayer: Phaser.GameObjects.Container | null = null
  private contentLayer: Phaser.GameObjects.Container | null = null
  private previousPageZone: Phaser.GameObjects.Zone | null = null
  private nextPageZone: Phaser.GameObjects.Zone | null = null
  private previousPageHint: Phaser.GameObjects.Container | null = null
  private nextPageHint: Phaser.GameObjects.Container | null = null
  private pageText: Phaser.GameObjects.Text | null = null
  private detailLayer: Phaser.GameObjects.Container | null = null
  private deleteConfirmDialog: ArtConfirmDialog | null = null
  private albumPageBounds = new Phaser.Geom.Rectangle()
  private artworkPage: ArtworkPage | null = null
  private currentPage = 0
  private isLoadingPage = false
  private isLoadingArtworkDetail = false
  private isDeletingArtwork = false
  private isPageTurning = false
  private pageTurnTimers: Phaser.Time.TimerEvent[] = []
  private artworkImageObjectUrls: string[] = []

  private readonly handleEscDown = () => {
    if (this.detailLayer) {
      this.closeArtworkDetail()
      return
    }

    this.closeAlbum()
  }

  constructor() {
    super({ key: 'ArtAlbumScene' })
  }

  preload() {
    this.loadImageIfMissing('art-ui-delete-btn', assetPath('images/themes/art/ui/delete_btn.png'))
    this.loadImageIfMissing('art-ui-album-page', assetPath('images/themes/art/ui/album_page.png'))
    this.loadImageIfMissing('art-ui-album-next1', assetPath('images/themes/art/ui/album_next1.png'))
    this.loadImageIfMissing('art-ui-album-next2', assetPath('images/themes/art/ui/album_next2.png'))
    this.loadImageIfMissing('art-ui-edit-action', assetPath('images/themes/art/ui/edit.png'))
    this.loadImageIfMissing('art-ui-delete-action', assetPath('images/themes/art/ui/delete.png'))
  }

  create() {
    playSceneBgm(this)
    this.isPageTurning = false
    this.isLoadingPage = false
    this.currentPage = 0
    this.artworkPage = null
    this.clearPageTurnTimers()

    const { width: vw, height: vh } = this.scale
    const dim = this.add
      .rectangle(vw / 2, vh / 2, vw, vh, 0x000000, 1)
      .setDepth(ALBUM_DEPTH)
      .setScrollFactor(0)
      .setAlpha(0)
      .setInteractive()

    const albumPageSource = this.textures
      .get('art-ui-album-page')
      .getSourceImage() as HTMLImageElement
    const albumPageRatio = albumPageSource.width / albumPageSource.height
    const albumPageHeight = Math.min(vh * 0.96, (vw * 0.94) / albumPageRatio)
    const albumPageWidth = albumPageHeight * albumPageRatio
    const albumPage = this.add
      .image(vw / 2, vh / 2, 'art-ui-album-page')
      .setDepth(ALBUM_DEPTH + 1)
      .setDisplaySize(albumPageWidth, albumPageHeight)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true })
      .setAlpha(0)
    const albumPageScale = { x: albumPage.scaleX, y: albumPage.scaleY }
    albumPage.setScale(albumPageScale.x * 0.98, albumPageScale.y * 0.98)
    this.albumPageBounds.setTo(
      vw / 2 - albumPageWidth / 2,
      vh / 2 - albumPageHeight / 2,
      albumPageWidth,
      albumPageHeight,
    )

    const pageTurnFrame = this.add
      .image(vw / 2, vh / 2, 'art-ui-album-next1')
      .setDepth(ALBUM_DEPTH + 2)
      .setDisplaySize(albumPageWidth, albumPageHeight)
      .setScrollFactor(0)
      .setAlpha(0)
      .setVisible(false)
    const pageTurnMaskShape = this.make.graphics({}, false)
    const pageTurnMaskLeft = vw / 2 - albumPageWidth * 0.32
    const pageTurnMaskTop = vh / 2 - albumPageHeight * 0.48
    const pageTurnMaskWidth = albumPageWidth * 0.64
    pageTurnMaskShape.fillStyle(0xffffff)
    pageTurnMaskShape.fillRect(
      pageTurnMaskLeft,
      pageTurnMaskTop,
      pageTurnMaskWidth,
      albumPageHeight * 0.72,
    )
    pageTurnMaskShape.fillTriangle(
      pageTurnMaskLeft,
      vh / 2 + albumPageHeight * 0.24,
      pageTurnMaskLeft + pageTurnMaskWidth,
      vh / 2 + albumPageHeight * 0.24,
      vw / 2,
      vh / 2 + albumPageHeight * 0.33,
    )
    pageTurnFrame.setMask(pageTurnMaskShape.createGeometryMask())
    pageTurnFrame.on('destroy', () => pageTurnMaskShape.destroy())

    const tabWidth = Math.min(82, Math.max(66, albumPageWidth * 0.052))
    const tabHeight = Math.min(102, Math.max(78, albumPageHeight * 0.118))
    const previousTabX = Math.max(tabWidth * 0.56, this.albumPageBounds.left - tabWidth * 0.58)
    const nextTabX = Math.min(vw - tabWidth * 0.56, this.albumPageBounds.right + tabWidth * 0.58)
    this.previousPageHint = this.createPageTurnTab(
      previousTabX,
      vh / 2,
      tabWidth,
      tabHeight,
      'previous',
    )
    this.nextPageHint = this.createPageTurnTab(nextTabX, vh / 2, tabWidth, tabHeight, 'next')

    const pageTurnZoneWidth = tabWidth * 1.55
    const pageTurnZoneHeight = tabHeight * 1.35
    const previousPageZone = this.add
      .zone(previousTabX, vh / 2, pageTurnZoneWidth, pageTurnZoneHeight)
      .setDepth(ALBUM_DEPTH + 4)
      .setScrollFactor(0)
    const nextPageZone = this.add
      .zone(nextTabX, vh / 2, pageTurnZoneWidth, pageTurnZoneHeight)
      .setDepth(ALBUM_DEPTH + 4)
      .setScrollFactor(0)
    this.previousPageZone = previousPageZone
    this.nextPageZone = nextPageZone

    this.bindPageTurnTabHover(previousPageZone, this.previousPageHint)
    this.bindPageTurnTabHover(nextPageZone, this.nextPageHint)

    this.pageText = this.add
      .text(vw / 2, this.albumPageBounds.bottom - albumPageHeight * 0.105, '', {
        fontFamily: 'sans-serif',
        fontSize: `${Math.max(15, Math.round(albumPageHeight * 0.025))}px`,
        color: '#7a5630',
      })
      .setDepth(ALBUM_DEPTH + 5)
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setAlpha(0)

    previousPageZone.on(
      'pointerdown',
      (
        _pointer: Phaser.Input.Pointer,
        _x: number,
        _y: number,
        event: Phaser.Types.Input.EventData,
      ) => {
        event.stopPropagation()
        void this.requestPageTurn(pageTurnFrame, albumPageWidth, albumPageHeight, 'previous')
      },
    )
    nextPageZone.on(
      'pointerdown',
      (
        _pointer: Phaser.Input.Pointer,
        _x: number,
        _y: number,
        event: Phaser.Types.Input.EventData,
      ) => {
        event.stopPropagation()
        void this.requestPageTurn(pageTurnFrame, albumPageWidth, albumPageHeight, 'next')
      },
    )
    albumPage.on(
      'pointerdown',
      (
        _pointer: Phaser.Input.Pointer,
        _x: number,
        _y: number,
        event: Phaser.Types.Input.EventData,
      ) => event.stopPropagation(),
    )

    const closeButtonSource = this.textures
      .get('art-ui-delete-btn')
      .getSourceImage() as HTMLImageElement
    const closeButtonSize = Math.min(64, Math.max(46, vh * 0.07))
    const closeButton = this.add
      .image(vw - 32 - closeButtonSize / 2, 32 + closeButtonSize / 2, 'art-ui-delete-btn')
      .setDepth(ALBUM_DEPTH + 6)
      .setDisplaySize(
        closeButtonSize,
        closeButtonSize * (closeButtonSource.height / closeButtonSource.width),
      )
      .setScrollFactor(0)
      .setAlpha(0)
      .setInteractive({ useHandCursor: true })
    const closeButtonScale = { x: closeButton.scaleX, y: closeButton.scaleY }
    closeButton.on('pointerover', () => {
      closeButton.setTint(0xfff3c4)
      closeButton.setScale(closeButtonScale.x * 1.06, closeButtonScale.y * 1.06)
    })
    closeButton.on('pointerout', () => {
      closeButton.clearTint()
      closeButton.setScale(closeButtonScale.x, closeButtonScale.y)
    })
    closeButton.on(
      'pointerdown',
      (
        _pointer: Phaser.Input.Pointer,
        _x: number,
        _y: number,
        event: Phaser.Types.Input.EventData,
      ) => {
        event.stopPropagation()
        this.closeAlbum()
      },
    )

    dim.on(
      'pointerdown',
      (
        _pointer: Phaser.Input.Pointer,
        _x: number,
        _y: number,
        event: Phaser.Types.Input.EventData,
      ) => {
        event.stopPropagation()
        this.closeAlbum()
      },
    )

    this.albumLayer = this.add
      .container(0, 0, [
        dim,
        albumPage,
        pageTurnFrame,
        previousPageZone,
        nextPageZone,
        closeButton,
        this.previousPageHint,
        this.nextPageHint,
        this.pageText,
      ])
      .setDepth(ALBUM_DEPTH)
    this.contentLayer = this.add
      .container(0, 0)
      .setDepth(ALBUM_DEPTH + 3)
      .setScrollFactor(0)

    this.input.keyboard?.on('keydown-ESC', this.handleEscDown)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.off('keydown-ESC', this.handleEscDown)
      this.tweens.killTweensOf(this.albumLayer?.list ?? [])
      this.tweens.killTweensOf(this.contentLayer?.list ?? [])
      this.tweens.killTweensOf(this.detailLayer?.list ?? [])
      this.clearPageTurnTimers()
      this.revokeArtworkImageObjectUrls()
      this.hideDeleteArtworkConfirm()
      this.detailLayer?.destroy(true)
      this.albumLayer = null
      this.contentLayer = null
      this.detailLayer = null
      this.previousPageZone = null
      this.nextPageZone = null
      this.previousPageHint = null
      this.nextPageHint = null
      this.pageText = null
    })

    this.tweens.add({
      targets: dim,
      alpha: 0.56,
      duration: 160,
      ease: 'Sine.easeOut',
    })
    this.tweens.add({
      targets: albumPage,
      alpha: 1,
      scaleX: albumPageScale.x,
      scaleY: albumPageScale.y,
      duration: 180,
      ease: 'Sine.easeOut',
    })
    this.tweens.add({
      targets: closeButton,
      alpha: 1,
      duration: 160,
      ease: 'Sine.easeOut',
    })
    this.renderStatus('작품을 불러오는 중...')
    this.updatePageControls()
    void this.loadArtworkPage(0)
  }

  private loadImageIfMissing(key: string, url: string) {
    if (!this.textures.exists(key)) {
      this.load.image(key, url)
    }
  }

  private createPageTurnTab(
    x: number,
    y: number,
    width: number,
    height: number,
    direction: 'next' | 'previous',
  ) {
    const tab = this.add
      .container(x, y)
      .setDepth(ALBUM_DEPTH + 5)
      .setScrollFactor(0)
      .setAlpha(0)
    const radius = Math.round(width * 0.14)
    const shadow = this.add.graphics()
    const body = this.add.graphics()
    const marker = this.add.graphics()
    const directionSign = direction === 'next' ? 1 : -1

    shadow.fillStyle(0x1b1209, 0.32)
    shadow.fillRoundedRect(-width / 2 + 3, -height / 2 + 4, width, height, radius)

    body.fillStyle(0x164f35, 0.96)
    body.fillRoundedRect(-width / 2, -height / 2, width, height, radius)
    body.lineStyle(Math.max(2, Math.round(width * 0.04)), 0xd8b26d, 0.9)
    body.strokeRoundedRect(-width / 2 + 1, -height / 2 + 1, width - 2, height - 2, radius)
    body.lineStyle(1, 0x67b883, 0.55)
    body.strokeRoundedRect(
      -width / 2 + width * 0.16,
      -height / 2 + height * 0.14,
      width * 0.68,
      height * 0.72,
      Math.max(3, Math.round(radius * 0.45)),
    )

    const tipX = directionSign * width * 0.2
    const tailX = -directionSign * width * 0.13
    const topY = -height * 0.23
    const bottomY = height * 0.23

    marker.lineStyle(Math.max(6, Math.round(width * 0.085)), 0x6f4928, 0.32)
    marker.lineBetween(tailX, topY, tipX, 0)
    marker.lineBetween(tipX, 0, tailX, bottomY)
    marker.lineStyle(Math.max(4, Math.round(width * 0.062)), 0xf4dca0, 0.96)
    marker.lineBetween(tailX, topY, tipX, 0)
    marker.lineBetween(tipX, 0, tailX, bottomY)
    marker.lineStyle(Math.max(2, Math.round(width * 0.026)), 0xffefbd, 0.55)
    marker.lineBetween(tailX * 0.76, topY * 0.68, tipX * 0.74, 0)
    marker.lineBetween(tipX * 0.74, 0, tailX * 0.76, bottomY * 0.68)

    tab.add([shadow, body, marker])
    return tab
  }

  private bindPageTurnTabHover(zone: Phaser.GameObjects.Zone, tab: Phaser.GameObjects.Container) {
    zone.on('pointerover', () => {
      if (!zone.input?.enabled) {
        return
      }

      tab.setScale(1.05)
      tab.setAlpha(Math.max(tab.alpha, 0.92))
    })
    zone.on('pointerout', () => {
      tab.setScale(1)
    })
  }

  private async requestPageTurn(
    pageTurnFrame: Phaser.GameObjects.Image,
    albumPageWidth: number,
    albumPageHeight: number,
    direction: 'next' | 'previous',
  ) {
    if (this.isLoadingPage || this.isPageTurning) {
      return
    }

    const targetPage = direction === 'next' ? this.currentPage + 1 : this.currentPage - 1
    if (targetPage < 0) {
      return
    }

    if (direction === 'next' && this.artworkPage?.last) {
      return
    }

    if (direction === 'previous' && this.artworkPage?.first) {
      return
    }

    const pageTurnComplete = this.turnPage(
      pageTurnFrame,
      albumPageWidth,
      albumPageHeight,
      direction,
    )
    await this.loadArtworkPage(targetPage, {
      showLoadingStatus: false,
      pageTurnComplete,
    })
  }

  private turnPage(
    pageTurnFrame: Phaser.GameObjects.Image,
    albumPageWidth: number,
    albumPageHeight: number,
    direction: 'next' | 'previous',
  ): Promise<void> {
    if (this.isPageTurning) {
      return Promise.resolve()
    }

    this.isPageTurning = true
    this.clearPageTurnTimers()
    this.isPageTurning = true
    this.hideArtworkContent()

    const frameKeys =
      direction === 'next'
        ? ['art-ui-album-next1', 'art-ui-album-next2']
        : ['art-ui-album-next2', 'art-ui-album-next1']

    return new Promise(resolve => {
      frameKeys.forEach((frameKey, index) => {
        const timer = this.time.delayedCall(115 * index, () => {
          if (!this.albumLayer || !pageTurnFrame.active) {
            return
          }

          pageTurnFrame
            .setTexture(frameKey)
            .setDisplaySize(albumPageWidth, albumPageHeight)
            .setAlpha(1)
            .setVisible(true)

          if (index === frameKeys.length - 1) {
            const hideTimer = this.time.delayedCall(115, () => {
              if (pageTurnFrame.active) {
                pageTurnFrame.setAlpha(0).setVisible(false)
              }
              this.clearPageTurnTimers()
              resolve()
            })
            this.pageTurnTimers.push(hideTimer)
          }
        })
        this.pageTurnTimers.push(timer)
      })
    })
  }

  private closeAlbum() {
    this.scene.stop('ArtAlbumScene')
  }

  private clearPageTurnTimers() {
    this.pageTurnTimers.forEach(timer => timer.remove(false))
    this.pageTurnTimers = []
    this.isPageTurning = false
  }

  private hideArtworkContent() {
    if (!this.contentLayer) {
      return
    }

    this.tweens.killTweensOf(this.contentLayer)
    this.contentLayer.removeAll(true)
    this.contentLayer.setAlpha(0)
  }

  private async loadArtworkPage(page: number, options: LoadArtworkPageOptions = {}) {
    if (this.isLoadingPage) {
      return
    }

    this.isLoadingPage = true
    this.currentPage = Math.max(0, page)
    if (options.showLoadingStatus === false) {
      this.hideArtworkContent()
    } else {
      this.renderStatus('작품을 불러오는 중...')
    }
    this.updatePageControls()

    try {
      const response = await getMyArtworks({
        page: this.currentPage,
        size: ALBUM_PAGE_SIZE,
        sort: ARTWORKS_SORT,
      })

      if (!this.scene.isActive('ArtAlbumScene')) {
        return
      }

      this.artworkPage = response.data
      this.currentPage = response.data.number
      await this.loadArtworkImages(response.data.content)

      if (!this.scene.isActive('ArtAlbumScene')) {
        return
      }

      if (options.pageTurnComplete) {
        await options.pageTurnComplete
      }

      this.renderArtworkPage(response.data.content)
    } catch (error) {
      console.error('Failed to load my artworks.', error)
      this.artworkPage = null
      if (options.pageTurnComplete) {
        await options.pageTurnComplete
      }
      this.renderStatus('작품을 불러오지 못했어요.')
    } finally {
      this.isLoadingPage = false
      this.updatePageControls()
    }
  }

  private async loadArtworkImages(artworks: Artwork[]) {
    const missingArtworks = artworks.filter(
      artwork => artwork.imageUrl && !this.textures.exists(this.getArtworkTextureKey(artwork)),
    )

    if (!missingArtworks.length) {
      return
    }

    const imageSources = (
      await Promise.all(
        missingArtworks.map(async artwork => {
          try {
            const imageUrl = await this.createArtworkImageObjectUrl(artwork.imageUrl)
            return { key: this.getArtworkTextureKey(artwork), imageUrl }
          } catch (error) {
            console.error('Failed to load artwork image.', error)
            return null
          }
        }),
      )
    ).filter((source): source is { key: string; imageUrl: string } => source !== null)

    if (!imageSources.length) {
      return
    }

    await new Promise<void>(resolve => {
      this.load.once('complete', () => resolve())
      imageSources.forEach(({ key, imageUrl }) => {
        this.load.image(key, imageUrl)
      })
      this.load.start()
    })
  }

  private renderArtworkPage(artworks: Artwork[]) {
    if (!this.contentLayer) {
      return
    }

    this.contentLayer.removeAll(true)

    if (!artworks.length) {
      this.renderStatus('아직 저장한 작품이 없어요.')
      return
    }

    const slots = this.getArtworkSlots()
    artworks.slice(0, ALBUM_PAGE_SIZE).forEach((artwork, index) => {
      const slot = slots[index]
      if (!slot) {
        return
      }

      this.createArtworkImage(artwork, slot)
    })

    this.contentLayer.setAlpha(0)
    this.tweens.add({
      targets: this.contentLayer,
      alpha: 1,
      duration: 140,
      ease: 'Sine.easeOut',
    })
  }

  private renderStatus(message: string) {
    if (!this.contentLayer) {
      return
    }

    this.contentLayer.removeAll(true)
    const fontSize = Math.max(20, Math.round(this.albumPageBounds.height * 0.034))
    const text = this.add
      .text(this.albumPageBounds.centerX, this.albumPageBounds.centerY, message, {
        fontFamily: 'sans-serif',
        fontSize: `${fontSize}px`,
        color: '#7a5630',
        align: 'center',
        wordWrap: { width: this.albumPageBounds.width * 0.62, useAdvancedWrap: true },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
    this.contentLayer.add(text)
  }

  private createArtworkImage(artwork: Artwork, slot: ArtworkSlot) {
    const layer = this.contentLayer
    if (!layer) {
      return
    }

    const textureKey = this.getArtworkTextureKey(artwork)

    if (!this.textures.exists(textureKey)) {
      return
    }

    const framePadding = Math.max(10, Math.round(Math.min(slot.width, slot.height) * 0.055))
    const imageBox = {
      x: slot.x + framePadding,
      y: slot.y + framePadding,
      width: slot.width - framePadding * 2,
      height: slot.height - framePadding * 2,
    }
    const frame = this.createArtworkImageFrame(
      slot.x + slot.width / 2,
      slot.y + slot.height / 2,
      slot.width,
      slot.height,
      Math.max(3, Math.round(framePadding * 0.32)),
    )
    const image = this.add
      .image(imageBox.x + imageBox.width / 2, imageBox.y + imageBox.height / 2, textureKey)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true })
    const source = image.texture.getSourceImage() as HTMLImageElement
    const scale = Math.min(imageBox.width / source.width, imageBox.height / source.height)
    image.setDisplaySize(source.width * scale, source.height * scale)
    const openArtwork = (
      _pointer: Phaser.Input.Pointer,
      _x: number,
      _y: number,
      event: Phaser.Types.Input.EventData,
    ) => {
      event.stopPropagation()
      void this.openArtworkDetail(artwork.id)
    }
    frame.panel.setInteractive({ useHandCursor: true })
    frame.panel.on('pointerdown', openArtwork)
    image.on('pointerdown', openArtwork)
    const corners = this.createArtworkPhotoCorners(
      slot.x + slot.width / 2,
      slot.y + slot.height / 2,
      slot.width,
      slot.height,
      Math.max(18, Math.round(framePadding * 1.35)),
    )
    layer.add(frame.shadow)
    layer.add(frame.panel)
    layer.add(image)
    layer.add(corners)
  }

  private createArtworkImageFrame(
    x: number,
    y: number,
    width: number,
    height: number,
    strokeWidth: number,
  ) {
    const shadowOffset = Math.max(2, strokeWidth)
    const shadow = this.add
      .rectangle(x + shadowOffset, y + shadowOffset, width, height, 0x5b3518, 0.18)
      .setScrollFactor(0)
    const panel = this.add
      .rectangle(x, y, width, height, 0xffffff, 1)
      .setScrollFactor(0)
      .setStrokeStyle(strokeWidth, 0xb77b35, 0.95)

    return { shadow, panel }
  }

  private createArtworkPhotoCorners(
    x: number,
    y: number,
    width: number,
    height: number,
    cornerSize: number,
  ) {
    const left = x - width / 2
    const right = x + width / 2
    const top = y - height / 2
    const bottom = y + height / 2
    const inset = Math.max(5, Math.round(cornerSize * 0.22))
    const corner = this.add.graphics().setScrollFactor(0)

    corner.fillStyle(0x8a5a2b, 0.22)
    corner.fillTriangle(left, top, left + cornerSize, top, left, top + cornerSize)
    corner.fillTriangle(right, top, right - cornerSize, top, right, top + cornerSize)
    corner.fillTriangle(left, bottom, left + cornerSize, bottom, left, bottom - cornerSize)
    corner.fillTriangle(right, bottom, right - cornerSize, bottom, right, bottom - cornerSize)
    corner.lineStyle(Math.max(2, Math.round(cornerSize * 0.09)), 0xe5c17d, 0.9)
    corner.lineBetween(left + inset, top + inset, left + cornerSize, top + inset)
    corner.lineBetween(left + inset, top + inset, left + inset, top + cornerSize)
    corner.lineBetween(right - inset, top + inset, right - cornerSize, top + inset)
    corner.lineBetween(right - inset, top + inset, right - inset, top + cornerSize)
    corner.lineBetween(left + inset, bottom - inset, left + cornerSize, bottom - inset)
    corner.lineBetween(left + inset, bottom - inset, left + inset, bottom - cornerSize)
    corner.lineBetween(right - inset, bottom - inset, right - cornerSize, bottom - inset)
    corner.lineBetween(right - inset, bottom - inset, right - inset, bottom - cornerSize)

    return corner
  }

  private createArtworkImageBorder(
    image: Phaser.GameObjects.Image,
    padding: number,
    strokeWidth: number,
  ) {
    return this.createArtworkImageFrame(
      image.x,
      image.y,
      image.displayWidth + padding * 2,
      image.displayHeight + padding * 2,
      strokeWidth,
    )
  }

  private async openArtworkDetail(artworkId: number) {
    if (this.isLoadingArtworkDetail) {
      return
    }

    this.isLoadingArtworkDetail = true

    try {
      const response = await getArtwork(artworkId)

      if (!this.scene.isActive('ArtAlbumScene')) {
        return
      }

      await this.loadArtworkImages([response.data])

      if (!this.scene.isActive('ArtAlbumScene')) {
        return
      }

      this.renderArtworkDetail(response.data)
    } catch (error) {
      console.error('Failed to load artwork detail.', error)
    } finally {
      this.isLoadingArtworkDetail = false
    }
  }

  private renderArtworkDetail(artwork: Artwork) {
    const textureKey = this.getArtworkTextureKey(artwork)
    if (!this.textures.exists(textureKey)) {
      return
    }

    this.closeArtworkDetail()

    const { width, height } = this.scale
    const dim = this.add
      .rectangle(width / 2, height / 2, width, height, 0x000000, 0.62)
      .setScrollFactor(0)
      .setAlpha(0)
      .setInteractive()
    const image = this.add
      .image(width / 2, height / 2, textureKey)
      .setScrollFactor(0)
      .setAlpha(0)
      .setInteractive({ useHandCursor: true })
    const source = image.texture.getSourceImage() as HTMLImageElement
    const detailFramePadding = Math.max(8, Math.round(Math.min(width, height) * 0.012))
    const maxWidth = width * 0.7 - detailFramePadding * 2
    const maxHeight = height * 0.62 - detailFramePadding * 2
    const scale = Math.min(maxWidth / source.width, maxHeight / source.height)
    image.setDisplaySize(source.width * scale, source.height * scale)
    const detailFrame = this.createArtworkImageBorder(
      image,
      detailFramePadding,
      Math.max(3, Math.round(detailFramePadding * 0.45)),
    )
    detailFrame.shadow.setAlpha(0)
    detailFrame.panel.setAlpha(0)
    const buttonHeight = Math.min(76, Math.max(56, Math.round(height * 0.065)))
    const buttonGap = Math.max(12, Math.round(buttonHeight * 0.25))
    const editButtonTextureKey = this.getCroppedActionButtonTextureKey('art-ui-edit-action')
    const deleteButtonTextureKey = this.getCroppedActionButtonTextureKey('art-ui-delete-action')
    const actionButtonWidth = Math.max(
      this.getTextureDisplayWidth(editButtonTextureKey, buttonHeight),
      this.getTextureDisplayWidth(deleteButtonTextureKey, buttonHeight),
    )
    const buttonsTotalWidth = actionButtonWidth * 2 + buttonGap
    const buttonsY = Math.min(
      height - buttonHeight / 2 - 28,
      image.y + image.displayHeight / 2 + detailFramePadding + buttonHeight * 0.78,
    )
    const editButton = this.createDetailActionButton(
      width / 2 - buttonsTotalWidth / 2 + actionButtonWidth / 2,
      buttonsY,
      actionButtonWidth,
      buttonHeight,
      editButtonTextureKey,
      () => this.startArtworkEdit(artwork),
    )
    const deleteButton = this.createDetailActionButton(
      width / 2 + buttonsTotalWidth / 2 - actionButtonWidth / 2,
      buttonsY,
      actionButtonWidth,
      buttonHeight,
      deleteButtonTextureKey,
      () => this.showDeleteArtworkConfirm(artwork),
    )

    dim.on(
      'pointerdown',
      (
        _pointer: Phaser.Input.Pointer,
        _x: number,
        _y: number,
        event: Phaser.Types.Input.EventData,
      ) => {
        event.stopPropagation()
        this.closeArtworkDetail()
      },
    )
    image.on(
      'pointerdown',
      (
        _pointer: Phaser.Input.Pointer,
        _x: number,
        _y: number,
        event: Phaser.Types.Input.EventData,
      ) => event.stopPropagation(),
    )

    this.detailLayer = this.add
      .container(0, 0, [
        dim,
        detailFrame.shadow,
        detailFrame.panel,
        image,
        editButton,
        deleteButton,
      ])
      .setDepth(ALBUM_DEPTH + 20)
      .setScrollFactor(0)
    this.tweens.add({
      targets: [dim, detailFrame.shadow, detailFrame.panel, image, editButton, deleteButton],
      alpha: 1,
      duration: 140,
      ease: 'Sine.easeOut',
    })
  }

  private closeArtworkDetail() {
    this.hideDeleteArtworkConfirm()
    this.detailLayer?.destroy(true)
    this.detailLayer = null
  }

  private createDetailActionButton(
    x: number,
    y: number,
    width: number,
    height: number,
    textureKey: string,
    onSelect: () => void,
  ) {
    const button = this.add
      .image(x, y, textureKey)
      .setScrollFactor(0)
      .setDisplaySize(width, height)
      .setAlpha(0)
      .setInteractive({ useHandCursor: true })
    const baseScale = { x: button.scaleX, y: button.scaleY }
    const handlePointerDown = (
      _pointer: Phaser.Input.Pointer,
      _x: number,
      _y: number,
      event: Phaser.Types.Input.EventData,
    ) => {
      event.stopPropagation()
      onSelect()
    }

    button.on('pointerover', () => {
      button.setTint(0xfff1c2)
      button.setScale(baseScale.x * 1.04, baseScale.y * 1.04)
    })
    button.on('pointerout', () => {
      button.clearTint()
      button.setScale(baseScale.x, baseScale.y)
    })
    button.on('pointerdown', handlePointerDown)
    return button
  }

  private getCroppedActionButtonTextureKey(textureKey: string) {
    const crop = ACTION_BUTTON_CROPS[textureKey]
    if (!crop) {
      return textureKey
    }

    const croppedTextureKey = `${textureKey}-visible`
    if (this.textures.exists(croppedTextureKey)) {
      return croppedTextureKey
    }

    const source = this.textures.get(textureKey).getSourceImage() as CanvasImageSource
    const texture = this.textures.createCanvas(croppedTextureKey, crop.width, crop.height)
    if (!texture) {
      return textureKey
    }

    const context = texture.getContext()
    context.clearRect(0, 0, crop.width, crop.height)
    context.drawImage(
      source,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      0,
      0,
      crop.width,
      crop.height,
    )
    texture.refresh()

    return croppedTextureKey
  }

  private getTextureDisplayWidth(textureKey: string, height: number) {
    const source = this.textures.get(textureKey).getSourceImage() as
      | HTMLImageElement
      | HTMLCanvasElement
    return Math.round(height * (source.width / source.height))
  }

  private showDeleteArtworkConfirm(artwork: Artwork) {
    if (this.deleteConfirmDialog || this.isDeletingArtwork) {
      return
    }

    this.deleteConfirmDialog = createArtConfirmDialog(this, {
      depth: ALBUM_DEPTH + 40,
      title: '작품을 삭제할까요?',
      message: '삭제하면 다시 되돌릴 수 없어요.',
      secondaryButton: {
        label: '취소',
        fillColor: 0xfff6e8,
        strokeColor: 0xb78b61,
        textColor: '#5f3b22',
        onSelect: () => this.hideDeleteArtworkConfirm(),
      },
      primaryButton: {
        label: '삭제하기',
        fillColor: 0xd94b3d,
        strokeColor: 0x9f2f26,
        textColor: '#ffffff',
        onSelect: () => {
          this.hideDeleteArtworkConfirm()
          void this.deleteArtwork(artwork.id)
        },
      },
    })
  }

  private hideDeleteArtworkConfirm() {
    this.deleteConfirmDialog?.destroy()
    this.deleteConfirmDialog = null
  }

  private async deleteArtwork(artworkId: number) {
    if (this.isDeletingArtwork) {
      return
    }

    this.isDeletingArtwork = true

    try {
      await requestDeleteArtwork(artworkId)

      if (!this.scene.isActive('ArtAlbumScene')) {
        return
      }

      const targetPage =
        this.currentPage > 0 && (this.artworkPage?.numberOfElements ?? 0) <= 1
          ? this.currentPage - 1
          : this.currentPage
      this.closeArtworkDetail()
      await this.loadArtworkPage(targetPage)
    } catch (error) {
      console.error('Failed to delete artwork.', error)
    } finally {
      this.isDeletingArtwork = false
    }
  }

  private startArtworkEdit(artwork: Artwork) {
    const imageTextureKey = this.getArtworkTextureKey(artwork)
    if (!this.textures.exists(imageTextureKey)) {
      return
    }

    const editArtwork = {
      id: artwork.id,
      imageTextureKey,
      isPublic: artwork.isPublic,
    }

    this.closeArtworkDetail()

    if (this.isFreeDrawingArtwork(artwork)) {
      this.scene.start('ArtFreeDrawingScene', {
        suppressIntroDialog: true,
        editArtwork,
      })
      this.scene.stop('ArtSelectScene')
      return
    }

    this.scene.start('ArtColoringScene', {
      coloringId: this.getColoringIdForArtwork(artwork),
      suppressIntroDialog: true,
      editArtwork,
    })
    this.scene.stop('ArtSelectScene')
  }

  private isFreeDrawingArtwork(artwork: Artwork) {
    return (
      artwork.sketchCode === null || artwork.sketchCode === undefined || artwork.sketchCode === ''
    )
  }

  private getColoringIdForArtwork(artwork: Artwork) {
    const sketchNumber = Number(artwork.sketchCode)
    const optionIndex = Number.isFinite(sketchNumber) ? Math.max(0, sketchNumber - 1) : 0
    return coloringOptions[optionIndex]?.id ?? coloringOptions[0].id
  }

  private getArtworkSlots(): ArtworkSlot[] {
    const bounds = this.albumPageBounds
    const pageTop = bounds.top + bounds.height * 0.155
    const pageHeight = bounds.height * 0.61
    const pageWidth = bounds.width * 0.36
    const leftX = bounds.left + bounds.width * 0.095
    const rightX = bounds.left + bounds.width * 0.545
    const cardGap = bounds.height * 0.045
    const cardHeight = (pageHeight - cardGap) / 2

    return [
      { x: leftX, y: pageTop, width: pageWidth, height: cardHeight },
      { x: leftX, y: pageTop + cardHeight + cardGap, width: pageWidth, height: cardHeight },
      { x: rightX, y: pageTop, width: pageWidth, height: cardHeight },
      { x: rightX, y: pageTop + cardHeight + cardGap, width: pageWidth, height: cardHeight },
    ]
  }

  private updatePageControls() {
    const canGoPrevious =
      !this.isLoadingPage && Boolean(this.artworkPage && !this.artworkPage.first)
    const canGoNext = !this.isLoadingPage && Boolean(this.artworkPage && !this.artworkPage.last)

    if (canGoPrevious) {
      this.previousPageZone?.setInteractive({ useHandCursor: true })
    } else {
      this.previousPageZone?.disableInteractive()
    }

    if (canGoNext) {
      this.nextPageZone?.setInteractive({ useHandCursor: true })
    } else {
      this.nextPageZone?.disableInteractive()
    }

    this.previousPageHint?.setAlpha(canGoPrevious ? 0.85 : 0.22)
    this.nextPageHint?.setAlpha(canGoNext ? 0.85 : 0.22)
    this.previousPageHint?.setScale(1)
    this.nextPageHint?.setScale(1)

    if (!this.pageText) {
      return
    }

    if (!this.artworkPage || this.artworkPage.totalPages <= 0) {
      this.pageText.setText('')
      this.pageText.setAlpha(0)
      return
    }

    this.pageText.setText(`${this.artworkPage.number + 1} / ${this.artworkPage.totalPages}`)
    this.pageText.setAlpha(0.9)
  }

  private async createArtworkImageObjectUrl(imageUrl: string) {
    const response = await fetch(this.resolveArtworkImageUrl(imageUrl), {
      headers: this.getArtworkImageRequestHeaders(),
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch artwork image: ${response.status}`)
    }

    const objectUrl = URL.createObjectURL(await response.blob())
    this.artworkImageObjectUrls.push(objectUrl)
    return objectUrl
  }

  private getArtworkImageRequestHeaders(): HeadersInit {
    const accessToken = localStorage.getItem('wish_access_token')
    if (!accessToken) {
      return {}
    }

    return { Authorization: `Bearer ${accessToken}` }
  }

  private revokeArtworkImageObjectUrls() {
    this.artworkImageObjectUrls.forEach(objectUrl => URL.revokeObjectURL(objectUrl))
    this.artworkImageObjectUrls = []
  }

  private getArtworkTextureKey(artwork: Artwork) {
    const version = artwork.updatedAt.replace(/[^a-zA-Z0-9_-]/g, '_')
    return `art-album-artwork-${artwork.id}-${version}`
  }

  private resolveArtworkImageUrl(imageUrl: string) {
    const trimmedImageUrl = imageUrl.trim()
    if (/^(https?:|data:|blob:)/i.test(trimmedImageUrl)) {
      return trimmedImageUrl
    }

    const apiBaseUrl = this.getApiBaseUrl()
    const apiBasePath = apiBaseUrl.pathname.replace(/\/$/, '')

    if (trimmedImageUrl.startsWith('/')) {
      if (trimmedImageUrl === apiBasePath || trimmedImageUrl.startsWith(`${apiBasePath}/`)) {
        return new URL(trimmedImageUrl, apiBaseUrl.origin).toString()
      }

      if (/^\/api\/v1(\/|$)/.test(trimmedImageUrl)) {
        return new URL(
          `${this.getApiDeploymentPath(apiBaseUrl)}${trimmedImageUrl}`,
          apiBaseUrl.origin,
        ).toString()
      }

      return new URL(`${apiBasePath}${trimmedImageUrl}`, apiBaseUrl.origin).toString()
    }

    return new URL(trimmedImageUrl, apiBaseUrl).toString()
  }

  private getApiDeploymentPath(apiBaseUrl: URL) {
    const normalizedPath = apiBaseUrl.pathname.replace(/\/$/, '')
    const apiVersionPath = '/api/v1'
    if (!normalizedPath.endsWith(apiVersionPath)) {
      return normalizedPath
    }

    return normalizedPath.slice(0, -apiVersionPath.length)
  }

  private getApiBaseUrl() {
    const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL
    if (!configuredBaseUrl) {
      return new URL(window.location.origin)
    }

    if (/^https?:\/\//i.test(configuredBaseUrl)) {
      return new URL(configuredBaseUrl.endsWith('/') ? configuredBaseUrl : `${configuredBaseUrl}/`)
    }

    const basePath = configuredBaseUrl.startsWith('/') ? configuredBaseUrl : `/${configuredBaseUrl}`
    return new URL(basePath.endsWith('/') ? basePath : `${basePath}/`, window.location.origin)
  }
}
