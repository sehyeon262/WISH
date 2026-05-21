import { FilesetResolver, HandLandmarker, type NormalizedLandmark } from '@mediapipe/tasks-vision'

const MEDIAPIPE_VERSION = '0.10.21'
const DEFAULT_WASM_BASE_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`
const DEFAULT_HAND_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'

export type HandTrackerOptions = {
  wasmBaseUrl?: string
  modelAssetPath?: string
  numHands?: number
  delegate?: 'CPU' | 'GPU'
  video?: MediaTrackConstraints
}

export type TrackedHand = {
  landmarks: NormalizedLandmark[]
  handedness?: string
  score?: number
}

export type HandTrackingResult = {
  hands: TrackedHand[]
  timestampMs: number
}

export class HandTracker {
  private readonly options: Required<HandTrackerOptions>
  private videoElement: HTMLVideoElement | null = null
  private mediaStream: MediaStream | null = null
  private landmarker: HandLandmarker | null = null
  private lastVideoTime = -1

  constructor(options: HandTrackerOptions = {}) {
    this.options = {
      wasmBaseUrl: options.wasmBaseUrl ?? DEFAULT_WASM_BASE_URL,
      modelAssetPath: options.modelAssetPath ?? DEFAULT_HAND_MODEL_URL,
      numHands: options.numHands ?? 1,
      delegate: options.delegate ?? 'GPU',
      video: options.video ?? {
        facingMode: 'user',
        width: { ideal: 640 },
        height: { ideal: 480 },
      },
    }
  }

  get video(): HTMLVideoElement | null {
    return this.videoElement
  }

  get isStarted(): boolean {
    return this.videoElement !== null && this.landmarker !== null
  }

  // MediaPipe HandLandmarker 초기화 + 카메라 스트림 연결
  async start(): Promise<void> {
    if (this.isStarted) return

    let didStartVideo = false

    try {
      if (!this.videoElement) {
        await this.startVideo()
        didStartVideo = true
      }

      const vision = await FilesetResolver.forVisionTasks(this.options.wasmBaseUrl)
      this.landmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: this.options.modelAssetPath,
          delegate: this.options.delegate,
        },
        runningMode: 'VIDEO',
        numHands: this.options.numHands,
      })
    } catch (error) {
      if (didStartVideo) {
        this.stop()
      }

      throw error
    }
  }

  private async startVideo(): Promise<void> {
    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      video: this.options.video,
      audio: false,
    })

    this.videoElement = document.createElement('video')
    this.videoElement.srcObject = this.mediaStream
    this.videoElement.muted = true
    this.videoElement.playsInline = true
    await this.videoElement.play()
  }

  // 매 프레임마다 손 랜드마크 21개 좌표 반환
  detect(timestampMs = performance.now()): HandTrackingResult {
    if (
      !this.videoElement ||
      !this.landmarker ||
      this.videoElement.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
    ) {
      return { hands: [], timestampMs }
    }

    if (this.videoElement.currentTime === this.lastVideoTime) {
      return { hands: [], timestampMs }
    }

    this.lastVideoTime = this.videoElement.currentTime
    const detection = this.landmarker.detectForVideo(this.videoElement, timestampMs)

    return {
      timestampMs,
      hands: detection.landmarks.map((landmarks, index) => {
        const bestHandedness = detection.handednesses[index]?.[0]

        return {
          landmarks,
          handedness: bestHandedness?.categoryName,
          score: bestHandedness?.score,
        }
      }),
    }
  }

  // 카메라 + 모델 정리
  stop(): void {
    this.landmarker?.close()
    this.landmarker = null

    this.mediaStream?.getTracks().forEach(track => track.stop())
    this.mediaStream = null

    this.videoElement?.remove()
    this.videoElement = null
    this.lastVideoTime = -1
  }
}
