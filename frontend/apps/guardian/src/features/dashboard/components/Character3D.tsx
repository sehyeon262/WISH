import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
} from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, useAnimations, useGLTF } from '@react-three/drei'
import { SkeletonUtils } from 'three-stdlib'
import { Matrix4, MathUtils, Quaternion, Vector3, type Bone, type Group } from 'three'
import squatGlbUrl from '@/assets/squat.glb?url'
import walkingGlbUrl from '@/assets/walking.glb?url'
import wishGlbUrl from '@/assets/wish.glb?url'
import { OneEuro1D, type OneEuroFilterOptions } from '@/shared/lib/oneEuroFilter'
import type { Landmark, LandmarkName, MotionClip, MotionFrame } from '../data/motionClips'
import { LANDMARK_NAMES } from '../data/motionClips'
import { MinusIcon, PersonIcon, PlusIcon, RefreshIcon } from './icons'
import styles from './Character3D.module.css'

useGLTF.preload(wishGlbUrl)
useGLTF.preload(walkingGlbUrl)
useGLTF.preload(squatGlbUrl)

/**
 * 동작 id → GLB 클립 이름 매핑.
 * 별도 GLB(walking/squat)에서 클립만 추출해 wish.glb 캐릭터에 적용 (재질 일관성 유지).
 */
const MOTION_CLIP_NAME: Record<string, string> = {
  march: 'Armature|walking_man|baselayer',
  'sit-stand': 'Armature|air_squat|baselayer',
}

const BASE_SCALE = 1.0
const MODEL_OFFSET_Y = -0.95

const KP_SCALE = 0.43
const HIP_LOCAL_Y = 0.85
// Front-facing replay should be driven mostly by x/y; z is noisy and can twist limbs backward.
const RETARGET_MIN_DIRECTION_LENGTH = 0.001
const TORSO_GUARD_VERTICAL_PADDING = 0.04
const TORSO_MIN_SHOULDER_SPAN = 0.08
/**
 * Cross-body 의도 인식:
 *  - 손목 x 가 신체 중앙선(어깨중앙)을 넘어 반대편 어깨 라인까지 얼마나 진입했는지를 [0..1] factor 로 환산.
 *  - factor 가 ENGAGE 임계 이상이면 TORSO_GUARD 의 side margin clamp 를 해제 (팔이 몸통을 가로지르는 동작 허용).
 *  - factor 가 커질수록 z forward push 도 비례로 약화 (이미 앞으로 뻗는 동작은 guard 가 더 끼어들면 짧아 보임).
 *  - 대각선 몸통 지르기, 반대 어깨 터치 같은 cross-body 운동에서 팔이 꺾여 끝나는 현상 방지.
 */
// 디버그 슬라이더로 runtime 조정: crossBodyEngageFactor, crossBodyForwardZFalloff.
// Keep a small reach margin because replay landmarks and GLB arm length are not identical.
// 디버그 슬라이더로 runtime 조정: armIk* / *SlerpFactor 들 — TUNABLE_PARAMS 참조.
const ARM_IK_MIN_REACH_RATIO = 0.18
const ARM_IK_CROSS_BODY_OBSERVED_POLE_WEIGHT = 0.45
// Yaw/roll/pitch 클램프: 너무 빡빡하면 정면 고정처럼 보임.
// torsoMaxYawRad / torsoPitchScale 은 디버그 슬라이더(TUNABLE_PARAMS)에서 매 frame 읽음.
const TORSO_MAX_ROLL_RAD = Math.PI * 0.1
const TORSO_MAX_PITCH_RAD = Math.PI * 0.18
const TORSO_YAW_SCALE = 0.55
const TORSO_ROLL_SCALE = 0.5
// 디버그 슬라이더로 runtime 조정: shoulderMaxRotationRad, upperLimbMaxRotationRad, lowerLimbMaxRotationRad, handSlerpFactor.
const NECK_MAX_ROTATION_RAD = Math.PI * 0.14
const HEAD_MAX_ROTATION_RAD = Math.PI * 0.12
const HAND_MAX_ROTATION_RAD = Math.PI * 0.55
const LOCAL_X_AXIS = new Vector3(1, 0, 0)
const LOCAL_Y_AXIS = new Vector3(0, 1, 0)
const LOCAL_Z_AXIS = new Vector3(0, 0, 1)

/**
 * 5fps 저장 클립을 ~60fps 렌더에서 부드럽게 재생하기 위한 보간/필터 파라미터.
 *  - LM_FILTER_OPTIONS: 1-Euro 필터. minCutoff 낮을수록 떨림은 죽지만 지연이 늘어남.
 *  - INTERPOLATION_MAX_GAP_MS: 이 시간 이상 떨어진 frame은 보간하지 않고 가장 가까운 값 사용
 *    (긴 트래킹 결손 구간에서 잘못된 직선 보간 방지).
 */
const LM_FILTER_OPTIONS: OneEuroFilterOptions = { minCutoff: 1.0, beta: 0.03, dCutoff: 1.0 }
const INTERPOLATION_MAX_GAP_MS = 500

/**
 * 사용자 rest 캘리브레이션:
 *  - 모션 시작 시점 ~CALIBRATION_FRAME_COUNT 프레임을 모아 평균 → 사용자 rest 자세로 간주.
 *  - 본 chain별로 (parent→child) 방향을 사용자 rest 기준 좌표계 → GLB rest 좌표계로
 *    매핑하는 quaternion offset(calibrationDeltas)을 만들어, 이후 frame의 desired 방향을
 *    이 offset으로 보정해서 retarget에 사용함.
 *  - 캘리브레이션이 끝나기 전엔 GLB rest 그대로 유지.
 */
const CALIBRATION_FRAME_COUNT = 6
const CALIBRATION_MIN_CONFIDENCE = 0.2

/** UpLeg 본 위치(허리 라인)를 시각적 hip(엉덩이) 라인으로 내리는 오프셋 */
const HIP_Y_OFFSET = -0.18

/**
 * 캐릭터 본 retargeting on/off.
 * 더미 sin 기반 keypoint로는 자세가 자연스럽게 안 나옴 + 본 rest pose 보정이 GLB마다 까다로워
 * 현재는 비활성화. GLB에 동작 클립이 직접 들어오면 useAnimations로 갈아끼울 예정.
 * 실제 mocap 데이터(아이별)가 들어오는 시점에 다시 활성화해서 좌표·정규화 검증 후 안정화 작업.
 */
const ENABLE_BONE_RETARGETING = true

/**
 * 길 2 실험 결과를 default 로 반영한 retargeting 메커니즘 토글.
 *  - restCalibration (default: false): 시작 6프레임으로 사용자 rest 자세를 추정해 GLB rest 에 매핑.
 *    실측 결과 시작 자세가 "박혀버려" 다리 들림/팔 T-포즈 등 부작용 발생 → 기본 OFF.
 *    구현 코드는 유지 — 추후 부분 적용(예: 상체만) 등 개선 시도 시 다시 켜볼 수 있게.
 *  - lmFilter (default: true): 1-Euro 필터로 landmark 시계열 떨림 평활화. 다양한 동작에서 떨림 제거 효과 확인 → 기본 ON.
 *
 * 디버그 패널은 dev 모드(`import.meta.env.DEV`) 에서만 표시. production 빌드에는 노출 안 됨.
 * Module-level mutable object 라서 useFrame 이 매 frame 최신 값을 즉시 읽음 (React re-render 불필요).
 */
/**
 * 캘리브레이션 on/off:
 *  - 시작 6프레임으로 사용자 rest 자세를 추정해 GLB rest 에 매핑.
 *  - 실측 결과 다리 들림/팔 T-포즈 부작용이 있어 기본 비활성화.
 *  - 구현 코드(accumulateCalibration / buildCalibrationDeltas 등)는 유지 — 추후 부분 적용 시 재활용.
 */
const ENABLE_REST_CALIBRATION = false

// ── 깊이/척추/슬러프 ──
const DEPTH_DAMPING_RATIO = 0.4
const TORSO_PITCH_SCALE = 1.5
const TORSO_MAX_YAW_RAD = Math.PI * 0.33
const RETARGET_SLERP_FACTOR = 0.55
// ── 팔 IK ──
const ARM_IK_MAX_REACH_RATIO = 1.25
const ARM_IK_ELBOW_SIDE_BIAS = 0.7
const ARM_IK_ELBOW_FORWARD_BIAS = 0.3
const ARM_IK_OBSERVED_POLE_WEIGHT = 0.85
// ── 몸통 보호 가드 / cross-body ──
const CROSS_BODY_ENGAGE_FACTOR = 0.12
const CROSS_BODY_FORWARD_Z_FALLOFF = 1.0
const TORSO_GUARD_FORWARD_Z = 0.04
const TORSO_GUARD_SIDE_MARGIN_RATIO = 0.05
// ── 부위별 부드러움 (slerp) ──
const UPPER_BODY_SLERP_FACTOR = 0.28
const SHOULDER_RETARGET_SLERP_FACTOR = 0.32
const HEAD_RETARGET_SLERP_FACTOR = 0.24
const HAND_RETARGET_SLERP_FACTOR = 0.3
// ── 어깨/사지 회전 한계 ──
const RETARGET_UPPER_LIMB_MAX_ROTATION_RAD = Math.PI * 0.83
const RETARGET_LOWER_LIMB_MAX_ROTATION_RAD = Math.PI * 0.86
const SHOULDER_MAX_ROTATION_RAD = Math.PI * 0.25

/**
 * sin 기반 더미 마커 motion playback on/off.
 * 클립이 없는 동작(사이드 스텝/몸통 가로 지르기/얼굴 가로 지르기)에서 마커가 sin 패턴으로
 * 움직이는 게 어색해서 비활성. 해당 동작들도 추후 GLB 클립 추가될 예정이라 그때까진 정적 유지.
 */
const ENABLE_SIN_MARKER_MOTION = false

const KP_TO_JOINT_ID: Record<LandmarkName, string> = {
  NOSE: 'head',
  LEFT_EAR: 'ear-l',
  RIGHT_EAR: 'ear-r',
  LEFT_SHOULDER: 'shoulder-l',
  RIGHT_SHOULDER: 'shoulder-r',
  LEFT_ELBOW: 'elbow-l',
  RIGHT_ELBOW: 'elbow-r',
  LEFT_WRIST: 'wrist-l',
  RIGHT_WRIST: 'wrist-r',
  LEFT_PINKY: 'pinky-l',
  RIGHT_PINKY: 'pinky-r',
  LEFT_INDEX: 'index-l',
  RIGHT_INDEX: 'index-r',
  LEFT_THUMB: 'thumb-l',
  RIGHT_THUMB: 'thumb-r',
  LEFT_HIP: 'hip-l',
  RIGHT_HIP: 'hip-r',
  LEFT_KNEE: 'knee-l',
  RIGHT_KNEE: 'knee-r',
  LEFT_ANKLE: 'ankle-l',
  RIGHT_ANKLE: 'ankle-r',
  LEFT_HEEL: 'heel-l',
  RIGHT_HEEL: 'heel-r',
  LEFT_FOOT_INDEX: 'foot-index-l',
  RIGHT_FOOT_INDEX: 'foot-index-r',
}

/** 마커 id → 추적할 Mixamo 본 이름 (클립 재생 중 마커가 본 따라가도록) */
const JOINT_ID_TO_BONE: Record<string, string> = {
  'shoulder-l': 'LeftArm',
  'shoulder-r': 'RightArm',
  'elbow-l': 'LeftForeArm',
  'elbow-r': 'RightForeArm',
  'wrist-l': 'LeftHand',
  'wrist-r': 'RightHand',
  'hip-l': 'LeftUpLeg',
  'hip-r': 'RightUpLeg',
  'knee-l': 'LeftLeg',
  'knee-r': 'RightLeg',
  'ankle-l': 'LeftFoot',
  'ankle-r': 'RightFoot',
}

/**
 * Mixamo 본 chain.
 *  - 본을 회전시켜 (parentKp → childKp) 방향을 따라가게 한다.
 *  - childBone은 rest 상태에서의 자식 본 (rest world direction 계산에만 사용).
 *  - 처리 순서는 부모부터: 자식 본 처리 시 부모의 새 회전이 반영된 matrixWorld를 사용해야 함.
 */
const BONE_CHAINS: ReadonlyArray<{
  bone: string
  childBone: string
  parentKp: LandmarkName
  childKp: LandmarkName
  maxRotationRad: number
}> = [
  {
    bone: 'LeftArm',
    childBone: 'LeftForeArm',
    parentKp: 'LEFT_SHOULDER',
    childKp: 'LEFT_ELBOW',
    maxRotationRad: RETARGET_UPPER_LIMB_MAX_ROTATION_RAD,
  },
  {
    bone: 'LeftForeArm',
    childBone: 'LeftHand',
    parentKp: 'LEFT_ELBOW',
    childKp: 'LEFT_WRIST',
    maxRotationRad: RETARGET_LOWER_LIMB_MAX_ROTATION_RAD,
  },
  {
    bone: 'RightArm',
    childBone: 'RightForeArm',
    parentKp: 'RIGHT_SHOULDER',
    childKp: 'RIGHT_ELBOW',
    maxRotationRad: RETARGET_UPPER_LIMB_MAX_ROTATION_RAD,
  },
  {
    bone: 'RightForeArm',
    childBone: 'RightHand',
    parentKp: 'RIGHT_ELBOW',
    childKp: 'RIGHT_WRIST',
    maxRotationRad: RETARGET_LOWER_LIMB_MAX_ROTATION_RAD,
  },
  {
    bone: 'LeftUpLeg',
    childBone: 'LeftLeg',
    parentKp: 'LEFT_HIP',
    childKp: 'LEFT_KNEE',
    maxRotationRad: RETARGET_UPPER_LIMB_MAX_ROTATION_RAD,
  },
  {
    bone: 'LeftLeg',
    childBone: 'LeftFoot',
    parentKp: 'LEFT_KNEE',
    childKp: 'LEFT_ANKLE',
    maxRotationRad: RETARGET_LOWER_LIMB_MAX_ROTATION_RAD,
  },
  {
    bone: 'RightUpLeg',
    childBone: 'RightLeg',
    parentKp: 'RIGHT_HIP',
    childKp: 'RIGHT_KNEE',
    maxRotationRad: RETARGET_UPPER_LIMB_MAX_ROTATION_RAD,
  },
  {
    bone: 'RightLeg',
    childBone: 'RightFoot',
    parentKp: 'RIGHT_KNEE',
    childKp: 'RIGHT_ANKLE',
    maxRotationRad: RETARGET_LOWER_LIMB_MAX_ROTATION_RAD,
  },
]

// 이 chain 들은 rest direction 계산(useEffect)에만 쓰이고, runtime maxRotation/slerp 는
// applyUpperBodyRetargeting 함수 본문에서 TUNABLE_PARAMS 를 직접 참조하므로 필드 불필요.
const UPPER_BODY_DIRECTION_CHAINS = [
  { bone: 'LeftShoulder', childBone: 'LeftArm' },
  { bone: 'RightShoulder', childBone: 'RightArm' },
  { bone: 'neck', childBone: 'Head' },
  { bone: 'Head', childBone: 'headfront' },
] as const

const UPPER_BODY_LOCAL_BONES = ['Spine', 'Spine01', 'Spine02'] as const
const DIRECTION_REST_CHAINS = [...BONE_CHAINS, ...UPPER_BODY_DIRECTION_CHAINS]

type Joint = { id: string; position: [number, number, number] }

const FALLBACK_JOINTS: Joint[] = [
  { id: 'head', position: [0, 1.54, 0.05] },
  { id: 'ear-l', position: [-0.12, 1.48, 0.05] },
  { id: 'ear-r', position: [0.12, 1.48, 0.05] },
  { id: 'shoulder-l', position: [-0.18, 1.3, 0.06] },
  { id: 'shoulder-r', position: [0.18, 1.3, 0.06] },
  { id: 'elbow-l', position: [-0.22, 1.0, 0.05] },
  { id: 'elbow-r', position: [0.22, 1.0, 0.05] },
  { id: 'wrist-l', position: [-0.24, 0.7, 0.05] },
  { id: 'wrist-r', position: [0.24, 0.7, 0.05] },
  { id: 'pinky-l', position: [-0.28, 0.68, 0.05] },
  { id: 'pinky-r', position: [0.28, 0.68, 0.05] },
  { id: 'index-l', position: [-0.27, 0.69, 0.05] },
  { id: 'index-r', position: [0.27, 0.69, 0.05] },
  { id: 'thumb-l', position: [-0.23, 0.7, 0.05] },
  { id: 'thumb-r', position: [0.23, 0.7, 0.05] },
  { id: 'hip-l', position: [-0.1, 0.62, 0.06] },
  { id: 'hip-r', position: [0.1, 0.62, 0.06] },
  { id: 'knee-l', position: [-0.1, 0.4, 0.06] },
  { id: 'knee-r', position: [0.1, 0.4, 0.06] },
  { id: 'ankle-l', position: [-0.1, 0.05, 0.06] },
  { id: 'ankle-r', position: [0.1, 0.05, 0.06] },
  { id: 'heel-l', position: [-0.11, 0.02, 0.07] },
  { id: 'heel-r', position: [0.11, 0.02, 0.07] },
  { id: 'foot-index-l', position: [-0.1, 0, 0.0] },
  { id: 'foot-index-r', position: [0.1, 0, 0.0] },
]

const FALLBACK_JOINT_BY_ID = new Map(FALLBACK_JOINTS.map(joint => [joint.id, joint]))
const DEFAULT_JOINT_POSITION: [number, number, number] = [0, 0, 0]
const ARM_ELBOW_LANDMARK_NAMES = new Set<LandmarkName>(['LEFT_ELBOW', 'RIGHT_ELBOW'])
const ARM_TARGET_LANDMARK_NAMES = new Set<LandmarkName>([
  'LEFT_ELBOW',
  'RIGHT_ELBOW',
  'LEFT_WRIST',
  'RIGHT_WRIST',
])
type ArmSide = 'LEFT' | 'RIGHT'
const ARM_KPS_BY_SIDE = {
  LEFT: {
    shoulder: 'LEFT_SHOULDER',
    elbow: 'LEFT_ELBOW',
    wrist: 'LEFT_WRIST',
  },
  RIGHT: {
    shoulder: 'RIGHT_SHOULDER',
    elbow: 'RIGHT_ELBOW',
    wrist: 'RIGHT_WRIST',
  },
} as const satisfies Record<
  ArmSide,
  { shoulder: LandmarkName; elbow: LandmarkName; wrist: LandmarkName }
>

type ArmIkScratch = {
  shoulder: Vector3
  elbow: Vector3
  wrist: Vector3
  targetElbow: Vector3
  targetWrist: Vector3
  chainDir: Vector3
  projectedBase: Vector3
  observedPole: Vector3
  fallbackPole: Vector3
  pole: Vector3
  leftShoulder: Vector3
  rightShoulder: Vector3
  leftHip: Vector3
  rightHip: Vector3
  bodyRight: Vector3
  bodyUp: Vector3
  bodyForward: Vector3
}

type DirectionRetargetScratch = {
  startWorld: Vector3
  endWorld: Vector3
  desiredDir: Vector3
  restDir: Vector3
  parentPosition: Vector3
  parentRotation: Quaternion
  parentScale: Vector3
  parentInvRotation: Quaternion
  delta: Quaternion
  targetRotation: Quaternion
}

type UpperBodyScratch = {
  leftShoulder: Vector3
  rightShoulder: Vector3
  leftHip: Vector3
  rightHip: Vector3
  nose: Vector3
  leftEar: Vector3
  rightEar: Vector3
  shoulderCenter: Vector3
  hipCenter: Vector3
  headCenter: Vector3
  targetStart: Vector3
  targetEnd: Vector3
  yawRotation: Quaternion
  rollRotation: Quaternion
  pitchRotation: Quaternion
  targetRotation: Quaternion
}

function isFiniteVector3(v: Vector3): boolean {
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z)
}

function normalizeDirection(v: Vector3): boolean {
  const lengthSq = v.lengthSq()
  if (!Number.isFinite(lengthSq) || lengthSq <= RETARGET_MIN_DIRECTION_LENGTH) return false
  v.normalize()
  return isFiniteVector3(v)
}

function limitDirectionFromRest(restDir: Vector3, desiredDir: Vector3, maxRadians: number): void {
  const angle = restDir.angleTo(desiredDir)
  if (!Number.isFinite(angle) || angle <= maxRadians) return

  desiredDir.copy(restDir).lerp(desiredDir, maxRadians / angle)
  normalizeDirection(desiredDir)
}

function isArmElbowLandmark(name: LandmarkName): boolean {
  return ARM_ELBOW_LANDMARK_NAMES.has(name)
}

function isArmTargetLandmark(name: LandmarkName): boolean {
  return ARM_TARGET_LANDMARK_NAMES.has(name)
}

function isLeftSideLandmark(name: LandmarkName): boolean {
  return name.startsWith('LEFT_')
}

function getArmSide(parentKp: LandmarkName, childKp: LandmarkName): ArmSide | null {
  if (
    (parentKp === 'LEFT_SHOULDER' && childKp === 'LEFT_ELBOW') ||
    (parentKp === 'LEFT_ELBOW' && childKp === 'LEFT_WRIST')
  ) {
    return 'LEFT'
  }
  if (
    (parentKp === 'RIGHT_SHOULDER' && childKp === 'RIGHT_ELBOW') ||
    (parentKp === 'RIGHT_ELBOW' && childKp === 'RIGHT_WRIST')
  ) {
    return 'RIGHT'
  }
  return null
}

function getArmSideSign(side: ArmSide): number {
  return side === 'LEFT' ? -1 : 1
}

function getArmSideFromLandmark(name: LandmarkName): ArmSide | null {
  if (name === 'LEFT_ELBOW' || name === 'LEFT_WRIST') return 'LEFT'
  if (name === 'RIGHT_ELBOW' || name === 'RIGHT_WRIST') return 'RIGHT'
  return null
}

// 모듈 레벨 임시 Vector3 — mutateTorsoGuardedArmPoint 가 매 frame 여러 번 호출되므로 할당 회피.
const tmpCrossBodyWrist = new Vector3()

/**
 * 손목이 신체 중앙선을 넘어 반대편으로 얼마나 진입했는지를 [0..1] factor 로 반환.
 *  - 0: 자기 쪽에 있음 (정상 자세)
 *  - 1: 손목이 반대편 어깨 라인 또는 그 너머까지 도달 (대각선 지르기/반대 어깨 터치 등)
 */
function computeCrossBodyFactor(
  frame: MotionFrame,
  clip: MotionClip,
  side: ArmSide,
  leftShoulder: Vector3,
  rightShoulder: Vector3,
): number {
  const wristKp: LandmarkName = side === 'LEFT' ? 'LEFT_WRIST' : 'RIGHT_WRIST'
  if (!tryReadRetargetKp(frame, clip, wristKp, tmpCrossBodyWrist)) return 0
  const midX = (leftShoulder.x + rightShoulder.x) * 0.5
  const halfSpan = Math.abs(rightShoulder.x - leftShoulder.x) * 0.5
  if (!Number.isFinite(halfSpan) || halfSpan <= TORSO_MIN_SHOULDER_SPAN * 0.5) return 0
  // 왼팔: x>midX 이면 오른쪽으로 가로지름. 오른팔: x<midX 이면 왼쪽으로 가로지름.
  const crossing = side === 'LEFT' ? tmpCrossBodyWrist.x - midX : midX - tmpCrossBodyWrist.x
  if (crossing <= 0) return 0
  return Math.min(1, crossing / halfSpan)
}

function mutateTorsoGuardedArmPoint(
  frame: MotionFrame,
  clip: MotionClip,
  childKp: LandmarkName,
  point: Vector3,
  leftShoulder: Vector3,
  rightShoulder: Vector3,
  leftHip: Vector3,
  rightHip: Vector3,
): void {
  if (!isArmTargetLandmark(childKp)) return
  if (
    !tryReadRetargetKp(frame, clip, 'LEFT_SHOULDER', leftShoulder) ||
    !tryReadRetargetKp(frame, clip, 'RIGHT_SHOULDER', rightShoulder) ||
    !tryReadRetargetKp(frame, clip, 'LEFT_HIP', leftHip) ||
    !tryReadRetargetKp(frame, clip, 'RIGHT_HIP', rightHip)
  ) {
    return
  }
  if (
    !isFiniteVector3(leftShoulder) ||
    !isFiniteVector3(rightShoulder) ||
    !isFiniteVector3(leftHip) ||
    !isFiniteVector3(rightHip)
  ) {
    return
  }

  const shoulderSpan = Math.abs(rightShoulder.x - leftShoulder.x)
  if (!Number.isFinite(shoulderSpan) || shoulderSpan <= TORSO_MIN_SHOULDER_SPAN) return

  const topY = Math.max(leftShoulder.y, rightShoulder.y) + TORSO_GUARD_VERTICAL_PADDING
  const bottomY = Math.min(leftHip.y, rightHip.y) - TORSO_GUARD_VERTICAL_PADDING
  if (point.y > topY || point.y < bottomY) return

  const torsoMinX = Math.min(leftShoulder.x, rightShoulder.x, leftHip.x, rightHip.x)
  const torsoMaxX = Math.max(leftShoulder.x, rightShoulder.x, leftHip.x, rightHip.x)
  const centerZ = (leftShoulder.z + rightShoulder.z + leftHip.z + rightHip.z) / 4

  // Cross-body 의도 (대각선 지르기/반대 어깨 터치 등) 인식 — 손목이 반대편으로 진입한 비율 [0..1].
  // factor 가 클수록 TORSO_GUARD 의 측면 클램프/z forward push 를 비례로 약화시킴.
  const side = getArmSideFromLandmark(childKp)
  const crossBodyFactor = side
    ? computeCrossBodyFactor(frame, clip, side, leftShoulder, rightShoulder)
    : 0

  if (point.x >= torsoMinX && point.x <= torsoMaxX) {
    const forwardZ =
      TORSO_GUARD_FORWARD_Z * Math.max(0, 1 - crossBodyFactor * CROSS_BODY_FORWARD_Z_FALLOFF)
    point.z = Math.max(point.z, centerZ + forwardZ)
  }

  if (!isArmElbowLandmark(childKp)) return

  // 손목이 반대편으로 충분히 진입한 경우엔 side margin clamp 를 해제 — 그렇지 않으면 cross-body 동작에서
  // 팔꿈치가 강제로 자기 쪽 옆구리로 밀려나 동작이 짧게 끝나 보임.
  if (crossBodyFactor >= CROSS_BODY_ENGAGE_FACTOR) return

  const sideMargin = shoulderSpan * TORSO_GUARD_SIDE_MARGIN_RATIO
  if (isLeftSideLandmark(childKp)) {
    const leftLimit = Math.min(leftShoulder.x, leftHip.x) - sideMargin
    if (point.x > leftLimit) point.x = leftLimit
  } else {
    const rightLimit = Math.max(rightShoulder.x, rightHip.x) + sideMargin
    if (point.x < rightLimit) point.x = rightLimit
  }
}

function applyArmIkTargets(
  frame: MotionFrame,
  clip: MotionClip,
  parentKp: LandmarkName,
  childKp: LandmarkName,
  parentPoint: Vector3,
  childPoint: Vector3,
  scratch: ArmIkScratch,
): void {
  const side = getArmSide(parentKp, childKp)
  if (!side) return

  const kps = ARM_KPS_BY_SIDE[side]
  if (
    !tryReadRetargetKp(frame, clip, kps.shoulder, scratch.shoulder) ||
    !tryReadRetargetKp(frame, clip, kps.elbow, scratch.elbow) ||
    !tryReadRetargetKp(frame, clip, kps.wrist, scratch.wrist)
  ) {
    return
  }

  const upperLen = scratch.shoulder.distanceTo(scratch.elbow)
  const lowerLen = scratch.elbow.distanceTo(scratch.wrist)
  if (
    !Number.isFinite(upperLen) ||
    !Number.isFinite(lowerLen) ||
    upperLen <= RETARGET_MIN_DIRECTION_LENGTH ||
    lowerLen <= RETARGET_MIN_DIRECTION_LENGTH
  ) {
    return
  }

  scratch.targetWrist.copy(scratch.wrist)
  mutateTorsoGuardedArmPoint(
    frame,
    clip,
    kps.wrist,
    scratch.targetWrist,
    scratch.leftShoulder,
    scratch.rightShoulder,
    scratch.leftHip,
    scratch.rightHip,
  )

  scratch.chainDir.copy(scratch.targetWrist).sub(scratch.shoulder)
  let reach = scratch.chainDir.length()
  if (!Number.isFinite(reach) || reach <= RETARGET_MIN_DIRECTION_LENGTH) return

  const maxReach = (upperLen + lowerLen) * ARM_IK_MAX_REACH_RATIO
  const minReach = Math.max(
    Math.abs(upperLen - lowerLen) + RETARGET_MIN_DIRECTION_LENGTH,
    (upperLen + lowerLen) * ARM_IK_MIN_REACH_RATIO,
  )
  scratch.chainDir.normalize()
  if (reach > maxReach) {
    reach = maxReach
    scratch.targetWrist.copy(scratch.shoulder).addScaledVector(scratch.chainDir, reach)
  } else if (reach < minReach) {
    reach = minReach
    scratch.targetWrist.copy(scratch.shoulder).addScaledVector(scratch.chainDir, reach)
  }

  const mid =
    (upperLen * upperLen - lowerLen * lowerLen + reach * reach) / Math.max(2 * reach, 0.0001)
  const bendHeight = Math.sqrt(Math.max(0, upperLen * upperLen - mid * mid))
  scratch.projectedBase.copy(scratch.shoulder).addScaledVector(scratch.chainDir, mid)

  scratch.observedPole.copy(scratch.elbow).sub(scratch.shoulder)
  scratch.observedPole.addScaledVector(
    scratch.chainDir,
    -scratch.observedPole.dot(scratch.chainDir),
  )
  const observedPoleValid = normalizeDirection(scratch.observedPole)

  const sideSign = getArmSideSign(side)
  // 신체 좌표축(어깨-엉덩이 평면 기반)을 사용해 fallback pole 을 "옆구리 + 정면 + 살짝 아래" 로 잡음.
  // 단순 월드축(X,Z) 기반 bias 는 캐릭터/사용자가 정면을 안 보고 있을 때 팔꿈치를 잘못된 방향으로 꺾이게 만든다.
  const hasBodyBasis = tryComputeBodyBasis(
    frame,
    clip,
    scratch.leftShoulder,
    scratch.rightShoulder,
    scratch.leftHip,
    scratch.rightHip,
    scratch.bodyRight,
    scratch.bodyUp,
    scratch.bodyForward,
  )
  if (hasBodyBasis) {
    scratch.fallbackPole
      .copy(scratch.bodyRight)
      .multiplyScalar(sideSign * ARM_IK_ELBOW_SIDE_BIAS)
      .addScaledVector(scratch.bodyForward, ARM_IK_ELBOW_FORWARD_BIAS)
      .addScaledVector(scratch.bodyUp, -0.12)
  } else {
    scratch.fallbackPole.set(sideSign * ARM_IK_ELBOW_SIDE_BIAS, 0, ARM_IK_ELBOW_FORWARD_BIAS)
  }
  scratch.fallbackPole.addScaledVector(
    scratch.chainDir,
    -scratch.fallbackPole.dot(scratch.chainDir),
  )
  if (!normalizeDirection(scratch.fallbackPole)) {
    scratch.fallbackPole.set(sideSign, 0, 0)
  }

  scratch.pole.copy(scratch.fallbackPole)
  if (observedPoleValid && scratch.observedPole.x * sideSign > 0) {
    scratch.pole.lerp(scratch.observedPole, ARM_IK_OBSERVED_POLE_WEIGHT)
    normalizeDirection(scratch.pole)
  } else if (observedPoleValid) {
    scratch.pole.lerp(scratch.observedPole, ARM_IK_CROSS_BODY_OBSERVED_POLE_WEIGHT)
    normalizeDirection(scratch.pole)
  }

  scratch.targetElbow.copy(scratch.projectedBase).addScaledVector(scratch.pole, bendHeight)
  mutateTorsoGuardedArmPoint(
    frame,
    clip,
    kps.elbow,
    scratch.targetElbow,
    scratch.leftShoulder,
    scratch.rightShoulder,
    scratch.leftHip,
    scratch.rightHip,
  )

  if (parentKp === kps.shoulder && childKp === kps.elbow) {
    parentPoint.copy(scratch.shoulder)
    childPoint.copy(scratch.targetElbow)
  } else if (parentKp === kps.elbow && childKp === kps.wrist) {
    parentPoint.copy(scratch.targetElbow)
    childPoint.copy(scratch.targetWrist)
  }
}

function retargetBoneFromPoints(
  bone: Bone | undefined,
  restQuat: Quaternion | undefined,
  restParentDir: Vector3 | undefined,
  groupMatrix: Matrix4,
  startPoint: Vector3,
  endPoint: Vector3,
  maxRotationRad: number,
  slerpFactor: number,
  scratch: DirectionRetargetScratch,
): boolean {
  if (!bone || !restQuat || !restParentDir || !bone.parent) return false
  const parent = bone.parent

  scratch.startWorld.copy(startPoint).applyMatrix4(groupMatrix)
  scratch.endWorld.copy(endPoint).applyMatrix4(groupMatrix)
  scratch.desiredDir.copy(scratch.endWorld).sub(scratch.startWorld)
  if (!normalizeDirection(scratch.desiredDir)) return false

  parent.updateWorldMatrix(true, false)
  parent.matrixWorld.decompose(scratch.parentPosition, scratch.parentRotation, scratch.parentScale)
  scratch.parentInvRotation.copy(scratch.parentRotation).invert()
  scratch.desiredDir.applyQuaternion(scratch.parentInvRotation)
  if (!normalizeDirection(scratch.desiredDir)) return false

  scratch.restDir.copy(restParentDir)
  if (!normalizeDirection(scratch.restDir)) return false
  limitDirectionFromRest(scratch.restDir, scratch.desiredDir, maxRotationRad)
  scratch.delta.setFromUnitVectors(scratch.restDir, scratch.desiredDir)
  scratch.targetRotation.copy(scratch.delta).multiply(restQuat)
  bone.quaternion.slerp(scratch.targetRotation, slerpFactor)
  return true
}

function slerpBoneLocalRotation(
  bone: Bone | undefined,
  restQuat: Quaternion | undefined,
  yawRad: number,
  rollRad: number,
  pitchRad: number,
  slerpFactor: number,
  scratch: UpperBodyScratch,
): boolean {
  if (!bone || !restQuat) return false

  scratch.yawRotation.setFromAxisAngle(LOCAL_Y_AXIS, yawRad)
  scratch.rollRotation.setFromAxisAngle(LOCAL_Z_AXIS, rollRad)
  scratch.pitchRotation.setFromAxisAngle(LOCAL_X_AXIS, pitchRad)
  scratch.targetRotation
    .copy(restQuat)
    .multiply(scratch.yawRotation)
    .multiply(scratch.rollRotation)
    .multiply(scratch.pitchRotation)
  bone.quaternion.slerp(scratch.targetRotation, slerpFactor)
  return true
}

function applyUpperBodyRetargeting(
  frame: MotionFrame,
  clip: MotionClip,
  bones: Map<string, Bone>,
  restQuats: Map<string, Quaternion>,
  restParentDirs: Map<string, Vector3>,
  groupMatrix: Matrix4,
  upperScratch: UpperBodyScratch,
  directionScratch: DirectionRetargetScratch,
): boolean {
  if (
    !tryReadRetargetKp(frame, clip, 'LEFT_SHOULDER', upperScratch.leftShoulder) ||
    !tryReadRetargetKp(frame, clip, 'RIGHT_SHOULDER', upperScratch.rightShoulder) ||
    !tryReadRetargetKp(frame, clip, 'LEFT_HIP', upperScratch.leftHip) ||
    !tryReadRetargetKp(frame, clip, 'RIGHT_HIP', upperScratch.rightHip)
  ) {
    return false
  }

  const shoulderSpan = upperScratch.leftShoulder.distanceTo(upperScratch.rightShoulder)
  if (!Number.isFinite(shoulderSpan) || shoulderSpan <= TORSO_MIN_SHOULDER_SPAN) {
    return false
  }

  upperScratch.shoulderCenter
    .copy(upperScratch.leftShoulder)
    .add(upperScratch.rightShoulder)
    .multiplyScalar(0.5)
  upperScratch.hipCenter.copy(upperScratch.leftHip).add(upperScratch.rightHip).multiplyScalar(0.5)

  const yaw = MathUtils.clamp(
    ((upperScratch.rightShoulder.z - upperScratch.leftShoulder.z) / shoulderSpan) * TORSO_YAW_SCALE,
    -TORSO_MAX_YAW_RAD,
    TORSO_MAX_YAW_RAD,
  )
  const roll = MathUtils.clamp(
    Math.atan2(upperScratch.rightShoulder.y - upperScratch.leftShoulder.y, shoulderSpan) *
      TORSO_ROLL_SCALE,
    -TORSO_MAX_ROLL_RAD,
    TORSO_MAX_ROLL_RAD,
  )
  // Pitch: 어깨중심-엉덩이중심 벡터의 forward(z) 성분이 사용자가 앞으로 숙인 정도.
  // y 가 아래 양수(MediaPipe) 이므로 spineLength 는 hipY - shoulderY (양수). 카메라 쪽으로 숙이면 z↑.
  const spineVerticalSpan = upperScratch.hipCenter.y - upperScratch.shoulderCenter.y
  const spineForwardOffset = upperScratch.shoulderCenter.z - upperScratch.hipCenter.z
  const pitch =
    Number.isFinite(spineVerticalSpan) && Math.abs(spineVerticalSpan) > 1e-3
      ? MathUtils.clamp(
          Math.atan2(spineForwardOffset, Math.abs(spineVerticalSpan)) * TORSO_PITCH_SCALE,
          -TORSO_MAX_PITCH_RAD,
          TORSO_MAX_PITCH_RAD,
        )
      : 0

  let didRetarget = false
  didRetarget =
    slerpBoneLocalRotation(
      bones.get('Spine'),
      restQuats.get('Spine'),
      yaw * 0.2,
      roll * 0.2,
      pitch * 0.2,
      UPPER_BODY_SLERP_FACTOR,
      upperScratch,
    ) || didRetarget
  didRetarget =
    slerpBoneLocalRotation(
      bones.get('Spine01'),
      restQuats.get('Spine01'),
      yaw * 0.35,
      roll * 0.3,
      pitch * 0.35,
      UPPER_BODY_SLERP_FACTOR,
      upperScratch,
    ) || didRetarget
  didRetarget =
    slerpBoneLocalRotation(
      bones.get('Spine02'),
      restQuats.get('Spine02'),
      yaw * 0.45,
      roll * 0.4,
      pitch * 0.45,
      UPPER_BODY_SLERP_FACTOR,
      upperScratch,
    ) || didRetarget

  upperScratch.targetStart.copy(upperScratch.shoulderCenter)
  upperScratch.targetEnd.copy(upperScratch.leftShoulder)
  didRetarget =
    retargetBoneFromPoints(
      bones.get('LeftShoulder'),
      restQuats.get('LeftShoulder'),
      restParentDirs.get('LeftShoulder'),
      groupMatrix,
      upperScratch.targetStart,
      upperScratch.targetEnd,
      SHOULDER_MAX_ROTATION_RAD,
      SHOULDER_RETARGET_SLERP_FACTOR,
      directionScratch,
    ) || didRetarget

  upperScratch.targetEnd.copy(upperScratch.rightShoulder)
  didRetarget =
    retargetBoneFromPoints(
      bones.get('RightShoulder'),
      restQuats.get('RightShoulder'),
      restParentDirs.get('RightShoulder'),
      groupMatrix,
      upperScratch.targetStart,
      upperScratch.targetEnd,
      SHOULDER_MAX_ROTATION_RAD,
      SHOULDER_RETARGET_SLERP_FACTOR,
      directionScratch,
    ) || didRetarget

  const hasNose = tryReadRetargetKp(frame, clip, 'NOSE', upperScratch.nose)
  const hasLeftEar = tryReadRetargetKp(frame, clip, 'LEFT_EAR', upperScratch.leftEar)
  const hasRightEar = tryReadRetargetKp(frame, clip, 'RIGHT_EAR', upperScratch.rightEar)
  if (hasLeftEar && hasRightEar) {
    upperScratch.headCenter
      .copy(upperScratch.leftEar)
      .add(upperScratch.rightEar)
      .multiplyScalar(0.5)
  } else if (hasNose) {
    upperScratch.headCenter.copy(upperScratch.nose)
  } else {
    return didRetarget
  }

  didRetarget =
    retargetBoneFromPoints(
      bones.get('neck'),
      restQuats.get('neck'),
      restParentDirs.get('neck'),
      groupMatrix,
      upperScratch.shoulderCenter,
      upperScratch.headCenter,
      NECK_MAX_ROTATION_RAD,
      HEAD_RETARGET_SLERP_FACTOR,
      directionScratch,
    ) || didRetarget

  if (hasNose && hasLeftEar && hasRightEar) {
    didRetarget =
      retargetBoneFromPoints(
        bones.get('Head'),
        restQuats.get('Head'),
        restParentDirs.get('Head'),
        groupMatrix,
        upperScratch.headCenter,
        upperScratch.nose,
        HEAD_MAX_ROTATION_RAD,
        HEAD_RETARGET_SLERP_FACTOR,
        directionScratch,
      ) || didRetarget
  }

  return didRetarget
}

function classifyBone(rawName: string): string | null {
  const n = rawName.toLowerCase()
  const isLeft = /^left|(^|[._\-:])l(?=$|[._\-:])|\.l\b|_l\b/.test(n)
  const isRight = /^right|(^|[._\-:])r(?=$|[._\-:])|\.r\b|_r\b/.test(n)
  const side = isLeft ? 'l' : isRight ? 'r' : null
  if (!side) return null

  if (n.includes('forearm')) return `elbow-${side}`
  if (n.includes('upleg') || n.includes('thigh')) return `hip-${side}`
  if (n.endsWith('toebase') || n.includes('toe')) return null
  if (n.endsWith('shoulder') || n.includes('clavicle')) return null
  if (n.endsWith('arm') && !n.includes('forearm')) return `shoulder-${side}`
  if (n.endsWith('leg') && !n.includes('upleg')) return `knee-${side}`
  if (n.endsWith('hand') && !n.includes('handle')) return `wrist-${side}`
  if (n.endsWith('foot') || n.includes('ankle')) return `ankle-${side}`
  if (n.includes('knee') || n.includes('shin') || n.includes('calf')) return `knee-${side}`
  if (n.includes('elbow')) return `elbow-${side}`
  if (n.includes('wrist')) return `wrist-${side}`
  return null
}

function tryReadRetargetKp(
  frame: MotionFrame,
  clip: MotionClip,
  name: LandmarkName,
  out: Vector3,
): boolean {
  const idx = clip.landmarks.indexOf(name)
  const lm = frame.lm[idx]
  if (!lm || lm[0] == null || lm[1] == null || lm[2] == null || lm[3] <= 0.05) {
    out.set(0, 0, 0)
    return false
  }
  out.set(lm[0] * KP_SCALE, HIP_LOCAL_Y - lm[1] * KP_SCALE, -lm[2] * KP_SCALE * DEPTH_DAMPING_RATIO)
  return true
}

/**
 * 25 landmark × 3 좌표(x,y,z) 의 시계열을 1-Euro 필터로 평활화.
 * confidence 가 낮거나 좌표가 null 인 경우엔 필터를 reset 해서 다음 유효 값이 시점 0이 되도록 함.
 */
class LandmarkStreamFilter {
  private readonly filters: OneEuro1D[][]

  constructor(landmarkCount: number, options: OneEuroFilterOptions) {
    this.filters = Array.from({ length: landmarkCount }, () => [
      new OneEuro1D(options),
      new OneEuro1D(options),
      new OneEuro1D(options),
    ])
  }

  filter(
    landmarkIdx: number,
    x: number,
    y: number,
    z: number,
    timeMs: number,
  ): [number, number, number] {
    const tri = this.filters[landmarkIdx]
    return [tri[0].filter(x, timeMs), tri[1].filter(y, timeMs), tri[2].filter(z, timeMs)]
  }

  resetLandmark(landmarkIdx: number): void {
    const tri = this.filters[landmarkIdx]
    tri[0].reset()
    tri[1].reset()
    tri[2].reset()
  }

  resetAll(): void {
    for (let i = 0; i < this.filters.length; i += 1) this.resetLandmark(i)
  }
}

/**
 * 5fps 같은 낮은 fps 클립을 ~60fps 렌더에서 부드럽게 보이도록,
 * 현재 elapsedMs 에 해당하는 prev/next frame을 선형 보간한 lm 배열을 생성.
 *  - 두 frame 의 시간 간격이 INTERPOLATION_MAX_GAP_MS 이상이면 보간하지 않고 가장 가까운 값 사용 (tracking 결손 안전).
 *  - null/저신뢰 landmark 는 가까운 유효 frame 값을 그대로 사용 (보간하지 않음).
 *  - out 배열은 외부에서 재사용하기 위해 미리 할당된 mutable lm 배열을 받음.
 */
function fillInterpolatedFrameLm(
  clip: MotionClip,
  elapsedMs: number,
  outLm: Array<[number | null, number | null, number | null, number]>,
): { prevIdx: number; nextIdx: number; alpha: number } | null {
  const frames = clip.frames
  if (frames.length === 0) return null
  // binary search 대신 단순 선형 탐색 — 클립 길이가 충분히 짧음 (수백 프레임 이내).
  let nextIdx = 0
  while (nextIdx < frames.length && frames[nextIdx].t < elapsedMs) nextIdx += 1
  const prevIdx = Math.max(0, nextIdx - 1)
  const clampedNextIdx = Math.min(frames.length - 1, nextIdx)
  const prev = frames[prevIdx]
  const next = frames[clampedNextIdx]
  const gap = next.t - prev.t
  const canInterpolate = prevIdx !== clampedNextIdx && gap > 0 && gap <= INTERPOLATION_MAX_GAP_MS
  const alpha = canInterpolate ? Math.min(1, Math.max(0, (elapsedMs - prev.t) / gap)) : 0

  for (let i = 0; i < clip.landmarks.length; i += 1) {
    const a: Landmark | undefined = prev.lm[i]
    const b: Landmark | undefined = next.lm[i]
    const aOk = !!a && a[0] != null && a[1] != null && a[2] != null && a[3] > 0.05
    const bOk = !!b && b[0] != null && b[1] != null && b[2] != null && b[3] > 0.05

    if (canInterpolate && aOk && bOk) {
      outLm[i][0] = (a[0] as number) * (1 - alpha) + (b[0] as number) * alpha
      outLm[i][1] = (a[1] as number) * (1 - alpha) + (b[1] as number) * alpha
      outLm[i][2] = (a[2] as number) * (1 - alpha) + (b[2] as number) * alpha
      outLm[i][3] = Math.min(a[3], b[3])
    } else if (aOk && (alpha < 0.5 || !bOk)) {
      outLm[i][0] = a[0]
      outLm[i][1] = a[1]
      outLm[i][2] = a[2]
      outLm[i][3] = a[3]
    } else if (bOk) {
      outLm[i][0] = b[0]
      outLm[i][1] = b[1]
      outLm[i][2] = b[2]
      outLm[i][3] = b[3]
    } else {
      outLm[i][0] = null
      outLm[i][1] = null
      outLm[i][2] = null
      outLm[i][3] = 0
    }
  }
  return { prevIdx, nextIdx: clampedNextIdx, alpha }
}

function applyFilterToLm(
  filter: LandmarkStreamFilter,
  lm: Array<[number | null, number | null, number | null, number]>,
  timeMs: number,
): void {
  for (let i = 0; i < lm.length; i += 1) {
    const tuple = lm[i]
    if (tuple[0] == null || tuple[1] == null || tuple[2] == null || tuple[3] <= 0.05) {
      // 결손 구간 진입 — 다음 유효 입력이 다시 시점 0에서 시작하도록 필터를 reset.
      filter.resetLandmark(i)
      continue
    }
    const filtered = filter.filter(i, tuple[0], tuple[1], tuple[2], timeMs)
    tuple[0] = filtered[0]
    tuple[1] = filtered[1]
    tuple[2] = filtered[2]
  }
}

/**
 * 캘리브레이션: 첫 N프레임 동안 각 landmark의 평균을 누적해서 사용자 rest 자세를 추정.
 * accumulator 배열은 [x, y, z, count] 꼴로 LANDMARK_NAMES 길이만큼 보관.
 */
type CalibrationAccumulator = Array<[number, number, number, number]>

function createCalibrationAccumulator(): CalibrationAccumulator {
  return LANDMARK_NAMES.map(() => [0, 0, 0, 0])
}

function accumulateCalibration(
  acc: CalibrationAccumulator,
  lm: ReadonlyArray<[number | null, number | null, number | null, number]>,
): void {
  for (let i = 0; i < lm.length; i += 1) {
    const tuple = lm[i]
    if (
      tuple[0] == null ||
      tuple[1] == null ||
      tuple[2] == null ||
      tuple[3] < CALIBRATION_MIN_CONFIDENCE
    ) {
      continue
    }
    const bucket = acc[i]
    bucket[0] += tuple[0]
    bucket[1] += tuple[1]
    bucket[2] += tuple[2]
    bucket[3] += 1
  }
}

function getCalibratedKp(acc: CalibrationAccumulator, landmarkIdx: number, out: Vector3): boolean {
  const bucket = acc[landmarkIdx]
  if (bucket[3] <= 0) return false
  const x = bucket[0] / bucket[3]
  const y = bucket[1] / bucket[3]
  const z = bucket[2] / bucket[3]
  out.set(x * KP_SCALE, HIP_LOCAL_Y - y * KP_SCALE, -z * KP_SCALE * DEPTH_DAMPING_RATIO)
  return true
}

/**
 * 사용자 rest landmark 와 GLB rest 본 방향을 비교해서, chain별 보정 quaternion을 만든다.
 *  - userRestDir = (parent → child) in 사용자 rest 좌표 (parent-local로 변환된 방향)
 *  - restParentDir = GLB rest 의 parent-local 방향 (이미 저장돼 있음)
 *  - delta = setFromUnitVectors(userRestDir, restParentDir)
 *  - 매 frame: corrected = delta * observedUserDir → 이걸 restParentDir 와 비교해서 회전 산출
 */
function buildCalibrationDeltas(
  clip: MotionClip,
  acc: CalibrationAccumulator,
  bones: Map<string, Bone>,
  restParentDirs: Map<string, Vector3>,
  chains: ReadonlyArray<{ bone: string; parentKp: LandmarkName; childKp: LandmarkName }>,
): Map<string, Quaternion> {
  const result = new Map<string, Quaternion>()
  const parentVec = new Vector3()
  const childVec = new Vector3()
  const userDir = new Vector3()
  const parentRot = new Quaternion()
  const parentPos = new Vector3()
  const parentScale = new Vector3()
  const restDir = new Vector3()

  for (const c of chains) {
    const bone = bones.get(c.bone)
    const parent = bone?.parent
    const restDirSource = restParentDirs.get(c.bone)
    if (!bone || !parent || !restDirSource) continue

    const parentIdx = clip.landmarks.indexOf(c.parentKp)
    const childIdx = clip.landmarks.indexOf(c.childKp)
    if (parentIdx < 0 || childIdx < 0) continue
    if (!getCalibratedKp(acc, parentIdx, parentVec)) continue
    if (!getCalibratedKp(acc, childIdx, childVec)) continue

    userDir.copy(childVec).sub(parentVec)
    if (userDir.lengthSq() <= RETARGET_MIN_DIRECTION_LENGTH) continue
    userDir.normalize()

    parent.updateWorldMatrix(true, false)
    parent.matrixWorld.decompose(parentPos, parentRot, parentScale)
    parentRot.invert()
    userDir.applyQuaternion(parentRot)
    if (userDir.lengthSq() <= RETARGET_MIN_DIRECTION_LENGTH) continue
    userDir.normalize()

    restDir.copy(restDirSource).normalize()

    const delta = new Quaternion().setFromUnitVectors(userDir, restDir)
    result.set(c.bone, delta)
  }
  return result
}

/**
 * shoulder-hip 평면 기반의 신체 좌표축 (right, up, forward).
 *  - bodyRight: 왼어깨→오른어깨 정규화
 *  - bodyUp:   엉덩이중심→어깨중심 정규화
 *  - bodyForward: bodyRight × bodyUp (오른손좌표계 기준 카메라 쪽)
 * 반환 false 이면 신체 평면을 구할 수 없는 상태(어깨/엉덩이 결손).
 */
function tryComputeBodyBasis(
  frame: MotionFrame,
  clip: MotionClip,
  leftShoulder: Vector3,
  rightShoulder: Vector3,
  leftHip: Vector3,
  rightHip: Vector3,
  outRight: Vector3,
  outUp: Vector3,
  outForward: Vector3,
): boolean {
  if (
    !tryReadRetargetKp(frame, clip, 'LEFT_SHOULDER', leftShoulder) ||
    !tryReadRetargetKp(frame, clip, 'RIGHT_SHOULDER', rightShoulder) ||
    !tryReadRetargetKp(frame, clip, 'LEFT_HIP', leftHip) ||
    !tryReadRetargetKp(frame, clip, 'RIGHT_HIP', rightHip)
  ) {
    return false
  }
  outRight.copy(rightShoulder).sub(leftShoulder)
  if (!normalizeDirection(outRight)) return false
  outUp.copy(leftShoulder).add(rightShoulder).multiplyScalar(0.5)
  const hipCenterX = (leftHip.x + rightHip.x) * 0.5
  const hipCenterY = (leftHip.y + rightHip.y) * 0.5
  const hipCenterZ = (leftHip.z + rightHip.z) * 0.5
  outUp.x -= hipCenterX
  outUp.y -= hipCenterY
  outUp.z -= hipCenterZ
  if (!normalizeDirection(outUp)) return false
  outForward.copy(outRight).cross(outUp)
  if (!normalizeDirection(outForward)) return false
  return true
}

function CharacterModel({
  targetScale,
  joints,
  onStaticJoints,
  activeMotion,
  activeClipName,
  playbackTimeMs,
  onMotionFrame,
}: {
  targetScale: number
  joints: Joint[]
  onStaticJoints: (joints: Joint[]) => void
  activeMotion: MotionClip | null
  activeClipName: string | null
  playbackTimeMs?: number | null
  onMotionFrame: (joints: Joint[]) => void
}) {
  // useGLTF 캐시 scene 을 직접 mutate 하면 같은 GLB 를 쓰는 다른 페이지(예: 채팅 WishCharacter3D)
  // 모델에 자세가 누수됨. 본/스킨까지 깊은 복사해 인스턴스별로 격리.
  const { scene: rawScene } = useGLTF(wishGlbUrl)
  const scene = useMemo(() => SkeletonUtils.clone(rawScene), [rawScene])
  const { animations: walkingClips } = useGLTF(walkingGlbUrl)
  const { animations: squatClips } = useGLTF(squatGlbUrl)
  const allClips = [...walkingClips, ...squatClips]
  const { actions } = useAnimations(allClips, scene)
  const groupRef = useRef<Group>(null)
  const playStartMs = useRef<number>(0)
  const lastFrameIdx = useRef<number>(-1)
  const bonesRef = useRef<Map<string, Bone>>(new Map())
  const restQuatsRef = useRef<Map<string, Quaternion>>(new Map())
  const restParentDirsRef = useRef<Map<string, Vector3>>(new Map())
  const markerRefs = useRef<Map<string, Group>>(new Map())
  const updatedParentIdsRef = useRef<Set<string>>(new Set())

  // 매 프레임 재사용할 임시 객체들
  const tmpKpP = useRef(new Vector3())
  const tmpKpC = useRef(new Vector3())
  const tmpGuardLeftShoulder = useRef(new Vector3())
  const tmpGuardRightShoulder = useRef(new Vector3())
  const tmpGuardLeftHip = useRef(new Vector3())
  const tmpGuardRightHip = useRef(new Vector3())
  const tmpBonePos = useRef(new Vector3())
  const tmpChildPos = useRef(new Vector3())
  const tmpRestDir = useRef(new Vector3())
  const tmpDesiredDir = useRef(new Vector3())
  const tmpKpPWorld = useRef(new Vector3())
  const tmpKpCWorld = useRef(new Vector3())
  const tmpDelta = useRef(new Quaternion())
  const tmpParentRot = useRef(new Quaternion())
  const tmpParentInvRot = useRef(new Quaternion())
  const tmpTargetRot = useRef(new Quaternion())
  const upperBodyScratch = useRef<UpperBodyScratch>({
    leftShoulder: new Vector3(),
    rightShoulder: new Vector3(),
    leftHip: new Vector3(),
    rightHip: new Vector3(),
    nose: new Vector3(),
    leftEar: new Vector3(),
    rightEar: new Vector3(),
    shoulderCenter: new Vector3(),
    hipCenter: new Vector3(),
    headCenter: new Vector3(),
    targetStart: new Vector3(),
    targetEnd: new Vector3(),
    yawRotation: new Quaternion(),
    rollRotation: new Quaternion(),
    pitchRotation: new Quaternion(),
    targetRotation: new Quaternion(),
  })
  const directionRetargetScratch = useRef<DirectionRetargetScratch>({
    startWorld: new Vector3(),
    endWorld: new Vector3(),
    desiredDir: new Vector3(),
    restDir: new Vector3(),
    parentPosition: new Vector3(),
    parentRotation: new Quaternion(),
    parentScale: new Vector3(),
    parentInvRotation: new Quaternion(),
    delta: new Quaternion(),
    targetRotation: new Quaternion(),
  })
  const armIkScratch = useRef<ArmIkScratch>({
    shoulder: new Vector3(),
    elbow: new Vector3(),
    wrist: new Vector3(),
    targetElbow: new Vector3(),
    targetWrist: new Vector3(),
    chainDir: new Vector3(),
    projectedBase: new Vector3(),
    observedPole: new Vector3(),
    fallbackPole: new Vector3(),
    pole: new Vector3(),
    leftShoulder: new Vector3(),
    rightShoulder: new Vector3(),
    leftHip: new Vector3(),
    rightHip: new Vector3(),
    bodyRight: new Vector3(),
    bodyUp: new Vector3(),
    bodyForward: new Vector3(),
  })

  /**
   * 보간/필터/캘리브레이션 상태:
   *  - lmFilterRef: 25개 landmark × 3축에 대한 1-Euro 필터 (motion 시작 시마다 reset).
   *  - interpolatedFrameRef: 보간된 mutable frame (lm 배열이 매 frame 재사용됨).
   *  - calibrationAccRef: 첫 N프레임 사용자 rest 자세 평균 누적.
   *  - calibrationFrameCountRef: 누적된 frame 수.
   *  - calibrationDeltasRef: chain별 보정 quaternion (사용자 rest → GLB rest).
   *  - handChainsRef: scene 로드 시 자동 탐지한 손 본 chain (LeftHand/RightHand의 첫 자식 본).
   *  - lastBoneChainParentIdsRef: 한 frame 안에서 parent matrix 재계산 캐시.
   */
  const lmFilterRef = useRef<LandmarkStreamFilter>(
    new LandmarkStreamFilter(LANDMARK_NAMES.length, LM_FILTER_OPTIONS),
  )
  const interpolatedFrameRef = useRef<MotionFrame>({
    t: 0,
    lm: LANDMARK_NAMES.map(() => [null, null, null, 0]),
  })
  const calibrationAccRef = useRef<CalibrationAccumulator>(createCalibrationAccumulator())
  const calibrationFrameCountRef = useRef(0)
  const calibrationDeltasRef = useRef<Map<string, Quaternion>>(new Map())
  const handChainsRef = useRef<
    Array<{
      bone: string
      childBone: string
      parentKp: LandmarkName
      childKp: LandmarkName
      maxRotationRad: number
    }>
  >([])

  useEffect(() => {
    const group = groupRef.current
    if (!group) return
    group.updateMatrixWorld(true)

    const bones = new Map<string, Bone>()
    scene.traverse(obj => {
      if ((obj as Bone).isBone) bones.set(obj.name, obj as Bone)
    })
    bonesRef.current = bones

    const restQuats = new Map<string, Quaternion>()
    const restParentDirs = new Map<string, Vector3>()
    for (const boneName of UPPER_BODY_LOCAL_BONES) {
      const bone = bones.get(boneName)
      if (bone) restQuats.set(boneName, bone.quaternion.clone())
    }
    // 손 본은 wish.glb 의 자식 본 이름이 모델별로 달라(LeftHandIndex1, LeftHandMiddle1 등)
    // 동적으로 LeftHand/RightHand 의 첫 자식 본을 child 로 잡아 chain entry 생성.
    const handChains: typeof handChainsRef.current = []
    const findFirstChildBone = (bone: Bone): Bone | null => {
      for (const child of bone.children) {
        if ((child as Bone).isBone) return child as Bone
      }
      return null
    }
    const leftHandBone = bones.get('LeftHand')
    const rightHandBone = bones.get('RightHand')
    const leftHandChild = leftHandBone ? findFirstChildBone(leftHandBone) : null
    const rightHandChild = rightHandBone ? findFirstChildBone(rightHandBone) : null
    if (leftHandBone && leftHandChild) {
      handChains.push({
        bone: 'LeftHand',
        childBone: leftHandChild.name,
        parentKp: 'LEFT_WRIST',
        childKp: 'LEFT_INDEX',
        maxRotationRad: HAND_MAX_ROTATION_RAD,
      })
    }
    if (rightHandBone && rightHandChild) {
      handChains.push({
        bone: 'RightHand',
        childBone: rightHandChild.name,
        parentKp: 'RIGHT_WRIST',
        childKp: 'RIGHT_INDEX',
        maxRotationRad: HAND_MAX_ROTATION_RAD,
      })
    }
    handChainsRef.current = handChains
    const allRestChains: ReadonlyArray<{ bone: string; childBone: string }> = [
      ...DIRECTION_REST_CHAINS,
      ...handChains,
    ]

    for (const c of allRestChains) {
      const bone = bones.get(c.bone)
      const childBone = bones.get(c.childBone)
      if (bone) restQuats.set(c.bone, bone.quaternion.clone())
      if (bone && childBone && bone.parent) {
        bone.getWorldPosition(tmpBonePos.current)
        childBone.getWorldPosition(tmpChildPos.current)
        tmpRestDir.current.copy(tmpChildPos.current).sub(tmpBonePos.current)
        if (normalizeDirection(tmpRestDir.current)) {
          bone.parent.updateWorldMatrix(true, false)
          bone.parent.matrixWorld.decompose(
            tmpBonePos.current,
            tmpParentRot.current,
            tmpChildPos.current,
          )
          tmpParentInvRot.current.copy(tmpParentRot.current).invert()
          tmpRestDir.current.applyQuaternion(tmpParentInvRot.current)
          if (normalizeDirection(tmpRestDir.current)) {
            restParentDirs.set(c.bone, tmpRestDir.current.clone())
          }
        }
      }
    }
    restQuatsRef.current = restQuats
    restParentDirsRef.current = restParentDirs

    // 정적 마커 위치 (GLB 본 추출 결과)
    const found = new Map<string, [number, number, number]>()
    const tmp = new Vector3()
    scene.traverse(obj => {
      if (!obj.name) return
      const id = classifyBone(obj.name)
      if (!id || found.has(id)) return
      obj.getWorldPosition(tmp)
      group.worldToLocal(tmp)
      const yOffset = id === 'hip-l' || id === 'hip-r' ? HIP_Y_OFFSET : 0
      found.set(id, [tmp.x, tmp.y + yOffset, tmp.z])
    })
    if (found.size > 0) {
      onStaticJoints(Array.from(found, ([id, position]) => ({ id, position })))
    }
  }, [scene, onStaticJoints])

  useEffect(() => {
    playStartMs.current = performance.now()
    lastFrameIdx.current = -1

    // 새 motion 시작 시 1-Euro 필터/캘리브레이션을 초기화. 종료 시 본 회전을 rest 로 복원.
    lmFilterRef.current.resetAll()
    calibrationAccRef.current = createCalibrationAccumulator()
    calibrationFrameCountRef.current = 0
    calibrationDeltasRef.current = new Map()

    if (!activeMotion || activeMotion.source === 'recorded' || activeMotion.source === 'compact') {
      // motion 종료 시 본 회전 rest 복원
      for (const [name, q] of restQuatsRef.current) {
        const bone = bonesRef.current.get(name)
        if (bone) bone.quaternion.copy(q)
      }
    }
  }, [activeMotion])

  // GLB에 베이크된 클립 재생 / 정지
  useEffect(() => {
    Object.values(actions).forEach(a => a?.stop())
    if (activeClipName) {
      actions[activeClipName]?.reset().play()
    }
  }, [activeClipName, actions])

  // 클립 정지 시 useFrame에서 ref로 mutate된 마커 group transform을 다시 props 좌표로 복원.
  // (React 입장에선 position prop이 같아 자동 갱신 안 되므로 명시적 reset 필요)
  useEffect(() => {
    if (activeClipName) return
    for (const j of joints) {
      const ref = markerRefs.current.get(j.id)
      if (!ref) continue
      ref.position.set(j.position[0], j.position[1], j.position[2])
    }
  }, [activeClipName, joints])

  useFrame(() => {
    const g = groupRef.current
    if (g) {
      const next = g.scale.x + (targetScale - g.scale.x) * 0.15
      g.scale.set(next, next, next)
    }
    if (!g) return

    // GLB 클립 재생 중에는 본 worldPosition을 따라 마커 group transform을 매 frame 동기화
    if (activeClipName) {
      const tmpV = tmpBonePos.current
      for (const j of joints) {
        const boneName = JOINT_ID_TO_BONE[j.id]
        if (!boneName) continue
        const bone = bonesRef.current.get(boneName)
        const ref = markerRefs.current.get(j.id)
        if (!bone || !ref) continue
        bone.getWorldPosition(tmpV)
        g.worldToLocal(tmpV)
        ref.position.copy(tmpV)
        if (j.id === 'hip-l' || j.id === 'hip-r') ref.position.y += HIP_Y_OFFSET
      }
      return
    }

    if (!activeMotion) return
    const shouldPlayKeypointMotion =
      activeMotion.source === 'recorded' ||
      activeMotion.source === 'compact' ||
      ENABLE_SIN_MARKER_MOTION
    if (!shouldPlayKeypointMotion) return

    const durationMs = Math.max(1, activeMotion.durationMs)
    const elapsed =
      playbackTimeMs == null
        ? (performance.now() - playStartMs.current) % durationMs
        : Math.min(durationMs, Math.max(0, playbackTimeMs))

    // 1) 보간 — 저장된 5fps 데이터를 현재 elapsedMs 에 맞춰 prev/next 선형 보간.
    const interpolatedFrame = interpolatedFrameRef.current
    const interpolationResult = fillInterpolatedFrameLm(
      activeMotion,
      elapsed,
      interpolatedFrame.lm as Array<[number | null, number | null, number | null, number]>,
    )
    if (!interpolationResult) return
    interpolatedFrame.t = elapsed

    // 2) 1-Euro 필터 — frame timestamp 기준으로 떨림 제거. loop 재생 시 elapsed 가 다시 0으로 가면
    //    필터가 자동으로 새 시퀀스로 인식 (timeMs <= prevTime 처리).
    applyFilterToLm(
      lmFilterRef.current,
      interpolatedFrame.lm as Array<[number | null, number | null, number | null, number]>,
      elapsed,
    )

    // 마커 표시용 joint 위치는 보간된 frame 으로 매 render frame 갱신 (5fps 끊김 제거).
    const interpolatedJoints = activeMotion.landmarks.map<Joint>((name, i) => {
      const id = KP_TO_JOINT_ID[name]
      const lm = interpolatedFrame.lm[i]
      const fallback = FALLBACK_JOINT_BY_ID.get(id)?.position ?? DEFAULT_JOINT_POSITION
      if (!lm || lm[0] == null || lm[1] == null || lm[2] == null || lm[3] <= 0.05) {
        return { id, position: fallback }
      }
      return {
        id,
        position: [
          (lm[0] as number) * KP_SCALE,
          HIP_LOCAL_Y - (lm[1] as number) * KP_SCALE,
          -(lm[2] as number) * KP_SCALE,
        ],
      }
    })
    // setJoints 호출은 frame index 가 바뀔 때만 (마커 ref position 만 갱신해도 시각 효과는 동일).
    const idx = interpolationResult.prevIdx
    if (idx !== lastFrameIdx.current) {
      lastFrameIdx.current = idx
      onMotionFrame(interpolatedJoints)
    } else {
      // ref position 만 갱신 — Three.js 입장에선 setState 없어도 매 render 반영됨.
      for (const j of interpolatedJoints) {
        const ref = markerRefs.current.get(j.id)
        if (ref) ref.position.set(j.position[0], j.position[1], j.position[2])
      }
    }

    if (!ENABLE_BONE_RETARGETING) return

    // 3) 캘리브레이션 — 첫 N프레임 동안은 사용자 rest 자세를 누적만 하고 retarget 은 보류.
    //    N프레임이 차면 본 chain 별 보정 quaternion 계산.
    if (ENABLE_REST_CALIBRATION && calibrationFrameCountRef.current < CALIBRATION_FRAME_COUNT) {
      accumulateCalibration(
        calibrationAccRef.current,
        interpolatedFrame.lm as ReadonlyArray<
          [number | null, number | null, number | null, number]
        >,
      )
      calibrationFrameCountRef.current += 1
      if (calibrationFrameCountRef.current >= CALIBRATION_FRAME_COUNT) {
        const calibrationChains = [
          ...BONE_CHAINS.map(c => ({ bone: c.bone, parentKp: c.parentKp, childKp: c.childKp })),
          ...handChainsRef.current.map(c => ({
            bone: c.bone,
            parentKp: c.parentKp,
            childKp: c.childKp,
          })),
        ]
        calibrationDeltasRef.current = buildCalibrationDeltas(
          activeMotion,
          calibrationAccRef.current,
          bonesRef.current,
          restParentDirsRef.current,
          calibrationChains,
        )
      }
      // 캘리브레이션 도중엔 retarget 안 함 (rest 자세 유지).
      return
    }

    const frame = interpolatedFrame
    g.updateWorldMatrix(false, false)
    const groupMatrix = g.matrixWorld
    let didRetarget = false
    const updatedParentIds = updatedParentIdsRef.current
    updatedParentIds.clear()
    if (
      applyUpperBodyRetargeting(
        frame,
        activeMotion,
        bonesRef.current,
        restQuatsRef.current,
        restParentDirsRef.current,
        groupMatrix,
        upperBodyScratch.current,
        directionRetargetScratch.current,
      )
    ) {
      g.updateWorldMatrix(false, true)
      didRetarget = true
    }

    const allRetargetChains: ReadonlyArray<{
      bone: string
      childBone: string
      parentKp: LandmarkName
      childKp: LandmarkName
      maxRotationRad: number
    }> = [...BONE_CHAINS, ...handChainsRef.current]
    const calibrationDeltas = calibrationDeltasRef.current

    for (const c of allRetargetChains) {
      const bone = bonesRef.current.get(c.bone)
      const restQuat = restQuatsRef.current.get(c.bone)
      const restParentDir = restParentDirsRef.current.get(c.bone)
      if (!bone || !restQuat || !restParentDir || !bone.parent) continue
      const parent = bone.parent

      if (
        !tryReadRetargetKp(frame, activeMotion, c.parentKp, tmpKpP.current) ||
        !tryReadRetargetKp(frame, activeMotion, c.childKp, tmpKpC.current)
      ) {
        continue
      }

      // 팔 chain 은 IK 로 elbow/wrist 위치 보정. 손/다리 chain 은 원본 keypoint 그대로 사용.
      applyArmIkTargets(
        frame,
        activeMotion,
        c.parentKp,
        c.childKp,
        tmpKpP.current,
        tmpKpC.current,
        armIkScratch.current,
      )

      mutateTorsoGuardedArmPoint(
        frame,
        activeMotion,
        c.childKp,
        tmpKpC.current,
        tmpGuardLeftShoulder.current,
        tmpGuardRightShoulder.current,
        tmpGuardLeftHip.current,
        tmpGuardRightHip.current,
      )
      const kpP = tmpKpP.current
      const kpC = tmpKpC.current
      tmpKpPWorld.current.copy(kpP).applyMatrix4(groupMatrix)
      tmpKpCWorld.current.copy(kpC).applyMatrix4(groupMatrix)
      tmpDesiredDir.current.copy(tmpKpCWorld.current).sub(tmpKpPWorld.current)
      if (!normalizeDirection(tmpDesiredDir.current)) continue

      const parentId = parent.uuid
      if (!updatedParentIds.has(parentId)) {
        parent.updateWorldMatrix(true, false)
        updatedParentIds.add(parentId)
      }
      parent.matrixWorld.decompose(tmpBonePos.current, tmpParentRot.current, tmpChildPos.current)
      tmpParentInvRot.current.copy(tmpParentRot.current).invert()
      tmpDesiredDir.current.applyQuaternion(tmpParentInvRot.current)
      if (!normalizeDirection(tmpDesiredDir.current)) continue

      // 캘리브레이션 보정: 사용자 rest 좌표계에서 본 GLB rest 좌표계로 정렬.
      const calibration = ENABLE_REST_CALIBRATION ? calibrationDeltas.get(c.bone) : undefined
      if (calibration) {
        tmpDesiredDir.current.applyQuaternion(calibration)
        if (!normalizeDirection(tmpDesiredDir.current)) continue
      }

      tmpRestDir.current.copy(restParentDir)
      const restDirLengthSq = tmpRestDir.current.lengthSq()
      if (!Number.isFinite(restDirLengthSq) || restDirLengthSq <= RETARGET_MIN_DIRECTION_LENGTH) {
        continue
      }
      if (!normalizeDirection(tmpRestDir.current)) continue
      // 본 회전 한계: 하부 사지(팔뚝/종아리) / 상부 사지(윗팔/대퇴) / 손 으로 분기.
      // BONE_CHAINS 정의의 maxRotationRad 는 default 값(빌드 타임 상수) 일 뿐이고 runtime 에서는 무시.
      const isLowerLimb =
        c.bone === 'LeftForeArm' ||
        c.bone === 'RightForeArm' ||
        c.bone === 'LeftLeg' ||
        c.bone === 'RightLeg'
      const isHand = c.bone === 'LeftHand' || c.bone === 'RightHand'
      const maxRotationRad = isHand
        ? HAND_MAX_ROTATION_RAD
        : isLowerLimb
          ? RETARGET_LOWER_LIMB_MAX_ROTATION_RAD
          : RETARGET_UPPER_LIMB_MAX_ROTATION_RAD
      limitDirectionFromRest(tmpRestDir.current, tmpDesiredDir.current, maxRotationRad)
      tmpDelta.current.setFromUnitVectors(tmpRestDir.current, tmpDesiredDir.current)

      tmpTargetRot.current.copy(tmpDelta.current).multiply(restQuat)
      const slerpFactor =
        c.bone === 'LeftHand' || c.bone === 'RightHand'
          ? HAND_RETARGET_SLERP_FACTOR
          : RETARGET_SLERP_FACTOR
      bone.quaternion.slerp(tmpTargetRot.current, slerpFactor)
      didRetarget = true
    }
    if (didRetarget) g.updateWorldMatrix(false, true)
  })

  return (
    <group ref={groupRef} position={[0, MODEL_OFFSET_Y, 0]} scale={BASE_SCALE}>
      <primitive object={scene} />
    </group>
  )
}

type Character3DProps = {
  activeMotion?: MotionClip | null
  playbackTimeMs?: number | null
}

export function Character3D({ activeMotion = null, playbackTimeMs = null }: Character3DProps) {
  const controlsRef = useRef<ComponentRef<typeof OrbitControls>>(null)
  const [zoom, setZoom] = useState(0)
  const [joints, setJoints] = useState<Joint[]>(FALLBACK_JOINTS)
  const staticJointsRef = useRef<Joint[]>(FALLBACK_JOINTS)
  const activeMotionRef = useRef(activeMotion)

  const motionId = activeMotion?.id
  const activeClipName = (motionId && MOTION_CLIP_NAME[motionId]) ?? null

  useEffect(() => {
    activeMotionRef.current = activeMotion
    if (!activeMotion) setJoints(staticJointsRef.current)
  }, [activeMotion])

  const handleStaticJoints = useCallback((extracted: Joint[]) => {
    if (extracted.length === 0) return
    staticJointsRef.current = extracted
    if (!activeMotionRef.current) setJoints(extracted)
  }, [])

  const handleMotionFrame = useCallback((frameJoints: Joint[]) => {
    setJoints(frameJoints)
  }, [])

  const targetScale = BASE_SCALE * (1 + zoom * 0.15)

  const handleReset = () => {
    setZoom(0)
    controlsRef.current?.reset()
  }

  return (
    <div className={styles.viewer}>
      <div className={styles.canvasWrap}>
        <Canvas
          flat
          camera={{ position: [0, 0, 3.8], fov: 32 }}
          gl={{ alpha: true, antialias: true }}
        >
          <ambientLight intensity={1.5} />
          <hemisphereLight args={['#fefdfb', '#f6f3ff', 0.4]} />
          <directionalLight position={[2, 4, 3]} intensity={1.1} color="#fefdfa" />
          <directionalLight position={[-3, 2, -2]} intensity={0.25} color="#ebe5ff" />
          <directionalLight position={[0, 2, 5]} intensity={0.15} color="#fefaf2" />
          <Suspense fallback={null}>
            <CharacterModel
              targetScale={targetScale}
              joints={joints}
              onStaticJoints={handleStaticJoints}
              activeMotion={activeMotion}
              activeClipName={activeClipName}
              playbackTimeMs={playbackTimeMs}
              onMotionFrame={handleMotionFrame}
            />
          </Suspense>
          <OrbitControls
            ref={controlsRef}
            enablePan={false}
            enableZoom
            minDistance={3.0}
            maxDistance={6.0}
            minPolarAngle={Math.PI / 3}
            maxPolarAngle={(2 * Math.PI) / 3}
            target={[0, 0.05, 0]}
          />
        </Canvas>
      </div>

      <div className={styles.controls}>
        <div className={styles.controlGroup}>
          <button
            type="button"
            className={styles.controlBtn}
            onClick={handleReset}
            aria-label="시점 초기화"
          >
            <RefreshIcon width={18} height={18} />
          </button>
          <button
            type="button"
            className={`${styles.controlBtn} ${styles.controlBtnActive}`}
            aria-label="기본 뷰"
          >
            <PersonIcon width={18} height={18} />
          </button>
        </div>
        <div className={styles.controlGroup}>
          <button
            type="button"
            className={styles.controlBtn}
            onClick={() => setZoom(z => Math.min(z + 1, 4))}
            aria-label="확대"
          >
            <PlusIcon width={18} height={18} />
          </button>
          <button
            type="button"
            className={styles.controlBtn}
            onClick={() => setZoom(z => Math.max(z - 1, -3))}
            aria-label="축소"
          >
            <MinusIcon width={18} height={18} />
          </button>
        </div>
      </div>
    </div>
  )
}
