import Phaser from 'phaser'
import type { TaekwondoBeltColor } from '@wish/api-client'
import { createTaekwondoRoundedPanel } from '../play/taekwondoPracticePanel'

export const BELT_PROMOTION_TEXTURE_KEYS: Partial<Record<TaekwondoBeltColor, string>> = {
  YELLOW: 'taekwondo-belt-promotion-yellow',
  ORANGE: 'taekwondo-belt-promotion-orange',
  GREEN: 'taekwondo-belt-promotion-green',
  BLUE: 'taekwondo-belt-promotion-blue',
  PURPLE: 'taekwondo-belt-promotion-purple',
  BROWN: 'taekwondo-belt-promotion-brown',
  RED: 'taekwondo-belt-promotion-red',
  BLACK: 'taekwondo-belt-promotion-black',
}

export const BELT_PROMOTION_DECORATION_KEYS = {
  banner: 'taekwondo-belt-promotion-banner',
  complete: 'taekwondo-belt-promotion-complete',
  background: 'taekwondo-belt-promotion-background',
  podium: 'taekwondo-belt-promotion-podium',
} as const

const BELT_LABELS: Record<TaekwondoBeltColor, string> = {
  WHITE: '흰 띠',
  YELLOW: '노란 띠',
  ORANGE: '주황 띠',
  GREEN: '초록 띠',
  BLUE: '파란 띠',
  PURPLE: '보라 띠',
  BROWN: '갈색 띠',
  RED: '빨간 띠',
  BLACK: '검은 띠',
}

const PROMOTION_CROPS = {
  background: { x: 113, y: 169, width: 1061, height: 899 },
  podium: { x: 66, y: 372, width: 1126, height: 468 },
  banner: { x: 71, y: 464, width: 1127, height: 273 },
  complete: { x: 108, y: 103, width: 1037, height: 1026 },
  belt: { x: 124, y: 210, width: 1200, height: 697 },
} as const

type BeltPromotionOverlayOptions = {
  beltColor: TaekwondoBeltColor
  textureKey: string
  onClose: () => void
}

export function getTaekwondoBeltLabel(beltColor: TaekwondoBeltColor) {
  return BELT_LABELS[beltColor]
}

function createCroppedImage(
  scene: Phaser.Scene,
  x: number,
  y: number,
  textureKey: string,
  crop: { x: number; y: number; width: number; height: number },
  displayWidth: number,
  displayHeight: number,
) {
  const renderTexture = scene.add.renderTexture(x, y, displayWidth, displayHeight)
  const source = scene.add.image(0, 0, textureKey).setOrigin(0)
  source.setCrop(crop.x, crop.y, crop.width, crop.height)
  source.setDisplaySize(displayWidth, displayHeight)
  renderTexture.draw(source, 0, 0)
  source.destroy()
  return renderTexture
}

export function createBeltPromotionOverlay(
  scene: Phaser.Scene,
  options: BeltPromotionOverlayOptions,
) {
  const { width: vw, height: vh } = scene.scale
  const overlay = scene.add.container(vw / 2, vh / 2).setDepth(45)
  const dim = scene.add.rectangle(0, 0, vw, vh, 0x1b1209, 0.52)
  const panelWidth = Math.min(vw * 0.74, vh * 1.38)
  const panelHeight = panelWidth * 0.6
  const panel = createTaekwondoRoundedPanel(scene, 0, 0, panelWidth, panelHeight, {
    depth: 0,
    fillColor: 0xfff5dc,
    fillAlpha: 0.98,
    strokeColor: 0xd7a750,
    strokeAlpha: 0.95,
    strokeWidth: 4,
    radius: Math.round(Math.min(panelWidth, panelHeight) * 0.075),
  })
  const promotionBackground = createCroppedImage(
    scene,
    0,
    -panelHeight * 0.01,
    BELT_PROMOTION_DECORATION_KEYS.background,
    PROMOTION_CROPS.background,
    panelWidth * 1.1,
    panelHeight * 1.3,
  )
  const bannerDisplayWidth = panelWidth * 0.56
  const banner = createCroppedImage(
    scene,
    0,
    -panelHeight * 0.3,
    BELT_PROMOTION_DECORATION_KEYS.banner,
    PROMOTION_CROPS.banner,
    bannerDisplayWidth,
    bannerDisplayWidth * 0.75,
  )
  const beltLabel = getTaekwondoBeltLabel(options.beltColor)
  const podiumWidth = panelWidth * 0.65
  const podium = createCroppedImage(
    scene,
    0,
    panelHeight * 0.24,
    BELT_PROMOTION_DECORATION_KEYS.podium,
    PROMOTION_CROPS.podium,
    podiumWidth,
    podiumWidth * 0.8,
  )
  const beltDisplayWidth = panelWidth * 0.4
  const belt = createCroppedImage(
    scene,
    panelWidth * 0,
    -panelHeight * 0.06,
    options.textureKey,
    PROMOTION_CROPS.belt,
    beltDisplayWidth,
    beltDisplayWidth * (PROMOTION_CROPS.belt.height / PROMOTION_CROPS.belt.width),
  )
  const stampSize = panelWidth * 0.22
  const stamp = createCroppedImage(
    scene,
    -panelWidth * 0.39,
    -panelHeight * 0.2,
    BELT_PROMOTION_DECORATION_KEYS.complete,
    PROMOTION_CROPS.complete,
    stampSize,
    stampSize * (PROMOTION_CROPS.complete.height / PROMOTION_CROPS.complete.width),
  ).setAngle(-9)
  const labelPanelWidth = panelWidth * 0.3
  const labelPanelHeight = panelHeight * 0.08
  const labelY = panelHeight * 0.36
  const labelPanel = createTaekwondoRoundedPanel(
    scene,
    0,
    labelY,
    labelPanelWidth,
    labelPanelHeight,
    {
      depth: 0,
      fillColor: 0xfffbef,
      fillAlpha: 0.98,
      strokeColor: 0xe0bd75,
      strokeAlpha: 0.9,
      strokeWidth: 2,
      radius: Math.round(labelPanelHeight * 0.45),
    },
  )
  const beltText = scene.add
    .text(0, labelY, beltLabel, {
      fontFamily: 'sans-serif',
      fontSize: `${Math.round(Phaser.Math.Clamp(labelPanelHeight * 0.42, 20, 28))}px`,
      color: '#5a3517',
      fontStyle: '800',
      align: 'center',
    })
    .setOrigin(0.5)
  const labelStarStyle: Phaser.Types.GameObjects.Text.TextStyle = {
    fontFamily: 'sans-serif',
    fontSize: `${Math.round(labelPanelHeight * 0.32)}px`,
    color: '#d6bd76',
    fontStyle: '800',
    align: 'center',
  }
  const leftLabelStar = scene.add
    .text(-labelPanelWidth * 0.33, labelY, '\u2605', labelStarStyle)
    .setOrigin(0.5)
  const rightLabelStar = scene.add
    .text(labelPanelWidth * 0.33, labelY, '\u2605', labelStarStyle)
    .setOrigin(0.5)
  const closeHitArea = scene.add
    .rectangle(0, 0, panelWidth, panelHeight, 0xffffff, 0)
    .setInteractive({ useHandCursor: true })
  closeHitArea.on('pointerdown', () => {
    closeHitArea.removeAllListeners()
    options.onClose()
  })

  overlay.add([dim, panel, promotionBackground])
  overlay.add([
    banner,
    podium,
    belt,
    stamp,
    labelPanel,
    leftLabelStar,
    rightLabelStar,
    beltText,
    closeHitArea,
  ])
  overlay.setAlpha(0)
  overlay.setScale(0.96)
  scene.tweens.add({
    targets: overlay,
    alpha: 1,
    scale: 1,
    duration: 220,
    ease: 'Back.easeOut',
  })

  return overlay
}
