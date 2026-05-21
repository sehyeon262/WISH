import Phaser from 'phaser'
import { createSceneWeatherLayer } from '@/features/weather/phaserWeatherLayer'

type CoverBackgroundOptions = {
  depth?: number
  focalPoint?: {
    x: number
    y: number
  }
  scaleMultiplier?: number
}

export function addCoverBackground(
  scene: Phaser.Scene,
  textureKey: string,
  { depth = 0, focalPoint = { x: 0.5, y: 0.5 }, scaleMultiplier = 1 }: CoverBackgroundOptions = {},
) {
  const { width, height } = scene.scale
  const background = scene.add.image(width / 2, height / 2, textureKey)
  const source = background.texture.getSourceImage() as HTMLImageElement
  const scale = Math.max(width / source.width, height / source.height) * scaleMultiplier
  const sourceCenterX = source.width / 2
  const sourceCenterY = source.height / 2
  const focalOffsetX = (focalPoint.x * source.width - sourceCenterX) * scale
  const focalOffsetY = (focalPoint.y * source.height - sourceCenterY) * scale
  background
    .setPosition(width / 2 - focalOffsetX, height / 2 - focalOffsetY)
    .setScale(scale)
    .setDepth(depth)

  createSceneWeatherLayer(scene)

  return background
}
