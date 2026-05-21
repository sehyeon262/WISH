import Phaser from 'phaser'

const BRUSH_COLOR_OVERLAY_TEXTURE_PREFIX = 'art-brush-color-overlay'
const BRUSH_TIP_MASK = {
  minXRatio: 0.11,
  maxXRatio: 0.5,
  minYRatio: 0.58,
  maxYRatio: 0.83,
}

export function getArtBrushColorOverlayTextureKey(scene: Phaser.Scene, color: number) {
  const textureKey = `${BRUSH_COLOR_OVERLAY_TEXTURE_PREFIX}-${color.toString(16).padStart(6, '0')}`
  if (!scene.textures.exists(textureKey)) {
    createArtBrushColorOverlayTexture(scene, textureKey, color)
  }
  return textureKey
}

function createArtBrushColorOverlayTexture(scene: Phaser.Scene, textureKey: string, color: number) {
  const sourceImage = scene.textures.get('art-ui-brush').getSourceImage() as CanvasImageSource & {
    width: number
    height: number
  }
  const width = sourceImage.width
  const height = sourceImage.height
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) {
    return
  }

  context.drawImage(sourceImage, 0, 0, width, height)

  const imageData = context.getImageData(0, 0, width, height)
  const data = imageData.data
  const red = (color >> 16) & 0xff
  const green = (color >> 8) & 0xff
  const blue = color & 0xff
  const minX = Math.round(width * BRUSH_TIP_MASK.minXRatio)
  const maxX = Math.round(width * BRUSH_TIP_MASK.maxXRatio)
  const minY = Math.round(height * BRUSH_TIP_MASK.minYRatio)
  const maxY = Math.round(height * BRUSH_TIP_MASK.maxYRatio)

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4
      if (x < minX || x > maxX || y < minY || y > maxY || data[index + 3] === 0) {
        data[index + 3] = 0
        continue
      }

      const luminance =
        (data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114) / 255
      const shade = 0.58 + luminance * 0.55
      data[index] = Math.min(255, Math.round(red * shade))
      data[index + 1] = Math.min(255, Math.round(green * shade))
      data[index + 2] = Math.min(255, Math.round(blue * shade))
      data[index + 3] = Math.round(data[index + 3] * 0.86)
    }
  }

  context.putImageData(imageData, 0, 0)
  scene.textures.addCanvas(textureKey, canvas)
}
