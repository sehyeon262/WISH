import Phaser from 'phaser'

type ArtConfirmButtonOptions = {
  label: string
  fillColor: number
  strokeColor: number
  textColor: string
  onSelect: () => void
}

export type ArtConfirmDialogButtonRole = 'secondary' | 'primary'

type ArtConfirmDialogOptions = {
  depth: number
  title: string
  message: string
  titleFontScale?: number // 기본 1. 라운드 인트로처럼 제시어를 크게 띄우고 싶을 때 2~3 권장
  secondaryButton: ArtConfirmButtonOptions
  primaryButton: ArtConfirmButtonOptions
}

export type ArtConfirmDialog = {
  getButtonAt: (point: Phaser.Math.Vector2) => ArtConfirmDialogButtonRole | null
  selectButton: (role: ArtConfirmDialogButtonRole) => void
  setButtonHover: (role: ArtConfirmDialogButtonRole | null) => void
  destroy: () => void
}

type ArtConfirmDialogButton = {
  role: ArtConfirmDialogButtonRole
  bounds: Phaser.Geom.Rectangle
  select: () => void
  setHover: (isHovered: boolean) => void
}

export function createArtConfirmDialog(
  scene: Phaser.Scene,
  {
    depth,
    title,
    message,
    titleFontScale = 1,
    secondaryButton,
    primaryButton,
  }: ArtConfirmDialogOptions,
): ArtConfirmDialog {
  const { width: vw, height: vh } = scene.scale
  const centerX = vw / 2
  const centerY = vh / 2
  const isHero = titleFontScale > 1.4
  const panelWidth = Phaser.Math.Clamp(vw * (isHero ? 0.42 : 0.32), 380, isHero ? 640 : 540)
  const panelHeight = Phaser.Math.Clamp(
    vh * (isHero ? 0.34 : 0.23),
    isHero ? 300 : 220,
    isHero ? 360 : 270,
  )
  const panelX = centerX - panelWidth / 2
  const panelY = centerY - panelHeight / 2
  const objects: Phaser.GameObjects.GameObject[] = []
  const buttons: ArtConfirmDialogButton[] = []

  const overlay = scene.add
    .rectangle(centerX, centerY, vw, vh, 0x000000, 0.42)
    .setDepth(depth)
    .setInteractive()
  overlay.on(
    'pointerdown',
    (
      _pointer: Phaser.Input.Pointer,
      _localX: number,
      _localY: number,
      event: Phaser.Types.Input.EventData,
    ) => event.stopPropagation(),
  )

  const panel = scene.add.graphics().setDepth(depth + 1)
  panel.fillStyle(0xfff6e8, 0.98)
  panel.lineStyle(4, 0x8f6c48, 1)
  panel.fillRoundedRect(panelX, panelY, panelWidth, panelHeight, 22)
  panel.strokeRoundedRect(panelX, panelY, panelWidth, panelHeight, 22)

  const titleFontPx = Math.max(20, Math.round(vw * 0.013 * titleFontScale))
  const titleY = panelY + (isHero ? 110 : 54)
  const titleText = scene.add
    .text(centerX, titleY, title, {
      fontFamily: 'sans-serif',
      fontSize: `${titleFontPx}px`,
      color: '#4e321f',
      align: 'center',
      fontStyle: isHero ? 'bold' : 'normal',
    })
    .setDepth(depth + 2)
    .setOrigin(0.5)

  const messageText = scene.add
    .text(centerX, panelY + (isHero ? 56 : 106), message, {
      fontFamily: 'sans-serif',
      fontSize: `${Math.max(15, Math.round(vw * 0.009))}px`,
      color: '#70513a',
      align: 'center',
      wordWrap: { width: panelWidth - 56, useAdvancedWrap: true },
    })
    .setDepth(depth + 2)
    .setOrigin(0.5)

  objects.push(overlay, panel, titleText, messageText)
  buttons.push(
    createConfirmButton(
      scene,
      objects,
      depth,
      'secondary',
      centerX - panelWidth * 0.22,
      panelY + panelHeight - 54,
      Math.min(180, panelWidth * 0.36),
      48,
      secondaryButton,
    ),
  )
  buttons.push(
    createConfirmButton(
      scene,
      objects,
      depth,
      'primary',
      centerX + panelWidth * 0.22,
      panelY + panelHeight - 54,
      Math.min(180, panelWidth * 0.36),
      48,
      primaryButton,
    ),
  )

  return {
    getButtonAt: point => {
      const candidates = buttons.filter(button => button.bounds.contains(point.x, point.y))
      if (candidates.length === 0) {
        return null
      }

      const nearestButton = candidates.reduce((nearest, button) =>
        Phaser.Math.Distance.Between(
          point.x,
          point.y,
          button.bounds.centerX,
          button.bounds.centerY,
        ) <
        Phaser.Math.Distance.Between(
          point.x,
          point.y,
          nearest.bounds.centerX,
          nearest.bounds.centerY,
        )
          ? button
          : nearest,
      )

      return nearestButton.role
    },
    selectButton: role => {
      buttons.find(button => button.role === role)?.select()
    },
    setButtonHover: role => {
      buttons.forEach(button => button.setHover(button.role === role))
    },
    destroy: () => {
      objects.forEach(object => object.destroy())
    },
  }
}

function createConfirmButton(
  scene: Phaser.Scene,
  objects: Phaser.GameObjects.GameObject[],
  depth: number,
  role: ArtConfirmDialogButtonRole,
  x: number,
  y: number,
  width: number,
  height: number,
  { label, fillColor, strokeColor, textColor, onSelect }: ArtConfirmButtonOptions,
) {
  const button = scene.add
    .rectangle(x, y, width, height, fillColor, 1)
    .setDepth(depth + 2)
    .setStrokeStyle(3, strokeColor, 1)
    .setInteractive({ useHandCursor: true })
  const text = scene.add
    .text(x, y, label, {
      fontFamily: 'sans-serif',
      fontSize: `${Math.max(15, Math.round(scene.scale.width * 0.009))}px`,
      color: textColor,
      align: 'center',
    })
    .setDepth(depth + 3)
    .setOrigin(0.5)
    .setInteractive({ useHandCursor: true })
  const handlePointerDown = (
    _pointer: Phaser.Input.Pointer,
    _localX: number,
    _localY: number,
    event: Phaser.Types.Input.EventData,
  ) => {
    event.stopPropagation()
    onSelect()
  }

  button.on('pointerover', () => button.setScale(1.03))
  button.on('pointerout', () => button.setScale(1))
  button.on('pointerdown', handlePointerDown)
  text.on('pointerover', () => button.setScale(1.03))
  text.on('pointerout', () => button.setScale(1))
  text.on('pointerdown', handlePointerDown)
  objects.push(button, text)

  const hitPadding = Math.max(42, Math.round(scene.scale.width * 0.024))
  return {
    role,
    bounds: new Phaser.Geom.Rectangle(
      x - width / 2 - hitPadding,
      y - height / 2 - hitPadding,
      width + hitPadding * 2,
      height + hitPadding * 2,
    ),
    select: onSelect,
    setHover: (isHovered: boolean) => button.setScale(isHovered ? 1.03 : 1),
  }
}
