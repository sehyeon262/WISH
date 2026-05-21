export type RomJointId = 'elbow' | 'shoulder' | 'hip' | 'knee'

export const ROM_CAPTURE_WARN_PERCENT = 60
export const ROM_CONFIDENCE_GOOD_PERCENT = 80
export const ROM_BALANCE_ATTENTION_DEG = 15

export type RomJointGroup = {
  id: RomJointId
  name: string
  step: number
  leftJointName: string
  rightJointName: string
}

export type RomJointTrendPoint = {
  label: string
  motionName: string
  rangeDeg: number | null
  confidencePercent: number | null
}

export type RomExcludedSegment = {
  motionName: string
  startMs: number | null
  endMs: number | null
  reason: string | null
}

export type RomJointDetail = RomJointGroup & {
  analysisAvailable: boolean
  currentRangeDeg: number | null
  leftRangeDeg: number | null
  rightRangeDeg: number | null
  minAngleDeg: number | null
  maxAngleDeg: number | null
  coveragePercent: number | null
  confidencePercent: number | null
  validFrameCount: number
  motionCount: number
  analyzedMotionCount: number
  analyzedDurationMs: number
  excludedDurationMs: number
  excludedSegments: RomExcludedSegment[]
  trend: RomJointTrendPoint[]
  insight: string
  tip: string
}

export type RomMovementAnalysisView = {
  sessionId: number
  exerciseType: string
  createdAt: string
  motionCount: number
  analyzedMotionCount: number
  failedMotionCount: number
  joints: RomJointDetail[]
}

export const ROM_JOINT_GROUPS: ReadonlyArray<RomJointGroup> = [
  {
    id: 'elbow',
    name: '팔꿈치',
    step: 1,
    leftJointName: 'LEFT_ELBOW',
    rightJointName: 'RIGHT_ELBOW',
  },
  {
    id: 'shoulder',
    name: '어깨',
    step: 2,
    leftJointName: 'LEFT_SHOULDER',
    rightJointName: 'RIGHT_SHOULDER',
  },
  {
    id: 'hip',
    name: '고관절',
    step: 3,
    leftJointName: 'LEFT_HIP',
    rightJointName: 'RIGHT_HIP',
  },
  {
    id: 'knee',
    name: '무릎',
    step: 4,
    leftJointName: 'LEFT_KNEE',
    rightJointName: 'RIGHT_KNEE',
  },
]
