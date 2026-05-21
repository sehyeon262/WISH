/**
 * 영상 Blob 에서 한 프레임을 JPEG 으로 뽑아내는 헬퍼.
 *
 * 동작:
 *   1. Blob → object URL → 숨김 video 엘리먼트에 로드
 *   2. video.currentTime 을 atSec 으로 seek
 *   3. video 프레임을 offscreen canvas 에 drawImage
 *   4. canvas.toBlob('image/jpeg', quality)
 *
 * MediaRecorder 결과물(특히 webm)은 컨테이너에 duration 이 정확히 안 들어있어서
 * seek 후에도 ratio 기반 시간 계산이 안 맞을 수 있다. atSec 은 영상 시작 부분
 * 에서의 절대 초로만 받아 단순화.
 */

export type ExtractThumbnailOptions = {
  /** 어디 시점 프레임을 뽑을지 (초). 기본값: 0.5초 (시작 직후 첫 안정 프레임) */
  atSec?: number
  /** JPEG 품질 (0~1). 기본값: 0.85 */
  quality?: number
  /** 출력 가로/세로를 직접 지정 — 미지정 시 영상 원본 해상도 사용 */
  maxWidth?: number
  maxHeight?: number
}

export type ExtractThumbnailResult = {
  blob: Blob
  width: number
  height: number
  capturedAtSec: number
}

const DEFAULT_AT_SEC = 0.5
const DEFAULT_QUALITY = 0.85
// seek/load 중 무한 대기 방지
const TIMEOUT_MS = 10_000

export async function extractThumbnailFromVideoBlob(
  videoBlob: Blob,
  {
    atSec = DEFAULT_AT_SEC,
    quality = DEFAULT_QUALITY,
    maxWidth,
    maxHeight,
  }: ExtractThumbnailOptions = {},
): Promise<ExtractThumbnailResult> {
  if (videoBlob.size === 0) {
    throw new Error('extractThumbnail: video blob is empty')
  }
  if (atSec < 0) {
    throw new Error('extractThumbnail: atSec must be >= 0')
  }

  const objectUrl = URL.createObjectURL(videoBlob)
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  // crossOrigin 안 박아도 같은 origin 의 blob URL 이라 canvas tainting 안 일어남
  video.preload = 'auto'

  const cleanup = () => {
    video.src = ''
    video.removeAttribute('src')
    video.load()
    URL.revokeObjectURL(objectUrl)
  }

  try {
    await waitForLoadedMetadata(video, objectUrl)
    await seekTo(video, atSec)

    const sourceWidth = video.videoWidth
    const sourceHeight = video.videoHeight
    if (sourceWidth === 0 || sourceHeight === 0) {
      throw new Error('extractThumbnail: video dimensions are 0 — codec or load failure?')
    }

    const { width, height } = fitWithin(sourceWidth, sourceHeight, maxWidth, maxHeight)

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error('extractThumbnail: 2d context unavailable')
    }
    ctx.drawImage(video, 0, 0, width, height)

    const blob = await canvasToJpegBlob(canvas, quality)

    return {
      blob,
      width,
      height,
      capturedAtSec: video.currentTime,
    }
  } finally {
    cleanup()
  }
}

function waitForLoadedMetadata(video: HTMLVideoElement, src: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error('extractThumbnail: timed out waiting for video metadata'))
    }, TIMEOUT_MS)

    const onLoaded = () => {
      cleanup()
      resolve()
    }
    const onError = () => {
      cleanup()
      reject(new Error('extractThumbnail: video failed to load'))
    }
    const cleanup = () => {
      clearTimeout(timer)
      video.removeEventListener('loadedmetadata', onLoaded)
      video.removeEventListener('error', onError)
    }

    video.addEventListener('loadedmetadata', onLoaded, { once: true })
    video.addEventListener('error', onError, { once: true })
    video.src = src
  })
}

function seekTo(video: HTMLVideoElement, targetSec: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error('extractThumbnail: timed out seeking video'))
    }, TIMEOUT_MS)

    const onSeeked = () => {
      cleanup()
      resolve()
    }
    const onError = () => {
      cleanup()
      reject(new Error('extractThumbnail: video seek failed'))
    }
    const cleanup = () => {
      clearTimeout(timer)
      video.removeEventListener('seeked', onSeeked)
      video.removeEventListener('error', onError)
    }

    video.addEventListener('seeked', onSeeked, { once: true })
    video.addEventListener('error', onError, { once: true })

    // duration 이 Infinity 이거나 NaN 인 경우(MediaRecorder 출력의 알려진 이슈) targetSec 그대로 시도
    const safeTarget = Number.isFinite(video.duration)
      ? Math.min(targetSec, video.duration)
      : targetSec
    if (video.currentTime === safeTarget) {
      // 이미 그 시점이면 seeked 이벤트 안 뜸 → 즉시 resolve
      cleanup()
      resolve()
      return
    }
    video.currentTime = safeTarget
  })
}

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      blob => {
        if (blob) resolve(blob)
        else reject(new Error('extractThumbnail: canvas.toBlob returned null'))
      },
      'image/jpeg',
      quality,
    )
  })
}

function fitWithin(
  sourceW: number,
  sourceH: number,
  maxW: number | undefined,
  maxH: number | undefined,
): { width: number; height: number } {
  if (!maxW && !maxH) return { width: sourceW, height: sourceH }
  const wScale = maxW ? maxW / sourceW : Infinity
  const hScale = maxH ? maxH / sourceH : Infinity
  const scale = Math.min(wScale, hScale, 1) // 키우진 않음
  return {
    width: Math.round(sourceW * scale),
    height: Math.round(sourceH * scale),
  }
}
