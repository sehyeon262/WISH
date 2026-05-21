/**
 * 동작별 더미 mocap 시계열.
 *
 * AI 백엔드가 제공할 데이터 포맷에 맞춰 작성:
 *   - hip 중심으로 정규화된 12개 관절 좌표
 *   - 어깨너비를 1로 한 무차원 스케일
 *   - x: 오른쪽이 양수, y: 아래가 양수(MediaPipe 컨벤션), z: 카메라 쪽이 음수
 *   - 한 프레임 = 12 landmark × [x, y, z, confidence]
 *
 * 실제 AI 데이터가 들어오면 동일 포맷으로 swap만 하면 됨.
 */

export const LANDMARK_NAMES = [
  'NOSE',
  'LEFT_EAR',
  'RIGHT_EAR',
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

export type LandmarkName = (typeof LANDMARK_NAMES)[number]

export type Landmark = readonly [number | null, number | null, number | null, number]

export type MotionFrame = {
  /** 프레임 시각 (ms, 시작점 0) */
  t: number
  /** LANDMARK_NAMES 순서대로 12개 좌표 */
  lm: readonly Landmark[]
}

export type MotionClip = {
  id: string
  name: string
  fps: number
  durationMs: number
  landmarks: readonly LandmarkName[]
  frames: readonly MotionFrame[]
  source?: 'dummy' | 'recorded' | 'compact'
  representativeSegment?: {
    startMs: number
    endMs: number
    reason?: string | null
  } | null
  markers?:
    | readonly {
        startMs: number
        endMs: number
        reason?: string | null
      }[]
    | null
}

const FPS = 30
const DUR_SEC = 3
const FRAME_COUNT = FPS * DUR_SEC
const FRAME_DT = 1000 / FPS

/** 정규화 좌표계의 기본(rest) 자세 — 똑바로 서서 팔 살짝 옆으로 */
const REST: Record<LandmarkName, [number, number, number]> = {
  NOSE: [0, -1.55, -0.08],
  LEFT_EAR: [-0.22, -1.48, -0.05],
  RIGHT_EAR: [0.22, -1.48, -0.05],
  LEFT_SHOULDER: [-0.5, -1.1, -0.05],
  RIGHT_SHOULDER: [0.5, -1.1, -0.05],
  LEFT_ELBOW: [-0.62, -0.55, -0.05],
  RIGHT_ELBOW: [0.62, -0.55, -0.05],
  LEFT_WRIST: [-0.68, 0.0, -0.05],
  RIGHT_WRIST: [0.68, 0.0, -0.05],
  LEFT_PINKY: [-0.75, 0.02, -0.05],
  RIGHT_PINKY: [0.75, 0.02, -0.05],
  LEFT_INDEX: [-0.72, -0.02, -0.06],
  RIGHT_INDEX: [0.72, -0.02, -0.06],
  LEFT_THUMB: [-0.64, -0.02, -0.08],
  RIGHT_THUMB: [0.64, -0.02, -0.08],
  LEFT_HIP: [-0.22, 0.0, 0.0],
  RIGHT_HIP: [0.22, 0.0, 0.0],
  LEFT_KNEE: [-0.24, 1.0, 0.02],
  RIGHT_KNEE: [0.24, 1.0, 0.02],
  LEFT_ANKLE: [-0.25, 1.95, 0.05],
  RIGHT_ANKLE: [0.25, 1.95, 0.05],
  LEFT_HEEL: [-0.28, 2.02, 0.02],
  RIGHT_HEEL: [0.28, 2.02, 0.02],
  LEFT_FOOT_INDEX: [-0.25, 2.13, -0.1],
  RIGHT_FOOT_INDEX: [0.25, 2.13, -0.1],
}

type Modifier = (
  /** 0 ~ 1 사이의 정규화 진행도 */
  progress: number,
  /** 사인 한 사이클(2π) 위상 */
  phase: number,
) => Partial<Record<LandmarkName, [number, number, number]>>

function buildClip(id: string, name: string, modify: Modifier): MotionClip {
  const frames: MotionFrame[] = []
  for (let i = 0; i < FRAME_COUNT; i++) {
    const progress = i / (FRAME_COUNT - 1)
    const phase = progress * Math.PI * 2 * 2 // 두 사이클
    const overrides = modify(progress, phase)
    const lm = LANDMARK_NAMES.map<Landmark>(name => {
      const base = REST[name]
      const delta = overrides[name] ?? [0, 0, 0]
      return [base[0] + delta[0], base[1] + delta[1], base[2] + delta[2], 1]
    })
    frames.push({ t: Math.round(i * FRAME_DT), lm })
  }
  return {
    id,
    name,
    fps: FPS,
    durationMs: Math.round((FRAME_COUNT - 1) * FRAME_DT),
    landmarks: LANDMARK_NAMES,
    frames,
    source: 'dummy',
  }
}

/** 제자리 걷기: 무릎/엉덩이 교대 들기 + 반대 팔 흔들기 */
const march = buildClip('march', '제자리 걷기', (_p, phase) => {
  const liftL = Math.max(0, Math.sin(phase)) * 0.35
  const liftR = Math.max(0, Math.sin(phase + Math.PI)) * 0.35
  const armSwingL = Math.sin(phase + Math.PI) * 0.25
  const armSwingR = Math.sin(phase) * 0.25
  return {
    LEFT_KNEE: [0, -liftL, liftL * 0.5],
    LEFT_ANKLE: [0, -liftL * 1.4, liftL * 0.7],
    RIGHT_KNEE: [0, -liftR, liftR * 0.5],
    RIGHT_ANKLE: [0, -liftR * 1.4, liftR * 0.7],
    LEFT_ELBOW: [0, armSwingL * 0.4, -armSwingL * 0.6],
    LEFT_WRIST: [0, armSwingL, -armSwingL * 1.0],
    RIGHT_ELBOW: [0, armSwingR * 0.4, -armSwingR * 0.6],
    RIGHT_WRIST: [0, armSwingR, -armSwingR * 1.0],
  }
})

/** 사이드 스텝: 다리 좌우 벌림 + 무게중심 좌우 이동 */
const sideStep = buildClip('side-step', '사이드 스텝', (_p, phase) => {
  const sway = Math.sin(phase) * 0.18
  const spread = Math.abs(Math.sin(phase)) * 0.18
  return {
    LEFT_HIP: [-sway, 0, 0],
    RIGHT_HIP: [-sway, 0, 0],
    LEFT_SHOULDER: [-sway * 0.6, 0, 0],
    RIGHT_SHOULDER: [-sway * 0.6, 0, 0],
    LEFT_KNEE: [-spread, 0, 0],
    LEFT_ANKLE: [-spread, 0, 0],
    RIGHT_KNEE: [spread, 0, 0],
    RIGHT_ANKLE: [spread, 0, 0],
  }
})

/** 몸통 가로 지르기: 한 손이 반대편 어깨로 교차하며 반대편 발이 옆으로 스텝 */
const torsoCross = buildClip('torso-cross', '몸통 가로 지르기', (_p, phase) => {
  const reachL = Math.max(0, Math.sin(phase))
  const reachR = Math.max(0, Math.sin(phase + Math.PI))
  return {
    LEFT_ELBOW: [0.4 * reachL, -0.2 * reachL, -0.15 * reachL],
    LEFT_WRIST: [0.95 * reachL, -0.55 * reachL, -0.25 * reachL],
    RIGHT_ELBOW: [-0.4 * reachR, -0.2 * reachR, -0.15 * reachR],
    RIGHT_WRIST: [-0.95 * reachR, -0.55 * reachR, -0.25 * reachR],
    // 같은 쪽 발이 팔 뻗는 방향 반대로 step-out (왼팔→오른쪽이면 왼발은 왼쪽으로)
    LEFT_KNEE: [-0.18 * reachL, -0.12 * reachL, 0],
    LEFT_ANKLE: [-0.26 * reachL, -0.18 * reachL, 0],
    RIGHT_KNEE: [0.18 * reachR, -0.12 * reachR, 0],
    RIGHT_ANKLE: [0.26 * reachR, -0.18 * reachR, 0],
  }
})

/** 얼굴 가로 지르기: 손이 반대편 얼굴 옆까지 올라오며 반대편 발이 옆으로 스텝 */
const faceCross = buildClip('face-cross', '얼굴 가로 지르기', (_p, phase) => {
  const reachL = Math.max(0, Math.sin(phase))
  const reachR = Math.max(0, Math.sin(phase + Math.PI))
  return {
    LEFT_ELBOW: [0.55 * reachL, -0.55 * reachL, -0.18 * reachL],
    LEFT_WRIST: [0.85 * reachL, -1.1 * reachL, -0.3 * reachL],
    RIGHT_ELBOW: [-0.55 * reachR, -0.55 * reachR, -0.18 * reachR],
    RIGHT_WRIST: [-0.85 * reachR, -1.1 * reachR, -0.3 * reachR],
    RIGHT_KNEE: [0.18 * reachL, -0.12 * reachL, 0],
    RIGHT_ANKLE: [0.26 * reachL, -0.18 * reachL, 0],
    LEFT_KNEE: [-0.18 * reachR, -0.12 * reachR, 0],
    LEFT_ANKLE: [-0.26 * reachR, -0.18 * reachR, 0],
  }
})

/** 앉았다 일어서기: 엉덩이 다운, 무릎 굽힘, 발목 정지 */
const sitStand = buildClip('sit-stand', '앉았다 일어서기', (_p, phase) => {
  const dip = Math.max(0, Math.sin(phase)) * 0.55
  return {
    LEFT_SHOULDER: [0, dip * 0.9, dip * 0.1],
    RIGHT_SHOULDER: [0, dip * 0.9, dip * 0.1],
    LEFT_ELBOW: [0, dip * 0.9, dip * 0.1],
    RIGHT_ELBOW: [0, dip * 0.9, dip * 0.1],
    LEFT_WRIST: [0, dip * 0.9, dip * 0.1],
    RIGHT_WRIST: [0, dip * 0.9, dip * 0.1],
    LEFT_HIP: [0, dip, dip * 0.15],
    RIGHT_HIP: [0, dip, dip * 0.15],
    LEFT_KNEE: [-0.05 * dip, dip * 0.5, dip * 0.4],
    RIGHT_KNEE: [0.05 * dip, dip * 0.5, dip * 0.4],
  }
})

export const MOTION_CLIPS: Readonly<Record<string, MotionClip>> = {
  march,
  'side-step': sideStep,
  'torso-cross': torsoCross,
  'face-cross': faceCross,
  'sit-stand': sitStand,
}
