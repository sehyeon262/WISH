import Phaser from 'phaser'

type CameraBackgroundOptions = {
  getVideoElement: () => HTMLVideoElement | null
  textureKey: string
  depth?: number
  alpha?: number
  mirror?: boolean
  /**
   * 가장자리로 갈수록 카메라가 투명해지는 방사형 비네팅.
   * 0~1 (0 = 비네팅 없음, 1 = 가장자리에서 완전히 투명).
   * default: 0 (비네팅 없음)
   */
  vignette?: number
}

export type CameraBackground = {
  destroy: () => void
  update: () => void
  setAlpha: (alpha: number) => void
}

/**
 * 카메라 비디오를 화면 전체 크기로 깔아주는 헬퍼.
 * 비디오 엘리먼트는 외부에서 주입 (HandTracker 와 공유 가능).
 * 비디오 준비 전엔 어두운 플레이스홀더가 표시됨.
 */
export function createCameraBackground(
  scene: Phaser.Scene,
  {
    getVideoElement,
    textureKey,
    depth = 0,
    alpha = 0.5,
    mirror = true,
    vignette = 0,
  }: CameraBackgroundOptions,
): CameraBackground {
  const canvas = document.createElement('canvas')
  canvas.width = 960
  canvas.height = 540 // 16:9
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('cameraBackground: 2d context unavailable')
  }

  if (scene.textures.exists(textureKey)) {
    scene.textures.remove(textureKey)
  }
  const texture = scene.textures.addCanvas(textureKey, canvas)
  if (!texture) {
    throw new Error('cameraBackground: texture unavailable')
  }

  const { width: vw, height: vh } = scene.scale
  const image = scene.add
    .image(vw / 2, vh / 2, texture.key)
    .setDisplaySize(vw, vh)
    .setDepth(depth)
    .setAlpha(alpha)
    .setScrollFactor(0)

  const drawPlaceholder = () => {
    context.fillStyle = '#08090f'
    context.fillRect(0, 0, canvas.width, canvas.height)
  }

  const drawVideoCover = (video: HTMLVideoElement) => {
    const vidW = video.videoWidth || canvas.width
    const vidH = video.videoHeight || canvas.height
    const canvasAspect = canvas.width / canvas.height
    const videoAspect = vidW / vidH
    let sx = 0
    let sy = 0
    let sw = vidW
    let sh = vidH
    if (videoAspect > canvasAspect) {
      sw = vidH * canvasAspect
      sx = (vidW - sw) / 2
    } else {
      sh = vidW / canvasAspect
      sy = (vidH - sh) / 2
    }

    context.save()
    if (mirror) {
      context.translate(canvas.width, 0)
      context.scale(-1, 1)
    }
    context.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
    context.restore()
  }

  // 가장자리에서 카메라를 투명하게 깎아내는 방사형 마스크
  // (destination-in: 그라디언트의 알파만큼만 기존 픽셀이 살아남음)
  const applyVignette = () => {
    if (vignette <= 0) return
    const cx = canvas.width / 2
    const cy = canvas.height / 2
    // 중앙 영역은 카메라 풀 알파, 가장자리로 갈수록 페이드
    const innerR = Math.min(canvas.width, canvas.height) * 0.55
    const outerR = Math.hypot(canvas.width / 2, canvas.height / 2)
    const gradient = context.createRadialGradient(cx, cy, innerR, cx, cy, outerR)
    const edgeAlpha = Math.max(0, 1 - vignette)
    gradient.addColorStop(0, 'rgba(255,255,255,1)')
    gradient.addColorStop(1, `rgba(255,255,255,${edgeAlpha})`)
    context.save()
    context.globalCompositeOperation = 'destination-in'
    context.fillStyle = gradient
    context.fillRect(0, 0, canvas.width, canvas.height)
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
      applyVignette()
    } else {
      drawPlaceholder()
    }
    texture.refresh()
  }

  update()

  return {
    destroy: () => {
      image.destroy()
      if (scene.textures.exists(textureKey)) {
        scene.textures.remove(textureKey)
      }
    },
    update,
    setAlpha: (a: number) => {
      image.setAlpha(a)
    },
  }
}
