import type Phaser from 'phaser'

export type MusicRecording = {
  videoBlob: Blob
  videoMimeType: string
  thumbBlob: Blob
  thumbMimeType: string
}

export type MusicRecorderHandle = {
  stop: () => Promise<MusicRecording>
  cancel: () => void
}

const VIDEO_MIME_CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
] as const

const THUMB_MIME_TYPE = 'image/jpeg'
const THUMB_QUALITY = 0.85

function pickSupportedMime(): string | null {
  if (typeof MediaRecorder === 'undefined') return null
  for (const mime of VIDEO_MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(mime)) return mime
  }
  return null
}

type PhaserAudioTap = {
  context: AudioContext
  source: AudioNode
}

function getPhaserAudioTap(scene: Phaser.Scene): PhaserAudioTap | null {
  const sm = scene.sound as unknown as {
    context?: AudioContext
    masterVolumeNode?: AudioNode
  }
  if (sm?.context && sm?.masterVolumeNode) {
    return { context: sm.context, source: sm.masterVolumeNode }
  }
  return null
}

function captureThumb(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => {
        if (blob) resolve(blob)
        else reject(new Error('thumbnail capture returned null'))
      },
      THUMB_MIME_TYPE,
      THUMB_QUALITY,
    )
  })
}

export type StartMusicRecordingOptions = {
  scene: Phaser.Scene
  fps?: number
  videoBitsPerSecond?: number
  audioBitsPerSecond?: number
}

export function startMusicRecording(opts: StartMusicRecordingOptions): MusicRecorderHandle | null {
  const mimeType = pickSupportedMime()
  if (!mimeType) {
    console.warn('[musicRecorder] MediaRecorder webm not supported in this browser')
    return null
  }

  // Capture the Phaser game canvas, not an internal camera/source canvas.
  // Scenes that draw camera feeds, HUD, feedback, and overlays into Phaser will be recorded as one full game view.
  const canvas = opts.scene.game.canvas
  if (!canvas || typeof canvas.captureStream !== 'function') {
    console.warn('[musicRecorder] canvas.captureStream not available')
    return null
  }

  const fps = opts.fps ?? 30
  const videoStream = canvas.captureStream(fps)
  const tracks: MediaStreamTrack[] = [...videoStream.getVideoTracks()]

  const audio = getPhaserAudioTap(opts.scene)
  let audioDest: MediaStreamAudioDestinationNode | null = null
  if (audio) {
    try {
      audioDest = audio.context.createMediaStreamDestination()
      audio.source.connect(audioDest)
      tracks.push(...audioDest.stream.getAudioTracks())
    } catch (err) {
      console.warn('[musicRecorder] failed to attach audio, recording video only', err)
      audioDest = null
    }
  }

  const stream = new MediaStream(tracks)
  let recorder: MediaRecorder
  try {
    recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: opts.videoBitsPerSecond ?? 1_500_000,
      audioBitsPerSecond: opts.audioBitsPerSecond ?? 96_000,
    })
  } catch (err) {
    console.warn('[musicRecorder] failed to construct MediaRecorder', err)
    stream.getTracks().forEach(t => t.stop())
    return null
  }

  const chunks: Blob[] = []
  recorder.addEventListener('dataavailable', event => {
    if (event.data && event.data.size > 0) chunks.push(event.data)
  })

  recorder.start(1_000)

  let cleanedUp = false
  const cleanup = () => {
    if (cleanedUp) return
    cleanedUp = true
    if (audio && audioDest) {
      try {
        audio.source.disconnect(audioDest)
      } catch {
        // node may already be disconnected
      }
    }
    stream.getTracks().forEach(t => t.stop())
  }

  return {
    stop: async () => {
      const thumbPromise = captureThumb(canvas)
      const stopPromise = new Promise<void>(resolve => {
        recorder.addEventListener('stop', () => resolve(), { once: true })
      })
      if (recorder.state !== 'inactive') {
        recorder.stop()
      }
      const [thumbBlob] = await Promise.all([thumbPromise, stopPromise])
      cleanup()
      return {
        videoBlob: new Blob(chunks, { type: 'video/webm' }),
        videoMimeType: 'video/webm',
        thumbBlob,
        thumbMimeType: THUMB_MIME_TYPE,
      }
    },
    cancel: () => {
      try {
        if (recorder.state !== 'inactive') recorder.stop()
      } catch {
        // ignore
      }
      cleanup()
    },
  }
}
