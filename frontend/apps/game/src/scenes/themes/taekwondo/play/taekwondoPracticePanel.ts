import Phaser from 'phaser'

type RoundedPanelOptions = {
  depth?: number
  borderSize?: number
  radius?: number
  radiusRatio?: number
  fillColor?: number
  fillAlpha?: number
  strokeColor?: number
  strokeAlpha?: number
  strokeWidth?: number
}

export function createTaekwondoRoundedPanel(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  options: RoundedPanelOptions = {},
) {
  const borderSize = options.borderSize ?? 5
  const radius =
    options.radius ?? Math.round(Math.min(width, height) * (options.radiusRatio ?? 0.08))
  const frame = scene.add.graphics().setDepth(options.depth ?? 3)

  frame.fillStyle(options.fillColor ?? 0xfff8eb, options.fillAlpha ?? 0.96)
  frame.fillRoundedRect(
    x - width / 2 - borderSize,
    y - height / 2 - borderSize,
    width + borderSize * 2,
    height + borderSize * 2,
    radius + borderSize,
  )
  frame.lineStyle(
    options.strokeWidth ?? 2,
    options.strokeColor ?? 0xe5c58f,
    options.strokeAlpha ?? 0.9,
  )
  frame.strokeRoundedRect(
    x - width / 2 - borderSize,
    y - height / 2 - borderSize,
    width + borderSize * 2,
    height + borderSize * 2,
    radius + borderSize,
  )

  return frame
}
