import { FilesetResolver, PoseLandmarker, type NormalizedLandmark } from '@mediapipe/tasks-vision'

const MEDIAPIPE_VERSION = '0.10.21'
const DEFAULT_WASM_BASE_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`
const DEFAULT_POSE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task'

export const POSE_LANDMARK_NAMES = [
  'NOSE',
  'LEFT_EYE_INNER',
  'LEFT_EYE',
  'LEFT_EYE_OUTER',
  'RIGHT_EYE_INNER',
  'RIGHT_EYE',
  'RIGHT_EYE_OUTER',
  'LEFT_EAR',
  'RIGHT_EAR',
  'MOUTH_LEFT',
  'MOUTH_RIGHT',
  'LEFT_SHOULDER',
  'RIGHT_SHOULDER',
  'LEFT_ELBOW',
  'RIGHT_ELBOW',
  'LEFT_WRIST',
  'RIGHT_WRIST',
  'LEFT_PINKY',
  'RIGHT_PINKY',
  'LEFT_INDEX',
  'RIGHT_INDEX',
  'LEFT_THUMB',
  'RIGHT_THUMB',
  'LEFT_HIP',
  'RIGHT_HIP',
  'LEFT_KNEE',
  'RIGHT_KNEE',
  'LEFT_ANKLE',
  'RIGHT_ANKLE',
  'LEFT_HEEL',
  'RIGHT_HEEL',
  'LEFT_FOOT_INDEX',
  'RIGHT_FOOT_INDEX',
] as const

export type PoseTrackerOptions = {
  wasmBaseUrl?: string
  modelAssetPath?: string
  delegate?: 'CPU' | 'GPU'
  video?: MediaTrackConstraints
  minPoseDetectionConfidence?: number
  minPosePresenceConfidence?: number
  minTrackingConfidence?: number
}

export type TrackedPose = {
  landmarks: NormalizedLandmark[]
}

export type PoseTrackingResult = {
  poses: TrackedPose[]
  timestampMs: number
}

export class PoseTracker {
  private readonly options: Required<PoseTrackerOptions>
  private videoElement: HTMLVideoElement | null = null
  private mediaStream: MediaStream | null = null
  private landmarker: PoseLandmarker | null = null
  private lastVideoTime = -1

  constructor(options: PoseTrackerOptions = {}) {
    this.options = {
      wasmBaseUrl: options.wasmBaseUrl ?? DEFAULT_WASM_BASE_URL,
      modelAssetPath: options.modelAssetPath ?? DEFAULT_POSE_MODEL_URL,
      delegate: options.delegate ?? 'GPU',
      video: options.video ?? {
        facingMode: 'user',
        width: { ideal: 640 },
        height: { ideal: 480 },
      },
      minPoseDetectionConfidence: options.minPoseDetectionConfidence ?? 0.3,
      minPosePresenceConfidence: options.minPosePresenceConfidence ?? 0.3,
      minTrackingConfidence: options.minTrackingConfidence ?? 0.3,
    }
  }

  get video(): HTMLVideoElement | null {
    return this.videoElement
  }

  get isStarted(): boolean {
    return this.videoElement !== null && this.landmarker !== null
  }

  async start(): Promise<void> {
    if (this.isStarted) return

    const vision = await FilesetResolver.forVisionTasks(this.options.wasmBaseUrl)
    this.landmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: this.options.modelAssetPath,
        delegate: this.options.delegate,
      },
      runningMode: 'VIDEO',
      numPoses: 1,
      minPoseDetectionConfidence: this.options.minPoseDetectionConfidence,
      minPosePresenceConfidence: this.options.minPosePresenceConfidence,
      minTrackingConfidence: this.options.minTrackingConfidence,
    })

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

  detect(timestampMs = performance.now()): PoseTrackingResult {
    if (
      !this.videoElement ||
      !this.landmarker ||
      this.videoElement.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
    ) {
      return { poses: [], timestampMs }
    }

    if (this.videoElement.currentTime === this.lastVideoTime) {
      return { poses: [], timestampMs }
    }

    this.lastVideoTime = this.videoElement.currentTime
    const detection = this.landmarker.detectForVideo(this.videoElement, timestampMs)

    return {
      timestampMs,
      poses: detection.landmarks.map(landmarks => ({ landmarks })),
    }
  }

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
