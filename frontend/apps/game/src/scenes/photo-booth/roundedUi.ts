import Phaser from 'phaser'

const FONT = "'Jua', 'Apple SD Gothic Neo', sans-serif"

export type RoundedButtonHandle = {
  graphics: Phaser.GameObjects.Graphics
  label: Phaser.GameObjects.Text
  hitArea: Phaser.GameObjects.Rectangle
  setFill: (color: number) => void
  setLabel: (text: string) => void
  setVisible: (visible: boolean) => void
  setEnabled: (enabled: boolean) => void
}

export function createRoundedButton(
  scene: Phaser.Scene,
  opts: {
    x: number
    y: number
    w: number
    h: number
    /** corner radius. default = h/2 (pill). */
    r?: number
    fill: number
    fillHover?: number
    stroke?: { color: number; width: number }
    label: string
    labelColor: string
    labelSize: number
    depth?: number
    onClick?: () => void
  },
): RoundedButtonHandle {
  const r = opts.r ?? opts.h / 2
  const depth = opts.depth ?? 0

  const graphics = scene.add.graphics().setDepth(depth)
  let currentFill = opts.fill
  const draw = () => {
    graphics.clear()
    if (opts.stroke) {
      graphics.lineStyle(opts.stroke.width, opts.stroke.color, 1)
    }
    graphics.fillStyle(currentFill, 1)
    graphics.fillRoundedRect(opts.x - opts.w / 2, opts.y - opts.h / 2, opts.w, opts.h, r)
    if (opts.stroke) {
      graphics.strokeRoundedRect(opts.x - opts.w / 2, opts.y - opts.h / 2, opts.w, opts.h, r)
    }
  }
  draw()

  const label = scene.add
    .text(opts.x, opts.y, opts.label, {
      fontFamily: FONT,
      fontSize: `${opts.labelSize}px`,
      color: opts.labelColor,
      resolution: 2,
    })
    .setOrigin(0.5)
    .setDepth(depth + 1)

  const hitArea = scene.add
    .rectangle(opts.x, opts.y, opts.w, opts.h, 0x000000, 0)
    .setOrigin(0.5)
    .setInteractive({ useHandCursor: true })
    .setDepth(depth + 2)

  if (opts.onClick) hitArea.on('pointerdown', opts.onClick)
  if (opts.fillHover !== undefined) {
    hitArea.on('pointerover', () => {
      currentFill = opts.fillHover!
      draw()
    })
    hitArea.on('pointerout', () => {
      currentFill = opts.fill
      draw()
    })
  }

  return {
    graphics,
    label,
    hitArea,
    setFill: (color: number) => {
      currentFill = color
      draw()
    },
    setLabel: (text: string) => {
      label.setText(text)
    },
    setVisible: (visible: boolean) => {
      graphics.setVisible(visible)
      label.setVisible(visible)
      hitArea.setVisible(visible)
    },
    setEnabled: (enabled: boolean) => {
      if (enabled) hitArea.setInteractive({ useHandCursor: true })
      else hitArea.disableInteractive()
    },
  }
}

export function drawRoundedCard(
  graphics: Phaser.GameObjects.Graphics,
  opts: {
    x: number
    y: number
    w: number
    h: number
    r: number
    fill: number
    stroke?: { color: number; width: number }
  },
) {
  graphics.clear()
  if (opts.stroke) {
    graphics.lineStyle(opts.stroke.width, opts.stroke.color, 1)
  }
  graphics.fillStyle(opts.fill, 1)
  graphics.fillRoundedRect(opts.x - opts.w / 2, opts.y - opts.h / 2, opts.w, opts.h, opts.r)
  if (opts.stroke) {
    graphics.strokeRoundedRect(opts.x - opts.w / 2, opts.y - opts.h / 2, opts.w, opts.h, opts.r)
  }
}
