/**
 * 캔버스 → MediaRecorder 로 짧은 클립 녹화 헬퍼.
 * Phaser 메인 캔버스를 그대로 캡처하면 카메라 + 게임 UI 가 한 화면에 들어옴.
 *
 * 사용 예:
 *   const { blob, mimeType } = await recordCanvas(game.canvas, { durationMs: 5000 })
 *   // → blob 을 S3 presigned URL 로 PUT
 */

const PREFERRED_MIME_TYPES = [
  // 데스크톱 크롬/엣지가 mp4/h264 직접 인코딩 지원 (호환성 최고)
  'video/mp4;codecs=h264',
  'video/mp4',
  // 그 외 — 크롬/파폭은 webm 항상 지원, 사파리는 폴백 없음
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
] as const

export type CanvasRecorderOptions = {
  /** 녹화할 길이 (ms). */
  durationMs: number
  /** 캡처 프레임레이트. default 30. 더 낮추면 파일 크기 ↓. */
  fps?: number
  /** 비디오 비트레이트 (bps). default 2 Mbps. */
  videoBitsPerSecond?: number
}

export type CanvasRecorderResult = {
  blob: Blob
  mimeType: string
  /** 의도한 녹화 길이 — 실제 영상 길이와 약간 다를 수 있음 (브라우저 인코딩 지연). */
  durationMs: number
}

/**
 * 브라우저가 지원하는 MIME 중 가장 호환성 좋은 것 반환.
 * 지원하는 게 하나도 없으면 null.
 */
export function pickSupportedMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null
  for (const mime of PREFERRED_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(mime)) return mime
  }
  return null
}

/**
 * 캔버스에서 durationMs 만큼 녹화 후 Blob 으로 반환.
 *
 * 주의:
 * - canvas.captureStream 은 비디오만 캡처. 오디오는 별도 stream 합성 필요.
 * - 녹화 중 캔버스 사이즈가 바뀌면 인코더가 깨질 수 있음. 게임 중 리사이즈 막아두는 게 안전.
 * - 모바일 사파리는 MediaRecorder 미지원 — pickSupportedMimeType 이 null 반환 → 호출 측에서 처리.
 */
export async function recordCanvas(
  canvas: HTMLCanvasElement,
  { durationMs, fps = 30, videoBitsPerSecond = 2_000_000 }: CanvasRecorderOptions,
): Promise<CanvasRecorderResult> {
  if (durationMs <= 0) {
    throw new Error('canvasRecorder: durationMs must be > 0')
  }

  const mimeType = pickSupportedMimeType()
  if (!mimeType) {
    throw new Error(
      'canvasRecorder: this browser does not support MediaRecorder for any candidate MIME',
    )
  }

  // captureStream 자체는 'captureStream' 명세지만 일부 환경(타입 정의 미반영)을 위해 좁힌 형태로 호출
  const captureStream = (
    canvas as HTMLCanvasElement & {
      captureStream?: (frameRate?: number) => MediaStream
    }
  ).captureStream
  if (typeof captureStream !== 'function') {
    throw new Error('canvasRecorder: canvas.captureStream is not available')
  }

  const stream = captureStream.call(canvas, fps)
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond })
  const chunks: Blob[] = []

  return new Promise<CanvasRecorderResult>((resolve, reject) => {
    let stopTimer: ReturnType<typeof setTimeout> | null = null

    const cleanup = () => {
      if (stopTimer !== null) clearTimeout(stopTimer)
      stream.getTracks().forEach(track => track.stop())
    }

    recorder.ondataavailable = event => {
      if (event.data && event.data.size > 0) chunks.push(event.data)
    }

    recorder.onerror = event => {
      cleanup()
      const err = (event as Event & { error?: Error }).error
      reject(err ?? new Error('canvasRecorder: MediaRecorder error'))
    }

    recorder.onstop = () => {
      cleanup()
      resolve({
        blob: new Blob(chunks, { type: mimeType }),
        mimeType,
        durationMs,
      })
    }

    try {
      recorder.start()
    } catch (error) {
      cleanup()
      reject(error)
      return
    }

    stopTimer = setTimeout(() => {
      if (recorder.state !== 'inactive') recorder.stop()
    }, durationMs)
  })
}
