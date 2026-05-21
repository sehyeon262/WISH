import Phaser from 'phaser'

type ArtCameraPreviewOptions = {
  depth?: number
  getVideoElement: () => HTMLVideoElement | null
  height: number
  textureKey: string
  width: number
  x: number
  y: number
}

export type ArtCameraPreview = {
  destroy: () => void
  update: () => void
}

export function createArtCameraPreview(
  scene: Phaser.Scene,
  { depth = 8, getVideoElement, height, textureKey, width, x, y }: ArtCameraPreviewOptions,
): ArtCameraPreview {
  const canvas = document.createElement('canvas')
  canvas.width = 640
  canvas.height = 480
  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('Art camera preview canvas context is not available.')
  }

  if (scene.textures.exists(textureKey)) {
    scene.textures.remove(textureKey)
  }

  const texture = scene.textures.addCanvas(textureKey, canvas)
  if (!texture) {
    throw new Error('Art camera preview texture is not available.')
  }

  const objects: Phaser.GameObjects.GameObject[] = []
  const cornerRadius = Math.max(10, Math.round(Math.min(width, height) * 0.06))
  const panel = scene.add.graphics().setDepth(depth)

  // minimal frame: cream surface + a single thin warm-wood border
  panel.fillStyle(0xfcf8f0, 0.94)
  panel.fillRoundedRect(x - width / 2, y - height / 2, width, height, cornerRadius)
  panel.lineStyle(1.5, 0xa8845a, 0.85)
  panel.strokeRoundedRect(x - width / 2, y - height / 2, width, height, cornerRadius)
  objects.push(panel)

  const inset = Math.max(4, Math.round(Math.min(width, height) * 0.025))
  const image = scene.add
    .image(x, y, texture.key)
    .setDisplaySize(width - inset * 2, height - inset * 2)
    .setDepth(depth + 1)
  objects.push(image)

  const maskShape = scene.add.graphics().setVisible(false)
  maskShape
    .fillStyle(0xffffff, 1)
    .fillRoundedRect(
      x - width / 2 + inset,
      y - height / 2 + inset,
      width - inset * 2,
      height - inset * 2,
      Math.max(6, cornerRadius - 8),
    )
  image.setMask(maskShape.createGeometryMask())
  objects.push(maskShape)

  const drawPlaceholder = () => {
    const gradient = context.createLinearGradient(0, 0, 0, canvas.height)
    gradient.addColorStop(0, '#f6c067')
    gradient.addColorStop(1, '#91511d')
    context.fillStyle = gradient
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = 'rgba(61, 34, 16, 0.78)'
    context.font = 'bold 38px sans-serif'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText('카메라 준비 중', canvas.width / 2, canvas.height / 2)
  }

  const drawVideoCover = (video: HTMLVideoElement) => {
    const videoWidth = video.videoWidth || canvas.width
    const videoHeight = video.videoHeight || canvas.height
    const canvasAspect = canvas.width / canvas.height
    const videoAspect = videoWidth / videoHeight
    let sourceX = 0
    let sourceY = 0
    let sourceWidth = videoWidth
    let sourceHeight = videoHeight

    if (videoAspect > canvasAspect) {
      sourceWidth = videoHeight * canvasAspect
      sourceX = (videoWidth - sourceWidth) / 2
    } else {
      sourceHeight = videoWidth / canvasAspect
      sourceY = (videoHeight - sourceHeight) / 2
    }

    context.save()
    context.translate(canvas.width, 0)
    context.scale(-1, 1)
    context.drawImage(
      video,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      canvas.width,
      canvas.height,
    )
    context.restore()
  }

  const update = () => {
    const video = getVideoElement()
    context.clearRect(0, 0, canvas.width, canvas.height)

    if (
      video &&
      video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
      video.videoWidth > 0 &&
      video.videoHeight > 0
    ) {
      drawVideoCover(video)
    } else {
      drawPlaceholder()
    }

    texture.refresh()
  }

  update()

  return {
    destroy: () => {
      objects.forEach(object => object.destroy())
      if (scene.textures.exists(textureKey)) {
        scene.textures.remove(textureKey)
      }
    },
    update,
  }
}
