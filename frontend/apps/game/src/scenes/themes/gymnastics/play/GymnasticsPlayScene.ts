import Phaser from 'phaser'
import { playSceneBgm } from '@/game/systems/sceneBgm'
import {
  createExerciseSession,
  createExerciseSessionMotion,
  listExerciseMotions,
  requestPresignedUploadUrls,
  uploadToPresignedUrl,
  type CreateExerciseSessionMotionRequest,
  type ExerciseMotion,
  type ExerciseMotionReplayClip,
  type ExerciseType,
  type MotionReplayFrame,
  type MotionReplayLandmarkTuple,
  type MotionReplaySegment,
} from '@wish/api-client'
import { assetPath } from '@/game/assets/assetPath'
import { POSE_LANDMARK_NAMES, PoseTracker } from '@/game/motion/poseTracker'
import {
  startMusicRecording as startFullGameCanvasRecording,
  type MusicRecorderHandle as ScreenRecorderHandle,
} from '@/game/systems/musicRecorder'
import { fadeToScene } from '@/game/systems/sceneTransition'
import { addCoverBackground } from '@/game/world/background'
import {
  resolvePatientProfileId,
  resolvePatientProfileIdOrFetch,
} from '@/features/exerciseSessions/patientProfile'
import {
  EXERCISE_SESSION_REPORT_QUERY_KEY,
  EXERCISE_SESSIONS_QUERY_KEY,
} from '@/features/exerciseSessions/hooks'
import { queryClient } from '@/queryClient'
import { speakFeedback, stopFeedbackSpeech } from '@/shared/lib/feedbackTts'

type GymnasticsMotion = {
  title: string
  goal: string
  tips: string[]
}

type GymnasticsPlayPhase =
  | 'GUIDE_PREVIEW'
  | 'COUNTDOWN'
  | 'TRACKING'
  | 'MOTION_COMPLETE'
  | 'SESSION_COMPLETE'

type PanelBounds = {
  x: number
  y: number
  width: number
  height: number
}

type GymnasticsMotionKind =
  | 'march'
  | 'side-step'
  | 'diagonal-body-punch'
  | 'diagonal-face-punch'
  | 'squat'

type DanielMotionKind =
  | 'daniel_forward_press'
  | 'daniel_upward_press'
  | 'daniel_side_bend_left'
  | 'daniel_side_bend_right'
  | 'daniel_forward_bend'

type TopAiMotionSpec = {
  type: 'top'
  kind: GymnasticsMotionKind
  exerciseMotionId: number
  targetSteps: number
}

type DanielAiMotionSpec = {
  type: 'daniel'
  kind: DanielMotionKind
  exerciseMotionId: number
  targetHoldMs: number
}

type AiMotionSpec = TopAiMotionSpec | DanielAiMotionSpec

type LocalExerciseMotionRecord = {
  exerciseMotionId: number
  durationSec: number
  completionRate: number
  completedCount: number
  feedback: string
  videoKey?: string
  thumbKey?: string
  poseReplay?: ExerciseMotionReplayClip
  compactPoseReplay?: ExerciseMotionReplayClip
}

type ReplayLandmarkName =
  | 'NOSE'
  | 'LEFT_EAR'
  | 'RIGHT_EAR'
  | 'LEFT_SHOULDER'
  | 'RIGHT_SHOULDER'
  | 'LEFT_ELBOW'
  | 'RIGHT_ELBOW'
  | 'LEFT_WRIST'
  | 'RIGHT_WRIST'
  | 'LEFT_PINKY'
  | 'RIGHT_PINKY'
  | 'LEFT_INDEX'
  | 'RIGHT_INDEX'
  | 'LEFT_THUMB'
  | 'RIGHT_THUMB'
  | 'LEFT_HIP'
  | 'RIGHT_HIP'
  | 'LEFT_KNEE'
  | 'RIGHT_KNEE'
  | 'LEFT_ANKLE'
  | 'RIGHT_ANKLE'
  | 'LEFT_HEEL'
  | 'RIGHT_HEEL'
  | 'LEFT_FOOT_INDEX'
  | 'RIGHT_FOOT_INDEX'

type LocalMotionReplaySample = {
  frame: MotionReplayFrame
  meanConfidence: number
  trackingOk: boolean
  progress: number
}

type CompactReplayMarker = MotionReplaySegment & {
  kind: 'count' | 'coaching'
}

type RawReplayLandmark = {
  x: number
  y: number
  z: number | null
  confidence: number
}

type CompleteMotionReplayLandmarkTuple = readonly [number, number, number | null, number]

type LandmarkPayload = {
  name: string
  x: number
  y: number
  z?: number
  visibility?: number
}

type GymnasticsFeedbackTts = {
  should_play: boolean
  key: string | null
  text: string | null
  priority: 'tracking' | 'posture' | null
}

type GymnasticsNormalizedPoseLandmark = {
  name: string
  x: number | null
  y: number | null
  z: number | null
  confidence: number | null
}

type GymnasticsNormalizedPose = {
  tracking: string
  timestamp_ms: number
  landmarks: GymnasticsNormalizedPoseLandmark[]
}

type GymnasticsReplayMetadata = {
  motion_id: string
  timestamp_ms: number
  tracking: string
  frame_label?: string | null
  progress_count?: number | null
  hold_duration_ms?: number | null
  hold_completed?: boolean | null
  guidance_code?: string | null
  guidance_text?: string | null
}

type GymnasticsAiResponse = {
  state: string
  step_count?: number
  accuracy: number
  feedback: string | null
  tracking: string
  hold_duration_ms?: number
  hold_completed?: boolean
  hold_last_timestamp_ms?: number | null
  last_counted_side?: string | null
  last_seen_side?: string | null
  left_armed?: boolean
  right_armed?: boolean
  reference_hip_x: number | null
  reference_hip_y: number | null
  reference_scale: number | null
  displayed_feedback_code: string | null
  displayed_feedback_text: string | null
  displayed_feedback_frames: number
  candidate_feedback_code: string | null
  candidate_feedback_text: string | null
  candidate_feedback_streak: number
  representative_feedback_totals: Record<string, number>
  representative_feedback_code: string | null
  representative_feedback_text: string | null
  representative_feedback_frames: number
  baseline_left_step_extent?: number | null
  baseline_right_step_extent?: number | null
  baseline_ankle_span?: number | null
  baseline_left_wrist_forward?: number | null
  baseline_right_wrist_forward?: number | null
  baseline_stance_span?: number | null
  tts?: GymnasticsFeedbackTts
  normalized_pose?: GymnasticsNormalizedPose | null
  replay_metadata?: GymnasticsReplayMetadata | null
}

type GymnasticsAiState = {
  previousState: string
  stepCount: number
  holdDurationMs: number
  holdCompleted: boolean
  holdLastTimestampMs: number | null
  lastCountedSide: string | null
  lastSeenSide: string | null
  leftArmed: boolean
  rightArmed: boolean
  referenceHipX: number | null
  referenceHipY: number | null
  referenceScale: number | null
  displayedFeedbackCode: string | null
  displayedFeedbackText: string | null
  displayedFeedbackFrames: number
  candidateFeedbackCode: string | null
  candidateFeedbackText: string | null
  candidateFeedbackStreak: number
  representativeFeedbackTotals: Record<string, number>
  representativeFeedbackCode: string | null
  representativeFeedbackText: string | null
  representativeFeedbackFrames: number
  baselineLeftStepExtent: number | null
  baselineRightStepExtent: number | null
  baselineAnkleSpan: number | null
  baselineLeftWristForward: number | null
  baselineRightWristForward: number | null
  baselineStanceSpan: number | null
  baselineLeftKneeY: number | null
  baselineRightKneeY: number | null
  baselineLeftWristZ: number | null
  baselineRightWristZ: number | null
  accuracy: number
  tracking: string
  feedback: string | null
  localPhase: 'ready' | 'active' | 'returning'
  lastLocalRepAtMs: number
}

const AI_BASE_URL = (import.meta.env.VITE_AI_BASE_URL ?? 'http://localhost:8001/api/v1').replace(
  /\/$/,
  '',
)
const GYMNASTICS_PLAY_BACKGROUND_TEXTURE_KEY = 'gymnastics-play-background-v3'

const TOP_AI_SEQUENCE: AiMotionSpec[] = [
  { type: 'top', kind: 'march', exerciseMotionId: 1, targetSteps: 5 },
  { type: 'top', kind: 'side-step', exerciseMotionId: 2, targetSteps: 5 },
  { type: 'top', kind: 'diagonal-body-punch', exerciseMotionId: 3, targetSteps: 5 },
  { type: 'top', kind: 'diagonal-face-punch', exerciseMotionId: 4, targetSteps: 5 },
  { type: 'top', kind: 'squat', exerciseMotionId: 5, targetSteps: 5 },
]

const DEFAULT_DANIEL_TARGET_HOLD_MS = 10_000

const DANIEL_AI_SEQUENCE: AiMotionSpec[] = [
  {
    type: 'daniel',
    kind: 'daniel_forward_press',
    exerciseMotionId: 6,
    targetHoldMs: DEFAULT_DANIEL_TARGET_HOLD_MS,
  },
  {
    type: 'daniel',
    kind: 'daniel_upward_press',
    exerciseMotionId: 7,
    targetHoldMs: DEFAULT_DANIEL_TARGET_HOLD_MS,
  },
  {
    type: 'daniel',
    kind: 'daniel_side_bend_left',
    exerciseMotionId: 8,
    targetHoldMs: DEFAULT_DANIEL_TARGET_HOLD_MS,
  },
  {
    type: 'daniel',
    kind: 'daniel_side_bend_right',
    exerciseMotionId: 9,
    targetHoldMs: DEFAULT_DANIEL_TARGET_HOLD_MS,
  },
  {
    type: 'daniel',
    kind: 'daniel_forward_bend',
    exerciseMotionId: 10,
    targetHoldMs: DEFAULT_DANIEL_TARGET_HOLD_MS,
  },
]

const MOTION_ENDPOINTS: Record<GymnasticsMotionKind, string> = {
  march: 'march',
  'side-step': 'side-step',
  'diagonal-body-punch': 'diagonal-body-punch',
  'diagonal-face-punch': 'diagonal-face-punch',
  squat: 'squat',
}

const DANIEL_MOTION_ENDPOINTS: Record<DanielMotionKind, string> = {
  daniel_forward_press: 'daniel-forward-press',
  daniel_upward_press: 'daniel-upward-press',
  daniel_side_bend_left: 'daniel-left-side-bend',
  daniel_side_bend_right: 'daniel-right-side-bend',
  daniel_forward_bend: 'daniel-forward-bend',
}

export const TOP_MOTIONS: GymnasticsMotion[] = [
  {
    title: '팔 벌리기',
    goal: '양팔을 어깨 높이로 올려요',
    tips: ['양팔을 어깨 높이로', '시선은 정면', '다리는 그대로'],
  },
  {
    title: '무릎 올리기',
    goal: '무릎을 천천히 들어요',
    tips: ['등은 곧게 펴요', '무릎은 천천히', '숨은 편하게'],
  },
  {
    title: '가볍게 흔들기',
    goal: '몸을 부드럽게 움직여요',
    tips: ['작게 움직여도 좋아요', '아프면 쉬어요', '즐겁게 마무리'],
  },
]

const DANIEL_MOTIONS: GymnasticsMotion[] = [
  {
    title: '\uC190 \uAE4D\uC9C0 \uB07C\uACE0 \uC55E\uC73C\uB85C \uBC00\uAE30',
    goal: '\uC190\uC744 \uBAA8\uC544 \uC55E\uC73C\uB85C \uBC00\uACE0 \uC790\uC138\uB97C \uC720\uC9C0\uD574\uC694.',
    tips: [
      '\uC5B4\uAE68\uB97C \uC62C\uB9AC\uC9C0 \uC54A\uACE0 \uD314\uC744 \uC55E\uC73C\uB85C \uBC00\uC5B4\uC694.',
      '\uC190\uBAA9\uC740 \uC5B4\uAE68 \uB192\uC774\uC5D0 \uB9DE\uCD94\uC5B4\uC694.',
      '\uD5C8\uB9AC\uB294 \uBC18\uB4EF\uD558\uAC8C \uC138\uC6CC\uC694.',
    ],
  },
  {
    title: '\uC190 \uAE4D\uC9C0 \uB07C\uACE0 \uC704\uB85C \uBC00\uAE30',
    goal: '\uC190\uC744 \uC704\uB85C \uC62C\uB824 \uB298\uC5B4\uB098\uB294 \uC790\uC138\uB97C \uC720\uC9C0\uD574\uC694.',
    tips: [
      '\uD314\uAF08\uCE58\uB97C \uD3B4\uACE0 \uC190\uC744 \uB192\uAC8C \uC62C\uB824\uC694.',
      '\uC591\uC190 \uB192\uC774\uB97C \uBE44\uC2B7\uD558\uAC8C \uB9DE\uCD94\uC5B4\uC694.',
      '\uBAB8\uC774 \uD55C\uCABD\uC73C\uB85C \uAE30\uC6B8\uC9C0 \uC54A\uAC8C \uD574\uC694.',
    ],
  },
  {
    title: '\uC67C\uCABD \uC606\uAD6C\uB9AC \uAD7D\uD788\uAE30',
    goal: '\uC190\uC744 \uC704\uB85C \uC62C\uB9B0 \uCC44 \uC67C\uCABD\uC73C\uB85C \uCC9C\uCC9C\uD788 \uAE30\uC6B8\uC5EC\uC694.',
    tips: [
      '\uD314\uC744 \uD3B4\uACE0 \uC606\uAD6C\uB9AC\uAC00 \uB298\uC5B4\uB098\uAC8C \uD574\uC694.',
      '\uACE8\uBC18\uC774 \uB108\uBB34 \uBC00\uB9AC\uC9C0 \uC54A\uAC8C \uC720\uC9C0\uD574\uC694.',
      '\uBB34\uB9AC\uD558\uC9C0 \uC54A\uACE0 \uC720\uC9C0\uD574\uC694.',
    ],
  },
  {
    title: '\uC624\uB978\uCABD \uC606\uAD6C\uB9AC \uAD7D\uD788\uAE30',
    goal: '\uC190\uC744 \uC704\uB85C \uC62C\uB9B0 \uCC44 \uC624\uB978\uCABD\uC73C\uB85C \uCC9C\uCC9C\uD788 \uAE30\uC6B8\uC5EC\uC694.',
    tips: [
      '\uD314\uC744 \uD3B4\uACE0 \uC606\uAD6C\uB9AC\uAC00 \uB298\uC5B4\uB098\uAC8C \uD574\uC694.',
      '\uACE8\uBC18\uC774 \uB108\uBB34 \uBC00\uB9AC\uC9C0 \uC54A\uAC8C \uC720\uC9C0\uD574\uC694.',
      '\uBB34\uB9AC\uD558\uC9C0 \uC54A\uACE0 \uC720\uC9C0\uD574\uC694.',
    ],
  },
  {
    title: '\uC190 \uAE4D\uC9C0 \uB07C\uACE0 \uC544\uB798\uB85C \uC219\uC774\uAE30',
    goal: '\uBB34\uB98E\uC744 \uD3B4\uACE0 \uC0C1\uCCB4\uB97C \uC55E\uC73C\uB85C \uC219\uC5EC\uC694.',
    tips: [
      '\uBB34\uB98E\uC774 \uAD7D\uD600\uC9C0\uC9C0 \uC54A\uAC8C \uD574\uC694.',
      '\uC190\uC740 \uC790\uC5F0\uC2A4\uB7FD\uAC8C \uC544\uB798\uB85C \uB0B4\uB824\uC694.',
      '\uCC9C\uCC9C\uD788 \uC219\uC774\uACE0 \uC790\uC138\uB97C \uC720\uC9C0\uD574\uC694.',
    ],
  },
]

const TOP_AI_MOTIONS: GymnasticsMotion[] = [
  {
    title: '제자리 걷기',
    goal: '왼쪽 무릎과 오른쪽 무릎을 번갈아 들어요.',
    tips: ['무릎을 조금 더 높이 들어요', '상체는 곧게 세워요', '제자리에서 움직여요'],
  },
  {
    title: '사이드 스텝',
    goal: '다리를 옆으로 크게 벌렸다가 다시 모아요.',
    tips: ['발까지 보이게 서요', '옆으로 크게 벌려요', '다시 중앙으로 돌아와요'],
  },
  {
    title: '대각선 몸통 지르기',
    goal: '몸통 높이로 양팔을 번갈아 앞으로 뻗어요.',
    tips: ['팔을 앞으로 뻗어요', '반대쪽 팔도 번갈아 해요', '몸은 정면을 봐요'],
  },
  {
    title: '대각선 얼굴 지르기',
    goal: '얼굴 높이로 양팔을 번갈아 앞으로 뻗어요.',
    tips: ['주먹을 더 높게 올려요', '팔을 앞으로 뻗어요', '좌우를 번갈아 해요'],
  },
  {
    title: '스쿼트',
    goal: '무릎을 굽혀 앉았다가 천천히 일어나요.',
    tips: ['무릎까지 보이게 서요', '조금 더 깊이 앉아요', '천천히 일어나요'],
  },
]

const FLAT_COLORS = {
  surface: 0xfffbf2,
  surfaceAlt: 0xfff6e7,
  border: 0xe3c28d,
  accent: 0x7f4a24,
  text: '#2f2116',
  muted: '#7a5430',
  primary: 0x2f9e58,
  primaryDark: 0x237a42,
  secondary: 0xfff6e7,
}
const HEADER_FRAME_TEXTURE_KEY = 'gymnastics-header-frame-cropped'
const HEADER_FRAME_CROP = { x: 38, y: 165, width: 1924, height: 315 }
const HEADER_FRAME_CAP_WIDTH = 260
const FEEDBACK_MAIN_Y_RATIO = 0.5
const FEEDBACK_TITLE_MIN_VISIBLE_MS = 4800
const FEEDBACK_DETAIL_MIN_VISIBLE_MS = 4200
const FEEDBACK_PROGRESS_DETAIL_MIN_VISIBLE_MS = 1200
const FEEDBACK_MAIN_MAX_FONT_SIZE = 54
const FEEDBACK_MAIN_MIN_FONT_SIZE = 32
const FEEDBACK_TIMER_MAX_FONT_SIZE = 44
const FEEDBACK_TIMER_MIN_FONT_SIZE = 26
const AI_EVALUATION_INTERVAL_MS = 550
const REPLAY_FPS = 30
const REPLAY_VERSION = 2
const COMPACT_REPLAY_FPS = 5
const REPLAY_SAMPLE_INTERVAL_MS = 1000 / REPLAY_FPS
const REPLAY_MAX_FRAMES = REPLAY_FPS * 180
// Child webcam captures often report low landmark visibility. Keep weak points
// for replay continuity, then rely on normalization checks to drop unusable frames.
const REPLAY_MIN_CONFIDENCE = 0.05
const REPLAY_MIN_SHOULDER_WIDTH = 0.02
const REPLAY_NORMALIZED_COORDINATE_ABS_LIMIT = 10
const REPLAY_MAX_INTERPOLATION_GAP_FRAMES = 5
const REPLAY_INTERPOLATED_CONFIDENCE_DECAY = 0.35
const REPLAY_MAX_INTERPOLATED_CONFIDENCE = 0.3
const COMPACT_REPLAY_MAX_MARKERS = 32
const COMPACT_REPLAY_MARKER_MERGE_GAP_MS = 500
const TOP_COUNT_MARKER_WINDOW_MS = 2000
const COACHING_MARKER_WINDOW_MS = 1200
const REPLAY_LANDMARK_NAMES: readonly ReplayLandmarkName[] = [
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
]
const REPLAY_REQUIRED_TRACKING_NAMES: readonly ReplayLandmarkName[] = [
  'LEFT_SHOULDER',
  'RIGHT_SHOULDER',
  'LEFT_HIP',
  'RIGHT_HIP',
  'LEFT_KNEE',
  'RIGHT_KNEE',
  'LEFT_ANKLE',
  'RIGHT_ANKLE',
]
const AI_REQUEST_RETRY_DELAY_MS = 2000
const GYMNASTICS_COUNTDOWN_SECONDS = 3
const FRAME_TEXT_COLOR = '#5a2f12'
const FRAME_TEXT_STROKE = '#fff0c8'
const FRAME_TEXT_SHADOW = '#2f1708'

function createInitialAiState(): GymnasticsAiState {
  return {
    previousState: 'idle',
    stepCount: 0,
    holdDurationMs: 0,
    holdCompleted: false,
    holdLastTimestampMs: null,
    lastCountedSide: null,
    lastSeenSide: null,
    leftArmed: true,
    rightArmed: true,
    referenceHipX: null,
    referenceHipY: null,
    referenceScale: null,
    displayedFeedbackCode: null,
    displayedFeedbackText: null,
    displayedFeedbackFrames: 0,
    candidateFeedbackCode: null,
    candidateFeedbackText: null,
    candidateFeedbackStreak: 0,
    representativeFeedbackTotals: {},
    representativeFeedbackCode: null,
    representativeFeedbackText: null,
    representativeFeedbackFrames: 0,
    baselineLeftStepExtent: null,
    baselineRightStepExtent: null,
    baselineAnkleSpan: null,
    baselineLeftWristForward: null,
    baselineRightWristForward: null,
    baselineStanceSpan: null,
    baselineLeftKneeY: null,
    baselineRightKneeY: null,
    baselineLeftWristZ: null,
    baselineRightWristZ: null,
    accuracy: 0,
    tracking: 'idle',
    feedback: null,
    localPhase: 'ready',
    lastLocalRepAtMs: 0,
  }
}

class GymnasticsPlaySceneBase extends Phaser.Scene {
  private phase: GymnasticsPlayPhase = 'GUIDE_PREVIEW'
  private motionIndex = 0
  private remainingSeconds = 72
  private poseTracker: PoseTracker | null = null
  private cameraCanvas!: HTMLCanvasElement
  private cameraContext!: CanvasRenderingContext2D
  private cameraTexture!: Phaser.Textures.CanvasTexture
  private cameraBounds!: PanelBounds
  private statusBadgeBounds!: PanelBounds
  private statusDot!: Phaser.GameObjects.Arc
  private statusText!: Phaser.GameObjects.Text
  private motionTitleText!: Phaser.GameObjects.Text
  private timerText!: Phaser.GameObjects.Text
  private feedbackLabelText?: Phaser.GameObjects.Text
  private feedbackTitleText!: Phaser.GameObjects.Text
  private feedbackTipTexts: Phaser.GameObjects.Text[] = []
  private progressLabelText?: Phaser.GameObjects.Text
  private holdProgressTrack!: Phaser.GameObjects.Rectangle
  private holdProgressBar!: Phaser.GameObjects.Rectangle
  private holdProgressText!: Phaser.GameObjects.Text
  private holdProgressWidth = 0
  private progressTextFontSize = 0
  private progressCompleteFontSize = 0
  private progressTextCenterX = 0
  private progressTextCenterY = 0
  private progressCompleteCenterY = 0
  private feedbackFrameBounds!: PanelBounds
  private timerEvent?: Phaser.Time.TimerEvent
  private isCameraRecognized = false
  private motionCounterMaxWidth = 0
  private motionTitleMaxWidth = 0
  private motionTitleCenterX = 0
  private motionTitleCenterY = 0
  private headerFontSize = 0
  private feedbackTitleMaxWidth = 0
  private feedbackTitleCenterX = 0
  private feedbackTitleCenterY = 0
  private feedbackTitleFontSize = 0
  private saveStatusTitleCenterY = 0
  private saveStatusTitleFontSize = 0
  private holdStatusMaxWidth = 0
  private displayedFeedbackTitle = ''
  private feedbackTitleChangedAtMs = 0
  private displayedFeedbackDetail = ''
  private feedbackDetailChangedAtMs = 0
  private requestInFlight = false
  private lastAiEvaluationRequestedAtMs = 0
  private aiRequestsEnabled = true
  private aiRetryAvailableAtMs = 0
  private aiConnectionIssue = false
  private lastLoggedAiRequestUrl = ''
  private poseMissCount = 0
  private lastPoseDiagnosticAtMs = 0
  private isMotionAdvancing = false
  private aiState = createInitialAiState()
  private didTopCountIncrease = false
  private didDanielComplete = false
  private aiError: string | null = null
  private sessionStartedAtMs = 0
  private motionStartedAtMs = 0
  private motionAccumulatedDurationMs = 0
  private motionReplaySamples: LocalMotionReplaySample[] = []
  private compactReplayMarkers: CompactReplayMarker[] = []
  private lastReplaySampleAtMs = Number.NEGATIVE_INFINITY
  private motionRecords: LocalExerciseMotionRecord[] = []
  private motionRecorderHandle: ScreenRecorderHandle | null = null
  private pendingMotionUploads: Promise<void>[] = []
  private sessionIdPromise: Promise<number> | null = null
  private exerciseSessionPatientProfileId: number | null = null
  private hasSubmittedSession = false
  private saveState: 'idle' | 'saving' | 'success' | 'error' = 'idle'
  private saveRetryButton?: Phaser.GameObjects.Text
  private finishButton?: Phaser.GameObjects.Container
  private sessionResultPanel?: Phaser.GameObjects.Container
  private lastTtsKey: string | null = null
  private lastTtsPlayedAtMs = 0
  private guideOverlay?: Phaser.GameObjects.Container
  private guideVideoElement?: HTMLVideoElement
  private guideVideoResizeHandler?: () => void
  private sideGuideVideoBounds?: PanelBounds
  private sideGuideStatusText?: Phaser.GameObjects.Text
  private adminMotionsById = new Map<number, ExerciseMotion>()
  private exerciseMotionsLoaded = false
  private countdownOverlay?: Phaser.GameObjects.Container
  private countdownTimers: Phaser.Time.TimerEvent[] = []

  constructor(
    sceneKey: string,
    private readonly motions: GymnasticsMotion[],
    _modeLabel: string,
    private readonly exerciseType: ExerciseType,
    private readonly aiSequence: AiMotionSpec[],
  ) {
    super({ key: sceneKey })
  }

  preload() {
    this.load.image(
      GYMNASTICS_PLAY_BACKGROUND_TEXTURE_KEY,
      assetPath('images/themes/gymnastics/background/gymbackground.png'),
    )
    this.load.image(
      'gymnastics-raccoon',
      assetPath('images/themes/gymnastics/characters/Raccoon.png'),
    )
    this.load.image(
      'gymnastics-pose-frame',
      assetPath('images/themes/gymnastics/ui/GuideframeUI.png'),
    )
    this.load.image(
      'gymnastics-feedback-frame',
      assetPath('images/themes/gymnastics/ui/feedfackframeUI.png'),
    )
    this.load.image('gymnastics-feedback-star', assetPath('images/themes/gymnastics/ui/star.png'))
    this.load.image('gymnastics-header-frame', assetPath('images/themes/gymnastics/ui/FrameUI.png'))
    this.load.image(
      'gymnastics-delete-button',
      assetPath('images/themes/gymnastics/ui/delete_btn.png'),
    )
  }

  create() {
    playSceneBgm(this)
    const { width: vw, height: vh } = this.scale
    this.phase = 'GUIDE_PREVIEW'
    this.motionIndex = 0
    this.remainingSeconds = 72
    this.isCameraRecognized = false
    this.aiState = createInitialAiState()
    this.aiError = null
    this.requestInFlight = false
    this.lastAiEvaluationRequestedAtMs = 0
    this.aiRequestsEnabled = false
    this.aiRetryAvailableAtMs = 0
    this.aiConnectionIssue = false
    this.lastLoggedAiRequestUrl = ''
    this.poseMissCount = 0
    this.lastPoseDiagnosticAtMs = 0
    this.isMotionAdvancing = false
    this.displayedFeedbackTitle = ''
    this.feedbackTitleChangedAtMs = 0
    this.displayedFeedbackDetail = ''
    this.feedbackDetailChangedAtMs = 0
    this.sessionStartedAtMs = 0
    this.motionStartedAtMs = 0
    this.motionAccumulatedDurationMs = 0
    this.resetCurrentMotionReplay()
    this.motionRecords = []
    this.motionRecorderHandle = null
    this.pendingMotionUploads = []
    this.sessionIdPromise = null
    this.exerciseSessionPatientProfileId = null
    this.hasSubmittedSession = false
    this.saveState = 'idle'
    this.lastTtsKey = null
    this.lastTtsPlayedAtMs = 0
    this.adminMotionsById.clear()
    this.exerciseMotionsLoaded = false
    stopFeedbackSpeech()

    addCoverBackground(this, GYMNASTICS_PLAY_BACKGROUND_TEXTURE_KEY).setDepth(0)
    this.add.rectangle(vw / 2, vh / 2, vw, vh, 0x2d1b10, 0.16).setDepth(1)

    this.createCameraTexture()
    this.createHeaderFrameTexture()
    this.createLayout(vw, vh)
    this.renderMotion()
    void this.loadExerciseMotionGuides()
    void this.checkAiServiceHealth()
    this.startPoseTracker()
    this.showGuidePreview()

    this.timerEvent = this.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () => {
        if (this.phase !== 'TRACKING') return
        this.remainingSeconds = Math.max(0, this.remainingSeconds - 1)
        this.updateHeaderStats()
        this.refreshMotionProgressDisplay()
      },
    })

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup())
    this.cameras.main.fadeIn(220, 0, 0, 0)
    this.createFinishButton(vw)
  }

  private createFinishButton(vw: number) {
    if (this.finishButton) return
    const btnW = 116
    const btnH = 50
    const radius = 14
    const container = this.add.container(vw - 28, 28).setDepth(40)
    const shadow = this.add.graphics()
    shadow.fillStyle(0x2d1b10, 0.32)
    shadow.fillRoundedRect(-btnW + 2, 4, btnW, btnH, radius)
    const bg = this.add.graphics()
    bg.fillStyle(0x6b3f1c, 0.96)
    bg.fillRoundedRect(-btnW, 0, btnW, btnH, radius)
    bg.lineStyle(2, 0xd6a56d, 0.95)
    bg.strokeRoundedRect(-btnW, 0, btnW, btnH, radius)
    const label = this.add
      .text(-btnW / 2, btnH / 2 - 1, '종료', {
        fontFamily: 'sans-serif',
        fontSize: '22px',
        color: '#ffefc0',
        fontStyle: '800',
        stroke: '#3a2110',
        strokeThickness: 2,
      })
      .setOrigin(0.5)
    const hitArea = this.add
      .rectangle(-btnW / 2, btnH / 2, btnW, btnH, 0xffffff, 0)
      .setInteractive({ useHandCursor: true })
    hitArea.on('pointerdown', () => {
      if (
        this.hasSubmittedSession ||
        this.saveState === 'saving' ||
        this.saveState === 'success' ||
        this.sessionResultPanel
      ) {
        return
      }
      void this.finishExerciseSession()
    })
    hitArea.on('pointerover', () => container.setScale(1.04))
    hitArea.on('pointerout', () => container.setScale(1))
    container.add([shadow, bg, label, hitArea])
    this.finishButton = container
  }

  private showSessionResultPanel(motionCount: number, averageAccuracy: number): boolean {
    if (this.sessionResultPanel) return true
    this.finishButton?.setVisible(false)

    const { width: vw, height: vh } = this.scale
    const overlay = this.add.container(vw / 2, vh / 2).setDepth(46)
    const dim = this.add.rectangle(0, 0, vw, vh, 0x2d1b10, 0.6).setInteractive()
    const panelWidth = Math.min(vw * 0.5, 520)
    const panelHeight = Math.min(vh * 0.5, 440)
    const panel = this.add
      .rectangle(0, 0, panelWidth, panelHeight, 0xfff5dc, 0.98)
      .setStrokeStyle(4, 0xd7a750, 0.95)
    const title = this.add
      .text(0, -panelHeight * 0.36, '체조 완료', {
        fontFamily: 'sans-serif',
        fontSize: '32px',
        color: '#5a3517',
        fontStyle: '800',
      })
      .setOrigin(0.5)
    const lines = [
      `완료한 동작  ${motionCount}개`,
      `평균 수행률  ${Math.round(averageAccuracy * 100)}%`,
    ]
    const stats = this.add
      .text(0, -panelHeight * 0.06, lines.join('\n'), {
        fontFamily: 'sans-serif',
        fontSize: '22px',
        color: '#4d2d18',
        align: 'center',
        lineSpacing: 14,
      })
      .setOrigin(0.5)
    const confirmBtn = this.add
      .text(0, panelHeight * 0.35, '확인', {
        fontFamily: 'sans-serif',
        fontSize: '26px',
        color: '#ffffff',
        backgroundColor: '#4d9b5d',
        padding: { left: 36, right: 36, top: 10, bottom: 10 },
        fontStyle: '700',
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
    confirmBtn.on('pointerdown', () => this.closeSessionResultPanel())

    overlay.add([dim, panel, title, stats, confirmBtn])
    this.sessionResultPanel = overlay
    return true
  }

  private closeSessionResultPanel() {
    const overlay = this.sessionResultPanel
    this.sessionResultPanel = undefined
    overlay?.destroy(true)
    fadeToScene(this, 'GymnasticsSelectScene')
  }

  update() {
    this.drawCameraFrame()
    if (this.phase === 'TRACKING') {
      this.evaluateCurrentPose()
    }
  }

  private createCameraTexture() {
    this.cameraCanvas = document.createElement('canvas')
    this.cameraCanvas.width = 960
    this.cameraCanvas.height = 720
    const context = this.cameraCanvas.getContext('2d')
    if (!context) {
      throw new Error('Camera canvas context is not available.')
    }
    this.cameraContext = context

    const textureKey = `${this.scene.key}-camera`
    if (this.textures.exists(textureKey)) {
      this.textures.remove(textureKey)
    }
    const texture = this.textures.addCanvas(textureKey, this.cameraCanvas)
    if (!texture) {
      throw new Error('Camera texture is not available.')
    }
    this.cameraTexture = texture
  }

  private createHeaderFrameTexture() {
    if (this.textures.exists(HEADER_FRAME_TEXTURE_KEY)) return

    const source = this.textures.get('gymnastics-header-frame').getSourceImage() as HTMLImageElement
    const canvas = document.createElement('canvas')
    canvas.width = HEADER_FRAME_CROP.width
    canvas.height = HEADER_FRAME_CROP.height
    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('Header frame canvas context is not available.')
    }

    context.drawImage(
      source,
      HEADER_FRAME_CROP.x,
      HEADER_FRAME_CROP.y,
      HEADER_FRAME_CROP.width,
      HEADER_FRAME_CROP.height,
      0,
      0,
      HEADER_FRAME_CROP.width,
      HEADER_FRAME_CROP.height,
    )
    this.textures.addCanvas(HEADER_FRAME_TEXTURE_KEY, canvas)
  }

  private createLayout(vw: number, vh: number) {
    const margin = Phaser.Math.Clamp(Math.min(vw, vh) * 0.028, 18, 32)
    const sideW = Phaser.Math.Clamp(vw * 0.23, 300, 380)
    const gap = Phaser.Math.Clamp(vw * 0.018, 20, 28)
    const headerH = Phaser.Math.Clamp(vh * 0.074, 58, 78)
    const contentTop = margin + headerH + gap
    const availableH = vh - contentTop - margin
    const maxGroupW = vw - margin * 2
    const maxCameraW = maxGroupW - sideW - gap
    const contentH = availableH
    const cameraH = contentH
    const cameraW = Math.min(maxCameraW, cameraH * (4 / 3))
    const groupW = cameraW + gap + sideW
    const groupX = (vw - groupW) / 2
    const contentY = contentTop
    const sideX = groupX + cameraW + gap

    this.cameraBounds = {
      x: groupX,
      y: contentY,
      width: cameraW,
      height: cameraH,
    }

    this.createCameraPanel(this.cameraBounds)
    this.createSidePanels(sideX, contentY, sideW, contentH)
    this.createHeader(margin, headerH, groupX, cameraW, sideX, sideW)
  }

  createHeader(
    headerTop: number,
    headerH: number,
    headerX: number,
    headerW: number,
    rightHeaderX: number,
    rightHeaderW: number,
  ) {
    const y = headerTop + headerH / 2
    const headerGap = Math.max(8, headerH * 0.28)
    const motionPanelW = headerW
    const headerFontSize = Math.round(headerH * 0.38)
    const headerTextStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: 'sans-serif',
      fontSize: `${headerFontSize}px`,
      color: FRAME_TEXT_COLOR,
      fontStyle: 'bold',
      align: 'center',
      stroke: FRAME_TEXT_STROKE,
      strokeThickness: 3,
      shadow: {
        offsetX: 0,
        offsetY: 1,
        color: FRAME_TEXT_SHADOW,
        blur: 1,
        fill: true,
      },
    }

    this.createHeaderFrame(headerX, headerTop, motionPanelW, headerH)

    this.motionTitleMaxWidth = motionPanelW - headerH * 2.4
    this.motionTitleCenterX = headerX + motionPanelW / 2
    this.motionTitleCenterY = y
    this.motionCounterMaxWidth = Math.max(64, rightHeaderW - headerH - headerGap - 28)
    this.headerFontSize = headerFontSize

    this.motionTitleText = this.add
      .text(this.motionTitleCenterX, this.motionTitleCenterY, '', {
        ...headerTextStyle,
        fontSize: `${Math.round(headerFontSize * 0.78)}px`,
      })
      .setOrigin(0.5)
      .setDepth(12)

    this.createArrowButton(headerX + headerH * 0.54, y, headerH * 0.78, '<', () =>
      this.returnToPreviousMotion(),
    )
    this.createArrowButton(headerX + motionPanelW - headerH * 0.54, y, headerH * 0.78, '>', () =>
      this.advanceToNextMotion(true),
    )

    const timerPanelX = rightHeaderX
    const timerPanelW = Math.max(0, rightHeaderW - headerH - headerGap)
    this.createHeaderFrame(timerPanelX, headerTop, timerPanelW, headerH)
    this.timerText = this.add
      .text(timerPanelX + timerPanelW / 2, y, '', headerTextStyle)
      .setOrigin(0.5)
      .setDepth(12)

    this.updateHeaderStats()
  }

  private createCameraPanel(bounds: PanelBounds) {
    this.createPanel(bounds.x, bounds.y, bounds.width, bounds.height, 16)
    const cameraInset = 8
    const cameraRadius = 12
    const cameraImage = this.add
      .image(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, this.cameraTexture.key)
      .setDisplaySize(bounds.width - cameraInset * 2, bounds.height - cameraInset * 2)
      .setDepth(5)

    const cameraMaskShape = this.add.graphics()
    cameraMaskShape
      .fillStyle(0xffffff, 1)
      .fillRoundedRect(
        bounds.x + cameraInset,
        bounds.y + cameraInset,
        bounds.width - cameraInset * 2,
        bounds.height - cameraInset * 2,
        cameraRadius,
      )
      .setVisible(false)
    cameraImage.setMask(cameraMaskShape.createGeometryMask())

    const badgeW = 94
    const badgeH = 28
    const badgeX = bounds.x + 18
    const badgeY = bounds.y + 18
    this.statusBadgeBounds = { x: badgeX, y: badgeY, width: badgeW, height: badgeH }
    const badge = this.add.graphics().setDepth(9)
    badge.fillStyle(0x3f220c, 0.14)
    badge.fillRoundedRect(badgeX, badgeY + 2, badgeW, badgeH, 12)
    badge.fillStyle(FLAT_COLORS.surface, 0.98)
    badge.fillRoundedRect(badgeX, badgeY, badgeW, badgeH, 12)
    badge.lineStyle(1, FLAT_COLORS.border, 1)
    badge.strokeRoundedRect(badgeX, badgeY, badgeW, badgeH, 12)
    this.statusDot = this.add.circle(0, badgeY + badgeH / 2, 5.5, 0xd13b2f).setDepth(10)
    this.statusText = this.add
      .text(badgeX + 28, badgeY + badgeH / 2, '인식 불가', {
        fontFamily: 'sans-serif',
        fontSize: '13px',
        color: FLAT_COLORS.text,
        fontStyle: 'bold',
      })
      .setOrigin(0, 0.5)
      .setDepth(10)
    this.layoutStatusBadge()

    const progressPillX = badgeX
    const progressPillY = badgeY + badgeH + 10
    const progressPillW = Math.min(bounds.width * 0.48, 340)
    const progressPillH = 34
    const progressPill = this.add.graphics().setDepth(9)
    progressPill.fillStyle(0x2d1b10, 0.44)
    progressPill.fillRoundedRect(progressPillX, progressPillY, progressPillW, progressPillH, 15)
    progressPill.lineStyle(1, 0xffffff, 0.18)
    progressPill.strokeRoundedRect(progressPillX, progressPillY, progressPillW, progressPillH, 15)
    progressPill.setVisible(false)

    this.headerFontSize = Math.round(Phaser.Math.Clamp(bounds.height * 0.028, 16, 22))
    this.motionCounterMaxWidth = progressPillW - 28
    this.motionTitleMaxWidth = 1
    this.motionTitleText = this.add
      .text(0, 0, '', { fontFamily: 'sans-serif', fontSize: '1px' })
      .setVisible(false)
    this.timerText = this.add
      .text(0, 0, '', { fontFamily: 'sans-serif', fontSize: '1px' })
      .setVisible(false)
  }

  private layoutStatusBadge() {
    const dotRadius = this.statusDot.radius
    const gap = 8
    const groupW = dotRadius * 2 + gap + this.statusText.width
    const startX = this.statusBadgeBounds.x + (this.statusBadgeBounds.width - groupW) / 2
    const centerY = this.statusBadgeBounds.y + this.statusBadgeBounds.height / 2

    this.statusDot.setPosition(startX + dotRadius, centerY)
    this.statusText.setPosition(startX + dotRadius * 2 + gap, centerY)
  }

  private createSidePanels(x: number, y: number, width: number, height: number) {
    const gap = Math.round(Phaser.Math.Clamp(height * 0.018, 10, 16))
    const weights = [1.95, 1]
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0)
    const availableH = height - gap * (weights.length - 1)
    const cardHeights = weights.map(weight => (availableH * weight) / totalWeight)
    const cardBounds: PanelBounds[] = []
    let nextY = y

    for (const cardH of cardHeights) {
      cardBounds.push({ x, y: nextY, width, height: cardH })
      nextY += cardH + gap
    }

    const drawCard = (bounds: PanelBounds) => {
      const graphics = this.add.graphics().setDepth(11)
      graphics.fillStyle(0x5c3a1e, 0.22)
      graphics.fillRoundedRect(bounds.x, bounds.y + 4, bounds.width, bounds.height, 20)
      graphics.fillStyle(0xfff8e0, 0.97)
      graphics.fillRoundedRect(bounds.x, bounds.y, bounds.width, bounds.height, 20)
      graphics.lineStyle(3, 0x7e542d, 0.65)
      graphics.strokeRoundedRect(bounds.x, bounds.y, bounds.width, bounds.height, 20)
      graphics.lineStyle(2, 0xffffff, 0.55)
      graphics.strokeRoundedRect(
        bounds.x + 5,
        bounds.y + 5,
        bounds.width - 10,
        bounds.height - 10,
        15,
      )
      return graphics
    }

    cardBounds.slice(0, 2).forEach(drawCard)

    const centerX = x + width / 2
    const [guideCard, feedbackCard] = cardBounds

    const videoInsetX = 12
    const videoInsetY = 12
    this.sideGuideVideoBounds = {
      x: guideCard.x + videoInsetX,
      y: guideCard.y + videoInsetY,
      width: guideCard.width - videoInsetX * 2,
      height: guideCard.height - videoInsetY * 2,
    }
    this.sideGuideStatusText = this.add
      .text(
        centerX,
        this.sideGuideVideoBounds.y + this.sideGuideVideoBounds.height / 2,
        '\uC601\uC0C1\uC744 \uC900\uBE44 \uC911\uC785\uB2C8\uB2E4',
        {
          fontFamily: 'sans-serif',
          fontSize: `${Math.round(Phaser.Math.Clamp(guideCard.height * 0.08, 18, 24))}px`,
          color: '#2f2118',
          fontStyle: 'bold',
          align: 'center',
          wordWrap: { width: width * 0.76, useAdvancedWrap: true },
        },
      )
      .setOrigin(0.5)
      .setDepth(13)

    this.feedbackLabelText = this.add
      .text(
        centerX,
        feedbackCard.y + feedbackCard.height * 0.2,
        '\uC2E4\uC2DC\uAC04 \uD53C\uB4DC\uBC31',
        {
          fontFamily: 'sans-serif',
          fontSize: `${Math.round(Phaser.Math.Clamp(feedbackCard.height * 0.13, 22, 30))}px`,
          color: '#6b4a2f',
          fontStyle: 'bold',
          letterSpacing: 3,
        },
      )
      .setOrigin(0.5)
      .setDepth(13)

    const feedbackBodyTop = feedbackCard.y + feedbackCard.height * 0.34
    const feedbackBodyH = feedbackCard.height * 0.56
    this.feedbackFrameBounds = {
      x: feedbackCard.x + 16,
      y: feedbackBodyTop,
      width: feedbackCard.width - 32,
      height: feedbackBodyH,
    }
    this.feedbackTitleCenterX = centerX
    this.feedbackTitleCenterY = feedbackBodyTop + feedbackBodyH / 2
    this.feedbackTitleFontSize = Math.round(Phaser.Math.Clamp(feedbackCard.height * 0.25, 36, 54))
    this.saveStatusTitleCenterY = feedbackCard.y + feedbackCard.height * 0.52
    this.saveStatusTitleFontSize = Math.round(Phaser.Math.Clamp(feedbackCard.height * 0.2, 34, 46))
    this.feedbackTitleText = this.add
      .text(this.feedbackTitleCenterX, this.feedbackTitleCenterY, '', {
        fontFamily: 'sans-serif',
        fontSize: `${this.feedbackTitleFontSize}px`,
        color: '#2f2118',
        fontStyle: 'bold',
        align: 'center',
        letterSpacing: 2,
        lineSpacing: 4,
      })
      .setOrigin(0.5)
      .setDepth(13)
      .setMaxLines(1)
    this.feedbackTitleMaxWidth = width * 0.78
    this.add
      .image(centerX, feedbackCard.y + feedbackCard.height * 0.22, 'gymnastics-feedback-star')
      .setVisible(false)

    this.progressTextFontSize = Math.round(Phaser.Math.Clamp(feedbackCard.height * 0.13, 20, 30))
    this.progressCompleteFontSize = Math.round(
      Phaser.Math.Clamp(feedbackCard.height * 0.24, 34, 48),
    )
    this.progressTextCenterX = centerX
    this.progressTextCenterY = feedbackCard.y + feedbackCard.height * 0.78
    this.progressCompleteCenterY = feedbackCard.y + feedbackCard.height / 2
    this.feedbackTipTexts = [
      this.add
        .text(this.progressTextCenterX, this.progressTextCenterY, '', {
          fontFamily: 'sans-serif',
          fontSize: `${this.progressTextFontSize}px`,
          color: '#a84a3f',
          fontStyle: 'bold',
          align: 'center',
          letterSpacing: 1,
        })
        .setOrigin(0.5)
        .setDepth(13)
        .setMaxLines(1),
    ]
    this.holdStatusMaxWidth = width * 0.82
    this.feedbackTipTexts[0]?.setFixedSize(this.holdStatusMaxWidth, feedbackCard.height * 0.2)
    this.feedbackTipTexts[0]?.setVisible(false)

    this.holdProgressWidth = width * 0.82
    const holdProgressY = feedbackCard.y + feedbackCard.height * 0.91
    this.holdProgressTrack = this.add
      .rectangle(centerX, holdProgressY, this.holdProgressWidth, 16, 0x62482a, 0.16)
      .setOrigin(0.5)
      .setDepth(13)
      .setVisible(false)
    this.holdProgressBar = this.add
      .rectangle(
        centerX - this.holdProgressWidth / 2,
        holdProgressY,
        this.holdProgressWidth,
        16,
        0x7bcf7f,
        0.95,
      )
      .setOrigin(0, 0.5)
      .setScale(0, 1)
      .setDepth(14)
      .setVisible(false)
    this.holdProgressText = this.add
      .text(centerX, holdProgressY, '', { fontFamily: 'sans-serif', fontSize: '1px' })
      .setVisible(false)

    this.saveRetryButton = this.add
      .text(centerX, feedbackCard.y + feedbackCard.height * 0.82, '\uB2E4\uC2DC \uC800\uC7A5', {
        fontFamily: 'sans-serif',
        fontSize: `${Math.round(Phaser.Math.Clamp(feedbackCard.height * 0.1, 18, 22))}px`,
        color: '#ffffff',
        fontStyle: 'bold',
        align: 'center',
        backgroundColor: '#67b86b',
        padding: { x: 18, y: 8 },
      })
      .setOrigin(0.5)
      .setDepth(16)
      .setVisible(false)
      .setInteractive({ useHandCursor: true })

    this.saveRetryButton.on('pointerup', () => {
      if (this.saveState !== 'error') return
      void this.finishExerciseSession()
    })

    return
    /*

    const targetH = 0
    const feedbackY = y
    const feedbackH = height
    const frameW = width * SIDE_FRAME_VISIBLE_SCALE
    const targetFrameH = targetH * SIDE_FRAME_VISIBLE_SCALE
    const feedbackFrameH = feedbackH * SIDE_FRAME_VISIBLE_SCALE
    const frameLeft = x + (width - frameW) / 2
    const targetFrameTop = y + (targetH - targetFrameH) / 2
    const feedbackFrameTop = feedbackY + (feedbackH - feedbackFrameH) / 2
    const sectionTitleX = x + width / 2
    const targetTitleY = targetFrameTop + targetFrameH * GUIDE_TITLE_Y_RATIO
    const feedbackTitleY = feedbackFrameTop + feedbackFrameH * FEEDBACK_TITLE_Y_RATIO
    this.feedbackFrameBounds = {
      x: frameLeft,
      y: feedbackFrameTop,
      width: frameW,
      height: feedbackFrameH,
    }

    this.add
      .image(
        x + width / 2,
        y + targetH / 2,
        this.createHorizontalSlicedFrameTexture(
          'gymnastics-pose-frame',
          frameW * TARGET_POSE_FRAME_SCALE,
          targetFrameH * TARGET_POSE_FRAME_SCALE,
          GUIDE_FRAME_CAP_WIDTH,
        ),
      )
      .setDepth(11)
      .setVisible(false)
    this.add
      .text(sectionTitleX, targetTitleY, '가이드 영상', {
        fontFamily: 'sans-serif',
        fontSize: `${Math.round(Phaser.Math.Clamp(targetFrameH * 0.07, 15, 18))}px`,
        color: FRAME_TEXT_COLOR,
        fontStyle: 'bold',
        stroke: FRAME_TEXT_STROKE,
        strokeThickness: 3,
        shadow: {
          offsetX: 0,
          offsetY: 1,
          color: FRAME_TEXT_SHADOW,
          blur: 1,
          fill: true,
        },
      })
      .setOrigin(0.5)
      .setDepth(13)
      .setVisible(false)

    this.add
      .image(
        x + width / 2,
        feedbackY + feedbackH / 2,
        this.createHorizontalSlicedFrameTexture(
          'gymnastics-feedback-frame',
          frameW,
          feedbackFrameH,
          FEEDBACK_FRAME_CAP_WIDTH,
        ),
      )
      .setDepth(11)
    this.add
      .text(sectionTitleX, feedbackTitleY, '실시간 피드백', {
        fontFamily: 'sans-serif',
        fontSize: `${Math.round(Phaser.Math.Clamp(feedbackFrameH * 0.07, 15, 18))}px`,
        color: FRAME_TEXT_COLOR,
        fontStyle: 'bold',
        stroke: FRAME_TEXT_STROKE,
        strokeThickness: 3,
        shadow: {
          offsetX: 0,
          offsetY: 1,
          color: FRAME_TEXT_SHADOW,
          blur: 1,
          fill: true,
        },
      })
      .setOrigin(0.5)
      .setDepth(13)

    const feedbackTitleFontSize = Math.round(
      Phaser.Math.Clamp(
        feedbackFrameH * 0.12,
        FEEDBACK_MAIN_MIN_FONT_SIZE,
        FEEDBACK_MAIN_MAX_FONT_SIZE,
      ),
    )
    this.feedbackTitleText = this.add
      .text(
        this.feedbackFrameBounds.x + this.feedbackFrameBounds.width / 2,
        feedbackFrameTop + feedbackFrameH * FEEDBACK_MAIN_Y_RATIO,
        '',
        {
          fontFamily: 'sans-serif',
          fontSize: `${feedbackTitleFontSize}px`,
          color: '#3b2412',
          fontStyle: 'bold',
          stroke: '#fff1d0',
          strokeThickness: 2,
          align: 'center',
          letterSpacing: 2,
          lineSpacing: 0,
        },
      )
      .setOrigin(0.5)
      .setDepth(13)
      .setMaxLines(1)
    this.feedbackTitleMaxWidth = frameW * 0.82

    this.feedbackStarImage = this.add
      .image(
        sectionTitleX - Math.min(82, frameW * 0.22),
        feedbackTitleY,
        'gymnastics-feedback-star',
      )
      .setOrigin(0.5)
      .setDepth(13)
    this.feedbackStarImage.setDisplaySize(
      Math.round(Phaser.Math.Clamp(feedbackFrameH * 0.12, 32, 40)),
      Math.round(Phaser.Math.Clamp(feedbackFrameH * 0.12, 32, 40)),
    )

    this.feedbackTipTexts = [
      this.add
        .text(x + width / 2, feedbackFrameTop + feedbackFrameH * FEEDBACK_TIP_Y_RATIO, '', {
          fontFamily: 'sans-serif',
          fontSize: `${Math.round(
            Phaser.Math.Clamp(
              feedbackFrameH * 0.09,
              FEEDBACK_TIMER_MIN_FONT_SIZE,
              FEEDBACK_TIMER_MAX_FONT_SIZE,
            ),
          )}px`,
          color: '#b94122',
          fontStyle: 'bold',
          align: 'center',
          letterSpacing: 2,
          stroke: '#fff1d0',
          strokeThickness: 1,
        })
        .setOrigin(0.5)
        .setDepth(13)
        .setMaxLines(1),
    ]
    this.holdStatusMaxWidth = frameW * 0.82
    this.feedbackTipTexts[0]?.setFixedSize(
      this.holdStatusMaxWidth,
      Math.round(Phaser.Math.Clamp(feedbackFrameH * 0.16, 36, 52)),
    )

    this.holdProgressWidth = frameW * 0.66
    const holdProgressY = feedbackFrameTop + feedbackFrameH * FEEDBACK_PROGRESS_Y_RATIO
    this.holdProgressTrack = this.add
      .rectangle(x + width / 2, holdProgressY, this.holdProgressWidth, 10, 0x7a5430, 0.22)
      .setOrigin(0.5)
      .setDepth(13)
      .setVisible(false)
    this.holdProgressBar = this.add
      .rectangle(x + width / 2 - this.holdProgressWidth / 2, holdProgressY, 0, 10, 0x2f9e58, 0.86)
      .setOrigin(0, 0.5)
      .setDepth(14)
      .setVisible(false)
    this.holdProgressText = this.add
      .text(x + width / 2, feedbackFrameTop + feedbackFrameH * 0.9, '', {
        fontFamily: 'sans-serif',
        fontSize: `${Math.round(Phaser.Math.Clamp(feedbackFrameH * 0.065, 18, 22))}px`,
        color: '#5a2f12',
        fontStyle: 'bold',
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(14)
      .setMaxLines(1)
      .setVisible(false)

    this.saveRetryButton = this.add
      .text(x + width / 2, feedbackFrameTop + feedbackFrameH * 0.82, '다시 저장하기', {
        fontFamily: 'sans-serif',
        fontSize: `${Math.round(Phaser.Math.Clamp(feedbackH * 0.07, 14, 19))}px`,
        color: '#ffffff',
        fontStyle: 'bold',
        align: 'center',
        backgroundColor: '#2f9e58',
        padding: { x: 18, y: 8 },
      })
      .setOrigin(0.5)
      .setDepth(14)
      .setVisible(false)
      .setInteractive({ useHandCursor: true })

    this.saveRetryButton.on('pointerup', () => {
      if (this.saveState !== 'error') return
      void this.finishExerciseSession()
    })
  }

    */
  }

  private createPanel(x: number, y: number, width: number, height: number, radius: number) {
    const graphics = this.add.graphics().setDepth(4)
    graphics.fillStyle(0x4b250c, 0.26)
    graphics.fillRoundedRect(x, y + 7, width, height, radius)
    graphics.fillStyle(0xf3d59a, 0.98)
    graphics.fillRoundedRect(x, y, width, height, radius)
    graphics.lineStyle(4, 0x7a471c, 1)
    graphics.strokeRoundedRect(x, y, width, height, radius)
    graphics.lineStyle(2, 0xffefbd, 0.86)
    graphics.strokeRoundedRect(x + 4, y + 4, width - 8, height - 8, Math.max(4, radius - 4))
    graphics.lineStyle(2, 0x3f210c, 0.48)
    graphics.strokeRoundedRect(x + 8, y + 8, width - 16, height - 16, Math.max(4, radius - 8))
    return graphics
  }

  private createHeaderFrame(x: number, y: number, width: number, height: number) {
    const textureKey = this.createSizedHeaderFrameTexture(width, height)
    return this.add.image(x + width / 2, y + height / 2, textureKey).setDepth(10)
  }

  private createSizedHeaderFrameTexture(width: number, height: number) {
    const targetW = Math.max(1, Math.round(width))
    const targetH = Math.max(1, Math.round(height))
    const textureKey = `${HEADER_FRAME_TEXTURE_KEY}-${targetW}x${targetH}`
    if (this.textures.exists(textureKey)) return textureKey

    const source = this.textures.get(HEADER_FRAME_TEXTURE_KEY).getSourceImage() as HTMLCanvasElement
    const canvas = document.createElement('canvas')
    canvas.width = targetW
    canvas.height = targetH
    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('Sized header frame canvas context is not available.')
    }

    const sourceW = source.width
    const sourceH = source.height
    const capSrcW = Math.min(HEADER_FRAME_CAP_WIDTH, sourceW / 2)
    const dstCapW = Math.min(targetW / 2, capSrcW * (targetH / sourceH))
    const centerSrcW = sourceW - capSrcW * 2
    const centerDstW = Math.max(0, targetW - dstCapW * 2)

    context.drawImage(source, 0, 0, capSrcW, sourceH, 0, 0, dstCapW, targetH)
    if (centerDstW > 0) {
      context.drawImage(source, capSrcW, 0, centerSrcW, sourceH, dstCapW, 0, centerDstW, targetH)
    }
    context.drawImage(
      source,
      sourceW - capSrcW,
      0,
      capSrcW,
      sourceH,
      targetW - dstCapW,
      0,
      dstCapW,
      targetH,
    )

    this.textures.addCanvas(textureKey, canvas)
    return textureKey
  }

  private createCroppedFrameTexture(sourceKey: string) {
    const textureKey = `${sourceKey}-visible-crop`
    if (this.textures.exists(textureKey)) return textureKey

    const source = this.textures.get(sourceKey).getSourceImage() as
      | HTMLCanvasElement
      | HTMLImageElement
    const visibleBounds = this.getTextureVisibleBounds(source)
    const canvas = document.createElement('canvas')
    canvas.width = visibleBounds.width
    canvas.height = visibleBounds.height
    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('Cropped frame canvas context is not available.')
    }
    context.drawImage(
      source,
      visibleBounds.x,
      visibleBounds.y,
      visibleBounds.width,
      visibleBounds.height,
      0,
      0,
      visibleBounds.width,
      visibleBounds.height,
    )

    this.textures.addCanvas(textureKey, canvas)
    return textureKey
  }

  createHorizontalSlicedFrameTexture(
    sourceKey: string,
    width: number,
    height: number,
    capWidth: number,
  ) {
    const targetW = Math.max(1, Math.round(width))
    const targetH = Math.max(1, Math.round(height))
    const textureKey = `${sourceKey}-h-slice-${targetW}x${targetH}-${capWidth}`
    if (this.textures.exists(textureKey)) return textureKey

    const croppedKey = this.createCroppedFrameTexture(sourceKey)
    const source = this.textures.get(croppedKey).getSourceImage() as HTMLCanvasElement
    const sourceW = source.width
    const sourceH = source.height
    const capSrcW = Math.min(capWidth, sourceW / 2)
    const dstCapW = Math.min(targetW / 2, capSrcW * (targetH / sourceH))
    const centerSrcW = Math.max(1, sourceW - capSrcW * 2)
    const centerDstW = Math.max(0, targetW - dstCapW * 2)

    const canvas = document.createElement('canvas')
    canvas.width = targetW
    canvas.height = targetH
    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('Horizontal sliced frame canvas context is not available.')
    }

    context.drawImage(source, 0, 0, capSrcW, sourceH, 0, 0, dstCapW, targetH)
    if (centerDstW > 0) {
      context.drawImage(source, capSrcW, 0, centerSrcW, sourceH, dstCapW, 0, centerDstW, targetH)
    }
    context.drawImage(
      source,
      sourceW - capSrcW,
      0,
      capSrcW,
      sourceH,
      targetW - dstCapW,
      0,
      dstCapW,
      targetH,
    )

    this.textures.addCanvas(textureKey, canvas)
    return textureKey
  }

  private getTextureVisibleBounds(source: HTMLCanvasElement | HTMLImageElement) {
    const canvas = document.createElement('canvas')
    canvas.width = source.width
    canvas.height = source.height
    const context = canvas.getContext('2d')
    if (!context) {
      return { x: 0, y: 0, width: source.width, height: source.height }
    }

    context.drawImage(source, 0, 0)
    const pixels = context.getImageData(0, 0, source.width, source.height).data
    let minX = source.width
    let minY = source.height
    let maxX = -1
    let maxY = -1

    for (let y = 0; y < source.height; y += 1) {
      for (let x = 0; x < source.width; x += 1) {
        const alpha = pixels[(y * source.width + x) * 4 + 3]
        if (alpha <= 8) continue
        minX = Math.min(minX, x)
        minY = Math.min(minY, y)
        maxX = Math.max(maxX, x)
        maxY = Math.max(maxY, y)
      }
    }

    if (maxX < minX || maxY < minY) {
      return { x: 0, y: 0, width: source.width, height: source.height }
    }

    return {
      x: minX,
      y: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
    }
  }

  private createArrowButton(
    x: number,
    y: number,
    size: number,
    label: string,
    onClick: () => void,
  ) {
    const container = this.add.container(x, y).setDepth(14)
    const width = size
    const height = size
    const direction = label === '<' ? -1 : 1
    const arrow = this.add.graphics()
    const arrowW = size * 0.36
    const arrowH = size * 0.28
    const bevel = size * 0.08
    const tipX = direction * arrowW * 0.46
    const backX = -direction * arrowW * 0.38

    const drawWoodArrow = (offsetX: number, offsetY: number, fill: number, alpha = 1) => {
      arrow.fillStyle(fill, alpha)
      arrow.beginPath()
      arrow.moveTo(backX + offsetX, -arrowH * 0.5 + offsetY)
      arrow.lineTo(tipX + offsetX, offsetY)
      arrow.lineTo(backX + offsetX, arrowH * 0.5 + offsetY)
      arrow.lineTo(backX - direction * bevel + offsetX, arrowH * 0.32 + offsetY)
      arrow.lineTo(backX - direction * bevel + offsetX, -arrowH * 0.32 + offsetY)
      arrow.closePath()
      arrow.fillPath()
    }

    drawWoodArrow(0, 2, 0x5b2f14, 0.22)
    drawWoodArrow(0, 0, 0xa86d38)
    arrow.lineStyle(2, 0xd6a56d, 0.55)
    arrow.beginPath()
    arrow.moveTo(backX - direction * bevel * 0.6, -arrowH * 0.28)
    arrow.lineTo(backX + direction * arrowW * 0.12, -arrowH * 0.16)
    arrow.strokePath()

    const hitArea = this.add.rectangle(0, 0, width, height, 0xffffff, 0).setInteractive({
      useHandCursor: true,
    })
    hitArea.on('pointerdown', onClick)

    container.add([arrow, hitArea])
    return container
  }

  private async startPoseTracker() {
    try {
      const tracker = new PoseTracker({
        delegate: 'CPU',
        minPoseDetectionConfidence: 0.25,
        minPosePresenceConfidence: 0.25,
        minTrackingConfidence: 0.25,
        video: {
          facingMode: 'user',
          width: { ideal: 960 },
          height: { ideal: 720 },
        },
      })
      await tracker.start()
      this.poseTracker = tracker
    } catch (error) {
      this.poseTracker = null
      this.aiError = error instanceof Error ? error.message : 'Camera start failed'
      this.updateRecognitionStatus(false)
    }
  }

  private async checkAiServiceHealth() {
    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => controller.abort(), 2500)

    try {
      const response = await fetch(`${AI_BASE_URL}/health`, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      })

      if (!response.ok) {
        this.markAiConnectionIssue(`AI health check failed: ${response.status}`)
        return
      }

      this.clearAiConnectionIssue()
      console.info('[GymnasticsPlayScene] AI service connected:', AI_BASE_URL)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'AI health check failed'
      this.markAiConnectionIssue(message)
    } finally {
      window.clearTimeout(timeoutId)
    }
  }

  private canReadCameraFrame() {
    return Boolean(
      this.poseTracker?.video &&
      this.poseTracker.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA,
    )
  }

  private async loadExerciseMotionGuides() {
    try {
      const response = await listExerciseMotions(this.exerciseType)
      const motions = response.data ?? []
      this.adminMotionsById = new Map(motions.map(motion => [motion.id, motion]))
    } catch (error) {
      console.warn('[GymnasticsPlayScene] Failed to load exercise guide videos.', error)
    } finally {
      this.exerciseMotionsLoaded = true

      if (this.phase === 'GUIDE_PREVIEW' && this.scene.isActive()) {
        this.showGuidePreview()
      }
      this.renderMotion()
    }
  }

  private getCurrentGuideVideoUrl() {
    const motionSpec = this.getCurrentAiMotionSpec()
    const adminMotion = this.adminMotionsById.get(motionSpec.exerciseMotionId)
    return adminMotion?.demoVideoUrl?.trim() || null
  }

  private getMotionDisplayTitle(index: number = this.motionIndex) {
    const motion = this.motions[index]
    const motionSpec = this.aiSequence[index] ?? this.aiSequence[this.aiSequence.length - 1]
    const adminName = this.adminMotionsById.get(motionSpec.exerciseMotionId)?.name.trim()
    return adminName || motion.title
  }

  private showGuidePreview() {
    this.clearCountdownOverlay()
    this.clearGuideOverlay()
    this.phase = 'GUIDE_PREVIEW'
    this.aiRequestsEnabled = false
    this.requestInFlight = false

    const { width: vw, height: vh } = this.scale
    const motion = this.motions[this.motionIndex]
    const motionTitleText = this.getMotionDisplayTitle()
    const overlay = this.add.container(0, 0).setDepth(30)
    const dim = this.add.rectangle(vw / 2, vh / 2, vw, vh, 0x24170f, 0.9)
    const panelWidthRatio = vw < 1400 ? 0.94 : vw >= 2200 ? 0.82 : 0.9
    const panelMaxW = vw >= 2200 ? 1780 : 1620
    const panelW = Math.min(vw * panelWidthRatio, panelMaxW)
    const panelH = Math.min(vh * 0.96, 1120)
    const panelX = (vw - panelW) / 2
    const panelY = (vh - panelH) / 2
    const panel = this.add.graphics()
    panel.fillStyle(0xf7dfaa, 0.98)
    panel.fillRoundedRect(panelX, panelY, panelW, panelH, 22)
    panel.lineStyle(4, 0x7a471c, 1)
    panel.strokeRoundedRect(panelX, panelY, panelW, panelH, 22)
    panel.lineStyle(2, 0xfff2c5, 0.86)
    panel.strokeRoundedRect(panelX + 7, panelY + 7, panelW - 14, panelH - 14, 16)

    const contentPadX = Math.round(Phaser.Math.Clamp(panelW * 0.026, 26, 42))
    const topPad = Math.round(Phaser.Math.Clamp(panelH * 0.018, 14, 22))
    const bottomPad = Math.round(Phaser.Math.Clamp(panelH * 0.02, 16, 24))
    const columnGap = Math.round(Phaser.Math.Clamp(panelW * 0.014, 16, 26))
    const headerTop = panelY + topPad
    const stepPillH = Math.round(Phaser.Math.Clamp(panelH * 0.046, 36, 44))
    const mainTop = headerTop
    const mainBottom = panelY + panelH - bottomPad
    const mainH = Math.max(1, mainBottom - mainTop)
    const availableW = panelW - contentPadX * 2 - columnGap
    const videoColumnW = Math.round(availableW * 0.58)
    const infoColumnW = availableW - videoColumnW
    const videoColumnX = panelX + contentPadX
    const infoX = videoColumnX + videoColumnW + columnGap

    const guideH = mainH
    const guideW = videoColumnW
    const guideX = videoColumnX + (videoColumnW - guideW) / 2
    const guideY = mainTop
    const guideFrame = this.add.graphics()
    guideFrame.fillStyle(0xfff8df, 1)
    guideFrame.fillRoundedRect(guideX, guideY, guideW, guideH, 24)
    guideFrame.lineStyle(3, 0xb0753a, 0.88)
    guideFrame.strokeRoundedRect(guideX, guideY, guideW, guideH, 24)
    guideFrame.lineStyle(2, 0xffffff, 0.54)
    guideFrame.strokeRoundedRect(guideX + 8, guideY + 8, guideW - 16, guideH - 16, 18)

    const guideVideoUrl = this.getCurrentGuideVideoUrl()
    const guideStatusText = guideVideoUrl
      ? '가이드 영상을 불러오는 중'
      : this.exerciseMotionsLoaded
        ? '등록된 가이드 영상이 없어요'
        : '가이드 영상 확인 중'
    const guideText = this.add
      .text(guideX + guideW / 2, guideY + guideH / 2, guideStatusText, {
        fontFamily: 'sans-serif',
        fontSize: `${Math.round(Phaser.Math.Clamp(guideH * 0.042, 24, 34))}px`,
        color: '#7a4d24',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setMaxLines(1)
    this.fitTextToWidth(guideText, guideW - 64, 34, 20)

    const infoCard = this.add.graphics()
    infoCard.fillStyle(0xfff8df, 0.96)
    infoCard.fillRoundedRect(infoX, mainTop, infoColumnW, mainH, 24)
    infoCard.lineStyle(3, 0xb0753a, 0.72)
    infoCard.strokeRoundedRect(infoX, mainTop, infoColumnW, mainH, 24)
    infoCard.lineStyle(2, 0xffffff, 0.58)
    infoCard.strokeRoundedRect(infoX + 8, mainTop + 8, infoColumnW - 16, mainH - 16, 18)

    const infoPad = Math.round(Phaser.Math.Clamp(infoColumnW * 0.075, 28, 42))
    const infoTextX = infoX + infoPad
    const infoTextW = infoColumnW - infoPad * 2
    const progress = this.add
      .text(
        infoTextX + infoTextW / 2,
        mainTop + infoPad + stepPillH / 2,
        `${this.motionIndex + 1} / ${this.motions.length}`,
        {
          fontFamily: 'sans-serif',
          fontSize: `${Math.round(Phaser.Math.Clamp(panelH * 0.032, 22, 30))}px`,
          color: '#fff8df',
          fontStyle: 'bold',
        },
      )
      .setOrigin(0.5)
    const stepPillW = Math.max(108, progress.width + 38)
    const stepPill = this.add.graphics()
    stepPill.fillStyle(0x7a4d24, 0.96)
    stepPill.fillRoundedRect(
      progress.x - stepPillW / 2,
      progress.y - stepPillH / 2,
      stepPillW,
      stepPillH,
      stepPillH / 2,
    )
    stepPill.lineStyle(3, 0xfff2c5, 0.9)
    stepPill.strokeRoundedRect(
      progress.x - stepPillW / 2,
      progress.y - stepPillH / 2,
      stepPillW,
      stepPillH,
      stepPillH / 2,
    )
    const titleMaxSize = Math.round(Phaser.Math.Clamp(panelH * 0.056, 42, 60))
    const motionTitle = this.add
      .text(infoTextX + infoTextW / 2, progress.y + stepPillH / 2 + 28, motionTitleText, {
        fontFamily: 'sans-serif',
        fontSize: `${titleMaxSize}px`,
        color: '#2f1a0c',
        fontStyle: 'bold',
        align: 'center',
        wordWrap: { width: infoTextW, useAdvancedWrap: true },
      })
      .setOrigin(0.5, 0)
      .setMaxLines(2)
    this.fitTextToWidth(motionTitle, infoTextW, titleMaxSize, 34)

    const goalLabelY = motionTitle.y + motionTitle.height + 32
    const goalLabel = this.add
      .text(infoTextX, goalLabelY, '목표', {
        fontFamily: 'sans-serif',
        fontSize: `${Math.round(Phaser.Math.Clamp(panelH * 0.028, 22, 30))}px`,
        color: '#7a4d24',
        fontStyle: 'bold',
      })
      .setOrigin(0, 0)
    const goalText = this.add
      .text(infoTextX, goalLabelY + goalLabel.height + 12, motion.goal, {
        fontFamily: 'sans-serif',
        fontSize: `${Math.round(Phaser.Math.Clamp(panelH * 0.032, 24, 34))}px`,
        color: '#3f2a18',
        fontStyle: 'bold',
        wordWrap: { width: infoTextW, useAdvancedWrap: true },
        lineSpacing: 8,
      })
      .setOrigin(0, 0)

    const tipsY = goalText.y + goalText.height + 36
    const tipsLabel = this.add
      .text(infoTextX, tipsY, '동작 포인트', {
        fontFamily: 'sans-serif',
        fontSize: `${Math.round(Phaser.Math.Clamp(panelH * 0.028, 22, 30))}px`,
        color: '#7a4d24',
        fontStyle: 'bold',
      })
      .setOrigin(0, 0)
    const tipsText = this.add
      .text(
        infoTextX,
        tipsY + tipsLabel.height + 14,
        motion.tips.map(tip => `• ${tip}`).join('\n'),
        {
          fontFamily: 'sans-serif',
          fontSize: `${Math.round(Phaser.Math.Clamp(panelH * 0.026, 20, 28))}px`,
          color: '#4a3324',
          wordWrap: { width: infoTextW, useAdvancedWrap: true },
          lineSpacing: 10,
        },
      )
      .setOrigin(0, 0)

    const buttonW = Math.min(infoTextW, 360)
    const buttonH = Math.round(Phaser.Math.Clamp(panelH * 0.078, 64, 78))
    const buttonX = infoX + infoColumnW / 2
    const buttonY = mainTop + mainH - infoPad - buttonH / 2
    const buttonBg = this.add.graphics()
    buttonBg.fillStyle(0x2f9e58, 1)
    buttonBg.fillRoundedRect(buttonX - buttonW / 2, buttonY - buttonH / 2, buttonW, buttonH, 20)
    buttonBg.lineStyle(2, 0xffffff, 0.38)
    buttonBg.strokeRoundedRect(buttonX - buttonW / 2, buttonY - buttonH / 2, buttonW, buttonH, 20)
    const buttonText = this.add
      .text(buttonX, buttonY, '시작하기', {
        fontFamily: 'sans-serif',
        fontSize: `${Math.round(Phaser.Math.Clamp(buttonH * 0.42, 26, 34))}px`,
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
    const hitArea = this.add
      .rectangle(buttonX, buttonY, buttonW, buttonH, 0xffffff, 0)
      .setInteractive({ useHandCursor: true })
    hitArea.on('pointerup', () => this.handleGuideStart())

    overlay.add([
      dim,
      panel,
      guideFrame,
      guideText,
      infoCard,
      stepPill,
      progress,
      motionTitle,
      goalLabel,
      goalText,
      tipsLabel,
      tipsText,
      buttonBg,
      buttonText,
      hitArea,
    ])
    this.guideOverlay = overlay

    if (guideVideoUrl) {
      this.createGuideVideoElement(
        {
          x: guideX + 14,
          y: guideY + 14,
          width: guideW - 28,
          height: guideH - 28,
        },
        guideVideoUrl,
        guideText,
      )
    }
  }
  private handleGuideStart() {
    if (!this.canReadCameraFrame()) {
      return
    }

    this.showCountdown()
  }

  private showCountdown() {
    this.clearGuideOverlay()
    this.clearCountdownOverlay()
    this.phase = 'COUNTDOWN'
    this.aiRequestsEnabled = false
    this.requestInFlight = false

    const { width: vw, height: vh } = this.scale
    const overlay = this.add.container(0, 0).setDepth(31)
    const dim = this.add.rectangle(vw / 2, vh / 2, vw, vh, 0x1b120d, 0.54)
    const countdownLabelFontSize = Math.round(Phaser.Math.Clamp(vh * 0.095, 88, 128))
    const guide = this.add
      .text(
        vw / 2,
        vh / 2 - Math.round(Phaser.Math.Clamp(vh * 0.18, 136, 190)),
        '차렷 자세 해주세요',
        {
          fontFamily: 'sans-serif',
          fontSize: `${countdownLabelFontSize}px`,
          color: '#fff4d5',
          fontStyle: 'bold',
          stroke: '#4a2811',
          strokeThickness: 5,
        },
      )
      .setOrigin(0.5)
      .setMaxLines(1)
    this.fitTextToWidth(guide, vw * 0.9, countdownLabelFontSize, 64)
    const countText = this.add
      .text(vw / 2, vh / 2, String(GYMNASTICS_COUNTDOWN_SECONDS), {
        fontFamily: 'sans-serif',
        fontSize: `${Math.round(Phaser.Math.Clamp(vh * 0.25, 180, 260))}px`,
        color: '#ffffff',
        fontStyle: 'bold',
        stroke: '#4a2811',
        strokeThickness: 10,
      })
      .setOrigin(0.5)
    overlay.add([dim, guide, countText])
    this.countdownOverlay = overlay

    for (let index = 0; index < GYMNASTICS_COUNTDOWN_SECONDS; index += 1) {
      const timer = this.time.delayedCall(index * 1000, () => {
        countText.setText(String(GYMNASTICS_COUNTDOWN_SECONDS - index))
      })
      this.countdownTimers.push(timer)
    }

    const completeTimer = this.time.delayedCall(GYMNASTICS_COUNTDOWN_SECONDS * 1000, () => {
      this.beginTracking()
    })
    this.countdownTimers.push(completeTimer)
  }

  private beginTracking() {
    this.clearCountdownOverlay()
    this.phase = 'TRACKING'
    this.aiRequestsEnabled = true
    this.requestInFlight = false
    this.isMotionAdvancing = false
    this.motionStartedAtMs = Date.now()
    this.cancelCurrentMotionRecording()
    this.motionRecorderHandle = startFullGameCanvasRecording({ scene: this })
    if (this.sessionStartedAtMs <= 0) {
      this.sessionStartedAtMs = this.motionStartedAtMs
    }
    this.renderMotion()
    this.showSideGuideVideo()
  }

  private clearGuideOverlay() {
    this.destroyGuideVideoElement()
    this.guideOverlay?.destroy(true)
    this.guideOverlay = undefined
  }

  private createGuideVideoElement(
    bounds: PanelBounds,
    videoUrl: string,
    loadingText?: Phaser.GameObjects.Text,
    options: {
      loop?: boolean
      zIndex?: number
      autoStartOnEnded?: boolean
      objectFit?: 'cover' | 'contain' | 'fill'
    } = {},
  ) {
    this.destroyGuideVideoElement()

    const video = document.createElement('video')
    video.src = videoUrl
    video.muted = true
    video.loop = options.loop ?? false
    video.autoplay = true
    video.playsInline = true
    video.preload = 'auto'
    video.style.position = 'fixed'
    video.style.objectFit = options.objectFit ?? 'fill'
    video.style.pointerEvents = 'none'
    video.style.borderRadius = '18px'
    video.style.backgroundColor = '#fff8df'
    video.style.zIndex = String(options.zIndex ?? 20)

    const positionVideo = () => {
      const canvasRect = this.game.canvas.getBoundingClientRect()
      const scaleX = canvasRect.width / this.scale.width
      const scaleY = canvasRect.height / this.scale.height

      video.style.left = `${canvasRect.left + bounds.x * scaleX}px`
      video.style.top = `${canvasRect.top + bounds.y * scaleY}px`
      video.style.width = `${bounds.width * scaleX}px`
      video.style.height = `${bounds.height * scaleY}px`
    }

    video.addEventListener(
      'loadeddata',
      () => {
        loadingText?.setVisible(false)
      },
      { once: true },
    )
    video.addEventListener(
      'error',
      () => {
        loadingText?.setVisible(true)
        loadingText?.setText('가이드 영상을 재생할 수 없어요')
      },
      { once: true },
    )
    video.addEventListener(
      'ended',
      () => {
        if ((options.autoStartOnEnded ?? true) && this.phase === 'GUIDE_PREVIEW') {
          this.handleGuideStart()
        }
      },
      { once: true },
    )

    positionVideo()
    document.body.appendChild(video)
    this.guideVideoElement = video
    this.guideVideoResizeHandler = positionVideo
    window.addEventListener('resize', positionVideo)

    void video.play().catch(() => {
      loadingText?.setVisible(true)
      loadingText?.setText('가이드 영상을 재생하려면 화면을 눌러주세요')
    })
  }

  private destroyGuideVideoElement() {
    if (this.guideVideoResizeHandler) {
      window.removeEventListener('resize', this.guideVideoResizeHandler)
      this.guideVideoResizeHandler = undefined
    }

    if (!this.guideVideoElement) return

    this.guideVideoElement.pause()
    this.guideVideoElement.removeAttribute('src')
    this.guideVideoElement.load()
    this.guideVideoElement.remove()
    this.guideVideoElement = undefined
  }

  private showSideGuideVideo() {
    if (!this.sideGuideVideoBounds || this.phase !== 'TRACKING') return

    const guideVideoUrl = this.getCurrentGuideVideoUrl()
    if (!guideVideoUrl) {
      this.destroyGuideVideoElement()
      this.sideGuideStatusText
        ?.setText('\uB4F1\uB85D\uB41C \uAC00\uC774\uB4DC \uC601\uC0C1\uC774 \uC5C6\uC5B4\uC694')
        .setVisible(true)
      return
    }

    this.sideGuideStatusText
      ?.setText('\uC601\uC0C1\uC744 \uC900\uBE44 \uC911\uC785\uB2C8\uB2E4')
      .setVisible(true)
    this.createGuideVideoElement(
      this.sideGuideVideoBounds,
      guideVideoUrl,
      this.sideGuideStatusText,
      {
        loop: true,
        zIndex: 15,
        autoStartOnEnded: false,
        objectFit: 'cover',
      },
    )
  }

  private clearCountdownOverlay() {
    this.clearCountdownTimers()
    this.countdownOverlay?.destroy(true)
    this.countdownOverlay = undefined
  }

  private clearCountdownTimers() {
    this.countdownTimers.forEach(timer => timer.remove(false))
    this.countdownTimers = []
  }

  private logPoseDetectionMiss() {
    if (!import.meta.env.DEV || this.poseMissCount < 45) return

    const now = this.time.now
    if (now - this.lastPoseDiagnosticAtMs < 3000) return

    this.lastPoseDiagnosticAtMs = now
    const video = this.poseTracker?.video
    console.debug('[GymnasticsPlayScene] Pose not detected from camera frame', {
      canReadCameraFrame: this.canReadCameraFrame(),
      readyState: video?.readyState,
      videoWidth: video?.videoWidth,
      videoHeight: video?.videoHeight,
      currentTime: video?.currentTime,
      missCount: this.poseMissCount,
    })
  }

  private drawCameraFrame() {
    this.cameraContext.clearRect(0, 0, this.cameraCanvas.width, this.cameraCanvas.height)

    if (this.canReadCameraFrame() && this.poseTracker?.video) {
      this.cameraContext.save()
      this.cameraContext.translate(this.cameraCanvas.width, 0)
      this.cameraContext.scale(-1, 1)
      this.cameraContext.drawImage(
        this.poseTracker.video,
        0,
        0,
        this.cameraCanvas.width,
        this.cameraCanvas.height,
      )
      this.cameraContext.restore()
    } else {
      const gradient = this.cameraContext.createLinearGradient(0, 0, 0, this.cameraCanvas.height)
      gradient.addColorStop(0, '#f6c067')
      gradient.addColorStop(1, '#91511d')
      this.cameraContext.fillStyle = gradient
      this.cameraContext.fillRect(0, 0, this.cameraCanvas.width, this.cameraCanvas.height)
    }

    this.cameraTexture.refresh()
  }

  private evaluateCurrentPose() {
    if (this.phase !== 'TRACKING') return

    const tracker = this.poseTracker
    if (!tracker) {
      this.updateRecognitionStatus(false)
      return
    }

    if (this.isMotionAdvancing) return

    const detection = tracker.detect()
    const pose = detection.poses[0]
    if (!pose) {
      this.poseMissCount += 1
      this.updateRecognitionStatus(false)
      if (this.saveState === 'idle') {
        this.setFeedbackTitle('전신이 보이게 서요')
        const motionSpec = this.getCurrentAiMotionSpec()
        this.setFeedbackDetail(this.getProgressDetailText(motionSpec), {
          force: true,
          isProgressDetail: true,
        })
        this.updateHoldProgressUi(motionSpec)
      }
      this.logPoseDetectionMiss()
      return
    }

    this.poseMissCount = 0
    this.updateRecognitionStatus(true)
    this.drawPoseLandmarks(pose.landmarks)
    this.sampleCurrentMotionReplay(pose.landmarks)

    const motionSpec = this.getCurrentAiMotionSpec()
    if (this.aiConnectionIssue && this.time.now < this.aiRetryAvailableAtMs) {
      if (motionSpec.type === 'top') {
        this.evaluatePoseLocally(detection.timestampMs, pose.landmarks)
      } else {
        this.applyAiConnectionFallbackFeedback()
      }
      return
    }

    if (this.requestInFlight || !this.aiRequestsEnabled) return
    if (this.time.now - this.lastAiEvaluationRequestedAtMs < AI_EVALUATION_INTERVAL_MS) return

    this.requestInFlight = true
    this.lastAiEvaluationRequestedAtMs = this.time.now
    void this.requestAiEvaluation(detection.timestampMs, pose.landmarks)
      .catch(error => {
        const message = error instanceof Error ? error.message : 'AI request failed'
        this.markAiConnectionIssue(message)
      })
      .finally(() => {
        this.requestInFlight = false
      })
  }

  private async requestAiEvaluation(
    timestampMs: number,
    landmarks: readonly { x: number; y: number; z: number; visibility?: number }[],
  ) {
    const motionSpec = this.getCurrentAiMotionSpec()
    const frame = {
      timestamp_ms: Math.floor(timestampMs),
      mirrored: true,
      landmarks: this.toLandmarkPayload(landmarks),
    }
    const sharedPayload = {
      frame,
      previous_state: this.aiState.previousState,
      reference_hip_x: this.aiState.referenceHipX,
      reference_hip_y: this.aiState.referenceHipY,
      reference_scale: this.aiState.referenceScale,
      displayed_feedback_code: this.aiState.displayedFeedbackCode,
      displayed_feedback_text: this.aiState.displayedFeedbackText,
      displayed_feedback_frames: this.aiState.displayedFeedbackFrames,
      candidate_feedback_code: this.aiState.candidateFeedbackCode,
      candidate_feedback_text: this.aiState.candidateFeedbackText,
      candidate_feedback_streak: this.aiState.candidateFeedbackStreak,
      representative_feedback_totals: this.aiState.representativeFeedbackTotals,
      representative_feedback_code: this.aiState.representativeFeedbackCode,
      representative_feedback_text: this.aiState.representativeFeedbackText,
      representative_feedback_frames: this.aiState.representativeFeedbackFrames,
    }
    const requestUrl =
      motionSpec.type === 'daniel'
        ? `${AI_BASE_URL}/gymnastics/${DANIEL_MOTION_ENDPOINTS[motionSpec.kind]}/evaluate`
        : `${AI_BASE_URL}/gymnastics/${MOTION_ENDPOINTS[motionSpec.kind]}/evaluate`
    if (import.meta.env.DEV && this.lastLoggedAiRequestUrl !== requestUrl) {
      this.lastLoggedAiRequestUrl = requestUrl
      console.debug('[GymnasticsPlayScene] AI evaluation endpoint:', requestUrl)
    }
    const danielRequestBody =
      motionSpec.type === 'daniel'
        ? {
            ...sharedPayload,
            target_hold_ms: motionSpec.targetHoldMs,
            hold_duration_ms: this.aiState.holdDurationMs,
            hold_last_timestamp_ms: this.aiState.holdLastTimestampMs,
            ...(motionSpec.kind === 'daniel_forward_press'
              ? {
                  baseline_left_wrist_forward: this.aiState.baselineLeftWristForward,
                  baseline_right_wrist_forward: this.aiState.baselineRightWristForward,
                }
              : {}),
          }
        : null
    const requestBody =
      motionSpec.type === 'daniel'
        ? danielRequestBody
        : {
            ...sharedPayload,
            step_count: this.aiState.stepCount,
            target_steps: motionSpec.targetSteps,
            last_counted_side: this.aiState.lastCountedSide,
            last_seen_side: this.aiState.lastSeenSide,
            left_armed: this.aiState.leftArmed,
            right_armed: this.aiState.rightArmed,
            baseline_left_step_extent: this.aiState.baselineLeftStepExtent,
            baseline_right_step_extent: this.aiState.baselineRightStepExtent,
            baseline_ankle_span: this.aiState.baselineAnkleSpan,
            baseline_left_wrist_forward: this.aiState.baselineLeftWristForward,
            baseline_right_wrist_forward: this.aiState.baselineRightWristForward,
            baseline_stance_span: this.aiState.baselineStanceSpan,
          }
    const response = await fetch(requestUrl, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      this.markAiConnectionIssue(
        `AI response error: ${response.status}${detail ? ` ${detail}` : ''}`,
      )
      return
    }

    const payload = (await response.json()) as GymnasticsAiResponse
    this.playFeedbackTtsIfNeeded(payload)
    this.updateAiState(payload)
    this.captureCompactReplayMarkers(payload)
    this.clearAiConnectionIssue()
    this.applyAiFeedback()
    this.advanceMotionIfCompleted()
  }

  private evaluatePoseLocally(
    timestampMs: number,
    landmarks: readonly { x: number; y: number; z: number; visibility?: number }[],
  ) {
    const motionSpec = this.getCurrentAiMotionSpec()
    if (motionSpec.type === 'daniel') return

    const previousStepCount = this.aiState.stepCount
    const nextState: GymnasticsAiState = { ...this.aiState, tracking: 'tracked', feedback: null }

    if (!this.hasCoreBodyLandmarks(landmarks)) {
      nextState.feedback = '뒤로 가볼까요'
      nextState.tracking = 'tracking_low'
      this.aiState = nextState
      this.applyAiFeedback()
      return
    }

    if (motionSpec.kind === 'march') {
      this.evaluateLocalMarch(nextState, landmarks, timestampMs)
    } else if (motionSpec.kind === 'side-step') {
      this.evaluateLocalSideStep(nextState, landmarks, timestampMs)
    } else if (
      motionSpec.kind === 'diagonal-body-punch' ||
      motionSpec.kind === 'diagonal-face-punch'
    ) {
      this.evaluateLocalPunch(nextState, landmarks, timestampMs, motionSpec.kind)
    } else {
      this.evaluateLocalSquat(nextState, landmarks, timestampMs)
    }

    nextState.stepCount = Math.min(nextState.stepCount, motionSpec.targetSteps)
    nextState.accuracy = this.getMotionProgressRatio(motionSpec, nextState)
    this.aiState = nextState

    if (this.aiState.stepCount !== previousStepCount || !this.aiError) {
      this.applyAiFeedback()
    }
    this.advanceMotionIfCompleted()
  }

  private evaluateLocalMarch(
    state: GymnasticsAiState,
    landmarks: readonly { x: number; y: number }[],
    timestampMs: number,
  ) {
    const leftLift = this.verticalLift(landmarks, 'LEFT_HIP', 'LEFT_KNEE')
    const rightLift = this.verticalLift(landmarks, 'RIGHT_HIP', 'RIGHT_KNEE')
    const leftKnee = this.getLandmark(landmarks, 'LEFT_KNEE')
    const rightKnee = this.getLandmark(landmarks, 'RIGHT_KNEE')
    if (!leftKnee && !rightKnee) {
      state.feedback = '무릎도 보여요'
      return
    }
    if (leftKnee && (state.baselineLeftKneeY == null || state.localPhase === 'ready')) {
      state.baselineLeftKneeY =
        state.baselineLeftKneeY == null ? leftKnee.y : Math.max(state.baselineLeftKneeY, leftKnee.y)
    }
    if (rightKnee && (state.baselineRightKneeY == null || state.localPhase === 'ready')) {
      state.baselineRightKneeY =
        state.baselineRightKneeY == null
          ? rightKnee.y
          : Math.max(state.baselineRightKneeY, rightKnee.y)
    }

    const leftBaselineLift =
      leftKnee && state.baselineLeftKneeY != null ? state.baselineLeftKneeY - leftKnee.y : 0
    const rightBaselineLift =
      rightKnee && state.baselineRightKneeY != null ? state.baselineRightKneeY - rightKnee.y : 0
    const leftScore = Math.max(leftLift, leftBaselineLift)
    const rightScore = Math.max(rightLift, rightBaselineLift)
    const side = leftScore > rightScore ? 'left' : 'right'
    const lift = Math.max(leftScore, rightScore)

    state.feedback = '번갈아 해요'

    if (lift > 0.045 && state.localPhase === 'ready' && state.lastCountedSide !== side) {
      this.countLocalRep(state, timestampMs, side, '참 잘했어요')
      state.localPhase = 'active'
      return
    }

    if (lift > 0.045 && state.lastCountedSide === side) {
      state.feedback = '반대쪽도 해요'
      return
    }

    if (lift > 0.025) {
      state.feedback = '조금 더 높이'
    }

    if (lift < 0.018) {
      state.localPhase = 'ready'
      state.feedback = '다음 다리 해요'
    }
  }

  private evaluateLocalSideStep(
    state: GymnasticsAiState,
    landmarks: readonly { x: number; y: number }[],
    timestampMs: number,
  ) {
    const ankleSpan = this.horizontalDistance(landmarks, 'LEFT_ANKLE', 'RIGHT_ANKLE')
    if (ankleSpan <= 0) {
      state.feedback = '발도 보여요'
      return
    }
    if (state.baselineAnkleSpan == null && ankleSpan > 0) {
      state.baselineAnkleSpan = ankleSpan
    } else if (state.localPhase === 'ready' && ankleSpan > 0 && state.baselineAnkleSpan != null) {
      state.baselineAnkleSpan = Math.min(state.baselineAnkleSpan, ankleSpan)
    }

    const baseline = Math.max(state.baselineAnkleSpan ?? ankleSpan, 0.12)
    const opened = ankleSpan > baseline * 1.18 && ankleSpan - baseline > 0.035

    state.feedback = '크게 해볼까요'

    if (opened && state.localPhase === 'ready') {
      this.countLocalRep(state, timestampMs, null, '참 잘했어요')
      state.localPhase = 'active'
      return
    }

    if (state.localPhase === 'active') {
      state.feedback = '다시 모아봐요'
    }

    if (ankleSpan < baseline * 1.08) {
      state.localPhase = 'ready'
      state.feedback = '다시 해볼까요'
    }
  }

  private evaluateLocalPunch(
    state: GymnasticsAiState,
    landmarks: readonly { x: number; y: number; z?: number }[],
    timestampMs: number,
    kind: GymnasticsMotionKind,
  ) {
    const leftReach = this.forwardReach(landmarks, 'LEFT_SHOULDER', 'LEFT_WRIST', -1)
    const rightReach = this.forwardReach(landmarks, 'RIGHT_SHOULDER', 'RIGHT_WRIST', 1)
    const leftDepthReach = this.depthReach(landmarks, 'LEFT_WRIST', state.baselineLeftWristZ)
    const rightDepthReach = this.depthReach(landmarks, 'RIGHT_WRIST', state.baselineRightWristZ)
    const leftScore = Math.max(leftReach, leftDepthReach)
    const rightScore = Math.max(rightReach, rightDepthReach)
    const side = leftScore > rightScore ? 'left' : 'right'
    const reach = Math.max(leftScore, rightScore)
    const wristHeightOk =
      kind === 'diagonal-body-punch' ||
      this.wristNearFaceHeight(landmarks, side === 'left' ? 'LEFT_WRIST' : 'RIGHT_WRIST')

    this.captureWristBaseline(state, landmarks)
    state.feedback = kind === 'diagonal-face-punch' ? '주먹 올려요' : '팔 뻗어봐요'

    if (!wristHeightOk) {
      state.feedback = '조금 더 높이'
      return
    }

    if (reach > 0.055 && state.localPhase === 'ready' && state.lastCountedSide !== side) {
      this.countLocalRep(state, timestampMs, side, '참 잘했어요')
      state.localPhase = 'active'
      return
    }

    if (reach > 0.055 && state.lastCountedSide === side) {
      state.feedback = '반대쪽도 해요'
      return
    }

    if (reach > 0.025) {
      state.feedback = '조금 더 뻗어요'
    }

    if (reach < 0.02) {
      state.localPhase = 'ready'
      state.feedback = '팔을 모아봐요'
    }
  }

  private evaluateLocalSquat(
    state: GymnasticsAiState,
    landmarks: readonly { x: number; y: number }[],
    timestampMs: number,
  ) {
    const hipY = this.midpointY(landmarks, 'LEFT_HIP', 'RIGHT_HIP')
    const hasKnees =
      this.getLandmark(landmarks, 'LEFT_KNEE') || this.getLandmark(landmarks, 'RIGHT_KNEE')
    if (!hasKnees) {
      state.feedback = '무릎도 보여요'
      return
    }
    if (state.referenceHipY == null) {
      state.referenceHipY = hipY
    }

    const hipDrop = hipY - state.referenceHipY
    state.feedback = '앉아볼까요'

    if (hipDrop > 0.08 && state.localPhase === 'ready') {
      state.localPhase = 'active'
      state.feedback = '일어나봐요'
      return
    }

    if (hipDrop > 0.04 && state.localPhase === 'ready') {
      state.feedback = '조금 더 앉아요'
      return
    }

    if (state.localPhase === 'active' && hipDrop < 0.035) {
      this.countLocalRep(state, timestampMs, null, '참 잘했어요')
      state.localPhase = 'ready'
    }
  }

  private countLocalRep(
    state: GymnasticsAiState,
    timestampMs: number,
    side: string | null,
    feedback: string,
  ) {
    if (timestampMs - state.lastLocalRepAtMs < 450) return
    state.stepCount += 1
    state.lastLocalRepAtMs = timestampMs
    state.lastCountedSide = side
    state.feedback = feedback
    state.previousState = 'counted'
  }

  private drawPoseLandmarks(landmarks: readonly { x: number; y: number; visibility?: number }[]) {
    this.cameraContext.save()
    this.cameraContext.fillStyle = '#5ce1e6'
    this.cameraContext.strokeStyle = 'rgba(255,255,255,0.7)'
    this.cameraContext.lineWidth = 2

    for (const landmark of landmarks) {
      if ((landmark.visibility ?? 1) < 0.05) continue
      this.cameraContext.beginPath()
      this.cameraContext.arc(
        (1 - landmark.x) * this.cameraCanvas.width,
        landmark.y * this.cameraCanvas.height,
        4,
        0,
        Math.PI * 2,
      )
      this.cameraContext.fill()
    }

    this.cameraContext.restore()
    this.cameraTexture.refresh()
  }

  private verticalLift(
    landmarks: readonly { x: number; y: number }[],
    hipName: (typeof POSE_LANDMARK_NAMES)[number],
    kneeName: (typeof POSE_LANDMARK_NAMES)[number],
  ) {
    const hip = this.getLandmark(landmarks, hipName)
    const knee = this.getLandmark(landmarks, kneeName)
    return hip && knee ? hip.y - knee.y : 0
  }

  private horizontalDistance(
    landmarks: readonly { x: number; y: number }[],
    leftName: (typeof POSE_LANDMARK_NAMES)[number],
    rightName: (typeof POSE_LANDMARK_NAMES)[number],
  ) {
    const left = this.getLandmark(landmarks, leftName)
    const right = this.getLandmark(landmarks, rightName)
    return left && right ? Math.abs(left.x - right.x) : 0
  }

  private forwardReach(
    landmarks: readonly { x: number; y: number }[],
    shoulderName: (typeof POSE_LANDMARK_NAMES)[number],
    wristName: (typeof POSE_LANDMARK_NAMES)[number],
    direction: -1 | 1,
  ) {
    const shoulder = this.getLandmark(landmarks, shoulderName)
    const wrist = this.getLandmark(landmarks, wristName)
    return shoulder && wrist ? (wrist.x - shoulder.x) * direction : 0
  }

  private captureWristBaseline(
    state: GymnasticsAiState,
    landmarks: readonly { x: number; y: number; z?: number }[],
  ) {
    const leftWrist = this.getLandmark(landmarks, 'LEFT_WRIST')
    const rightWrist = this.getLandmark(landmarks, 'RIGHT_WRIST')

    if (
      leftWrist?.z != null &&
      (state.baselineLeftWristZ == null || state.localPhase === 'ready')
    ) {
      state.baselineLeftWristZ =
        state.baselineLeftWristZ == null
          ? leftWrist.z
          : Math.max(state.baselineLeftWristZ, leftWrist.z)
    }
    if (
      rightWrist?.z != null &&
      (state.baselineRightWristZ == null || state.localPhase === 'ready')
    ) {
      state.baselineRightWristZ =
        state.baselineRightWristZ == null
          ? rightWrist.z
          : Math.max(state.baselineRightWristZ, rightWrist.z)
    }
  }

  private depthReach(
    landmarks: readonly { x: number; y: number; z?: number }[],
    wristName: (typeof POSE_LANDMARK_NAMES)[number],
    baselineZ: number | null,
  ) {
    const wrist = this.getLandmark(landmarks, wristName)
    if (wrist?.z == null || baselineZ == null) return 0
    return Math.max(0, baselineZ - wrist.z)
  }

  private wristNearFaceHeight(
    landmarks: readonly { x: number; y: number }[],
    wristName: (typeof POSE_LANDMARK_NAMES)[number],
  ) {
    const wrist = this.getLandmark(landmarks, wristName)
    const shoulderY = this.midpointY(landmarks, 'LEFT_SHOULDER', 'RIGHT_SHOULDER')
    return wrist ? wrist.y < shoulderY + 0.16 : false
  }

  private midpointY(
    landmarks: readonly { x: number; y: number }[],
    leftName: (typeof POSE_LANDMARK_NAMES)[number],
    rightName: (typeof POSE_LANDMARK_NAMES)[number],
  ) {
    const left = this.getLandmark(landmarks, leftName)
    const right = this.getLandmark(landmarks, rightName)
    if (!left && !right) return 0
    if (!left) return right!.y
    if (!right) return left.y
    return (left.y + right.y) / 2
  }

  private getLandmark(
    landmarks: readonly { x: number; y: number; z?: number; visibility?: number }[],
    name: (typeof POSE_LANDMARK_NAMES)[number],
  ) {
    return landmarks[POSE_LANDMARK_NAMES.indexOf(name)]
  }

  private hasCoreBodyLandmarks(
    landmarks: readonly { x: number; y: number; visibility?: number }[],
  ) {
    const requiredUpperBody: (typeof POSE_LANDMARK_NAMES)[number][] = [
      'LEFT_SHOULDER',
      'RIGHT_SHOULDER',
      'LEFT_HIP',
      'RIGHT_HIP',
    ]
    return requiredUpperBody.every(name => {
      const landmark = landmarks[POSE_LANDMARK_NAMES.indexOf(name)]
      return Boolean(landmark && (landmark.visibility ?? 1) >= 0.05)
    })
  }

  private updateAiState(payload: GymnasticsAiResponse) {
    const motionSpec = this.getCurrentAiMotionSpec()
    const previousStepCount = this.aiState.stepCount
    const previousHoldCompleted = this.aiState.holdCompleted
    const nextStepCount =
      motionSpec.type === 'top'
        ? (payload.step_count ?? this.aiState.stepCount)
        : this.aiState.stepCount
    const nextHoldDurationMs =
      motionSpec.type === 'daniel'
        ? (payload.hold_duration_ms ?? this.aiState.holdDurationMs)
        : this.aiState.holdDurationMs
    const nextHoldCompleted =
      motionSpec.type === 'daniel'
        ? (payload.hold_completed ?? this.aiState.holdCompleted)
        : this.aiState.holdCompleted
    const nextStateForProgress = {
      ...this.aiState,
      stepCount: nextStepCount,
      holdDurationMs: nextHoldDurationMs,
      holdCompleted: nextHoldCompleted,
    }
    this.didTopCountIncrease = motionSpec.type === 'top' && nextStepCount > previousStepCount
    this.didDanielComplete =
      motionSpec.type === 'daniel' && !previousHoldCompleted && nextHoldCompleted

    this.aiState = {
      ...this.aiState,
      previousState: payload.state,
      stepCount: nextStepCount,
      holdDurationMs: nextHoldDurationMs,
      holdCompleted: nextHoldCompleted,
      holdLastTimestampMs: payload.hold_last_timestamp_ms ?? null,
      lastCountedSide: payload.last_counted_side ?? null,
      lastSeenSide: payload.last_seen_side ?? null,
      leftArmed: payload.left_armed ?? this.aiState.leftArmed,
      rightArmed: payload.right_armed ?? this.aiState.rightArmed,
      referenceHipX: payload.reference_hip_x,
      referenceHipY: payload.reference_hip_y,
      referenceScale: payload.reference_scale,
      displayedFeedbackCode: payload.displayed_feedback_code,
      displayedFeedbackText: payload.displayed_feedback_text,
      displayedFeedbackFrames: payload.displayed_feedback_frames,
      candidateFeedbackCode: payload.candidate_feedback_code,
      candidateFeedbackText: payload.candidate_feedback_text,
      candidateFeedbackStreak: payload.candidate_feedback_streak,
      representativeFeedbackTotals: payload.representative_feedback_totals,
      representativeFeedbackCode: payload.representative_feedback_code,
      representativeFeedbackText: payload.representative_feedback_text,
      representativeFeedbackFrames: payload.representative_feedback_frames,
      baselineLeftStepExtent:
        payload.baseline_left_step_extent ?? this.aiState.baselineLeftStepExtent,
      baselineRightStepExtent:
        payload.baseline_right_step_extent ?? this.aiState.baselineRightStepExtent,
      baselineAnkleSpan: payload.baseline_ankle_span ?? this.aiState.baselineAnkleSpan,
      baselineLeftWristForward:
        payload.baseline_left_wrist_forward ?? this.aiState.baselineLeftWristForward,
      baselineRightWristForward:
        payload.baseline_right_wrist_forward ?? this.aiState.baselineRightWristForward,
      baselineStanceSpan: payload.baseline_stance_span ?? this.aiState.baselineStanceSpan,
      accuracy: this.getMotionProgressRatio(motionSpec, nextStateForProgress),
      tracking: payload.tracking,
      feedback: payload.feedback,
    }
  }

  private markAiConnectionIssue(message: string) {
    this.aiError = message
    this.aiConnectionIssue = true
    this.aiRetryAvailableAtMs = this.time.now + AI_REQUEST_RETRY_DELAY_MS
    console.warn('[GymnasticsPlayScene] AI evaluation request failed:', message)
    this.applyAiConnectionFallbackFeedback()
  }

  private clearAiConnectionIssue() {
    this.aiError = null
    this.aiConnectionIssue = false
    this.aiRetryAvailableAtMs = 0
  }

  private applyAiConnectionFallbackFeedback() {
    if (this.saveState !== 'idle') return

    const motionSpec = this.getCurrentAiMotionSpec()
    if (motionSpec.type === 'daniel') {
      this.setFeedbackTitle('자세 판정 연결을 확인하고 있어요')
      this.setFeedbackDetail('다니엘 자세 유지는 연결 후 진행돼요')
    } else {
      this.setFeedbackDetail('AI 연결을 확인하고 있어요. 기본 인식으로 안내할게요')
    }

    this.setFeedbackDetail(this.getProgressDetailText(motionSpec), {
      force: true,
      isProgressDetail: true,
    })
    this.updateHoldProgressUi(motionSpec)
    this.fitFeedbackTitleToOneLine()
    this.fitTextToWidth(
      this.feedbackTipTexts[0],
      this.holdStatusMaxWidth,
      FEEDBACK_TIMER_MAX_FONT_SIZE,
      FEEDBACK_TIMER_MIN_FONT_SIZE,
    )
    this.positionFeedbackStar()
  }

  private applyAiFeedback() {
    if (this.saveState !== 'idle') return

    const motionSpec = this.getCurrentAiMotionSpec()
    const shouldForceSuccessTitle = this.didTopCountIncrease || this.didDanielComplete
    const successTitle = shouldForceSuccessTitle ? '좋아요!' : null
    const aiTitle = this.getFriendlyFeedbackText(
      this.aiState.feedback ||
        this.aiState.displayedFeedbackText ||
        this.aiState.representativeFeedbackText,
    )
    const title = successTitle ?? aiTitle
    const detail =
      motionSpec.type === 'daniel'
        ? this.getDanielHoldDetail(motionSpec)
        : this.getProgressDetailText(motionSpec)

    if (title) {
      this.setFeedbackTitle(title, { force: Boolean(successTitle) })
    } else {
      this.clearFeedbackTitle()
    }
    this.setFeedbackDetail(detail, { isProgressDetail: motionSpec.type === 'daniel' })
    this.didTopCountIncrease = false
    this.didDanielComplete = false
    this.updateHoldProgressUi(motionSpec)
    this.motionTitleText?.setText(this.getMotionDisplayTitle())

    this.fitTextToWidth(this.motionTitleText, this.motionTitleMaxWidth, 34, 22)
    this.updateHeaderStats()
    this.centerMotionTitleText()
    this.fitFeedbackTitleToOneLine()
    this.fitTextToWidth(
      this.feedbackTipTexts[0],
      this.holdStatusMaxWidth,
      FEEDBACK_TIMER_MAX_FONT_SIZE,
      FEEDBACK_TIMER_MIN_FONT_SIZE,
    )
    this.positionFeedbackStar()
  }

  private playFeedbackTtsIfNeeded(payload: GymnasticsAiResponse) {
    const tts = payload.tts
    // TTS is only emitted for displayed feedback transitions with a complete code/text pair.
    if (!tts?.should_play || !tts.key || !tts.text) return

    const now = Date.now()
    const cooldownMs = tts.priority === 'tracking' ? 2500 : 3000

    if (this.lastTtsKey === tts.key && now - this.lastTtsPlayedAtMs < cooldownMs) {
      return
    }

    this.lastTtsKey = tts.key
    this.lastTtsPlayedAtMs = now
    speakFeedback(tts.text)
  }

  private resetFeedbackTts() {
    stopFeedbackSpeech()
    this.lastTtsKey = null
    this.lastTtsPlayedAtMs = 0
  }

  private getAiFeedbackTitle(feedback: string | null | undefined) {
    if (!feedback?.trim()) return this.getDefaultFeedbackText()

    const normalized = feedback!.toLowerCase()
    if (/[ÃƒÃ‚ï¿½Ã«Ã¬Ã¯Ã‘Ã£Å’]/.test(feedback!) || feedback!.includes('?')) {
      return null
    }
    if (
      normalized.includes('good') ||
      normalized.includes('complete') ||
      normalized.includes('progress') ||
      normalized.includes('hold')
    ) {
      return null
    }
    if (normalized.includes('camera') || normalized.includes('pose')) return '전신이 보이게 서요'

    return feedback
  }

  private getFriendlyFeedbackText(feedback: string | null | undefined) {
    return this.getAiFeedbackTitle(feedback)
    const normalized = ''
    if (normalized.includes('good') || normalized.includes('complete')) return '좋아요!'
    if (normalized.includes('hold')) return '자세를 유지해볼까요?'
    if (normalized.includes('camera') || normalized.includes('pose')) return '전신이 보이게 서요'

    return feedback
  }

  private getDefaultFeedbackText() {
    if (this.isCameraRecognized) return null

    if (!this.isCameraRecognized) return '전신이 보이게 서요'

    const motionSpec = this.getCurrentAiMotionSpec()
    if (motionSpec.type === 'daniel') {
      if (this.aiState.holdCompleted) return '좋아요!'
      if (this.aiState.previousState === 'holding' || this.aiState.holdDurationMs > 0) {
        return '자세 유지 중이에요'
      }
      return '자세를 따라 해볼까요?'
    }

    if (this.didTopCountIncrease) return '좋아요!'
    return this.aiState.stepCount > 0 ? '계속 이어가볼까요?' : '동작을 따라 해볼까요?'
  }

  private setFeedbackTitle(title: string | null | undefined, options: { force?: boolean } = {}) {
    if (this.saveState === 'idle') {
      this.showRealtimeFeedbackCard()
    }

    const nextTitle = title?.trim()
    if (!nextTitle) return
    const now = this.time.now
    const elapsedMs = now - this.feedbackTitleChangedAtMs
    const canChange =
      options.force ||
      !this.displayedFeedbackTitle ||
      nextTitle === this.displayedFeedbackTitle ||
      elapsedMs >= FEEDBACK_TITLE_MIN_VISIBLE_MS

    if (!canChange) return

    this.displayedFeedbackTitle = nextTitle
    this.feedbackTitleChangedAtMs = now
    this.feedbackTitleText?.setText(this.getCompactFeedbackTitle(nextTitle))
    this.fitFeedbackTitleToOneLine()
  }

  private clearFeedbackTitle() {
    this.displayedFeedbackTitle = ''
    this.feedbackTitleChangedAtMs = this.time.now
    this.feedbackTitleText?.setText('')
  }

  private getCompactFeedbackTitle(title: string) {
    const normalized = title.trim()
    if (!normalized) return normalized

    if (normalized.includes('전신') || normalized.includes('몸 전체')) {
      return this.selectOneLineFeedbackCandidate([
        normalized,
        '몸 전체가 보이게 서요',
        '몸이 보이게 서요',
      ])
    }

    if (normalized.includes('뒤로')) {
      return this.selectOneLineFeedbackCandidate([normalized, '조금 뒤로 가요', '뒤로 조금'])
    }

    if (normalized.includes('앞으로')) {
      return this.selectOneLineFeedbackCandidate([normalized, '조금 앞으로 와요', '앞으로 조금'])
    }

    if (normalized.includes('왼쪽')) {
      return this.selectOneLineFeedbackCandidate([normalized, '왼쪽으로 조금', '왼쪽'])
    }

    if (normalized.includes('오른쪽')) {
      return this.selectOneLineFeedbackCandidate([normalized, '오른쪽으로 조금', '오른쪽'])
    }

    if (normalized.includes('가운데') || normalized.includes('중앙')) {
      return this.selectOneLineFeedbackCandidate([normalized, '가운데로 와요', '가운데'])
    }

    if (normalized.includes('그대로') || normalized.includes('좋아요')) {
      return this.selectOneLineFeedbackCandidate([normalized, '좋아요, 그대로', '그대로'])
    }

    if (normalized.includes('쉬')) {
      return this.selectOneLineFeedbackCandidate([normalized, '쉬어도 괜찮아요', '쉬어도 돼요'])
    }

    return this.selectOneLineFeedbackCandidate([normalized])
  }

  private selectOneLineFeedbackCandidate(candidates: string[]) {
    const availableWidth = this.feedbackTitleMaxWidth || Number.POSITIVE_INFINITY

    for (const candidate of candidates) {
      if (this.canFitTextAtFontSize(candidate, availableWidth, FEEDBACK_MAIN_MAX_FONT_SIZE)) {
        return candidate
      }
    }

    return candidates[candidates.length - 1] ?? ''
  }

  private setFeedbackDetail(
    detail: string,
    options: { force?: boolean; isProgressDetail?: boolean } = {},
  ) {
    const nextDetail = detail.trim()
    const now = this.time.now
    const elapsedMs = now - this.feedbackDetailChangedAtMs
    const canChange =
      options.force ||
      !this.displayedFeedbackDetail ||
      nextDetail === this.displayedFeedbackDetail ||
      elapsedMs >=
        (options.isProgressDetail
          ? FEEDBACK_PROGRESS_DETAIL_MIN_VISIBLE_MS
          : FEEDBACK_DETAIL_MIN_VISIBLE_MS)

    if (!canChange) return

    this.displayedFeedbackDetail = nextDetail
    this.feedbackDetailChangedAtMs = now
    this.feedbackTipTexts[0]?.setText(nextDetail)
  }

  private getDanielHoldDetail(motionSpec: DanielAiMotionSpec) {
    const targetSeconds = Math.max(1, Math.round(motionSpec.targetHoldMs / 1000))
    const elapsedSeconds = Math.min(
      targetSeconds,
      Math.floor(Math.max(0, this.aiState.holdDurationMs / 1000)),
    )

    return `${elapsedSeconds}/${targetSeconds}\uCD08`
  }

  private getProgressDetailText(motionSpec: AiMotionSpec) {
    if (motionSpec.type === 'daniel') {
      return this.getDanielHoldDetail(motionSpec)
    }

    const completedCount = Math.min(this.aiState.stepCount, motionSpec.targetSteps)
    return `${completedCount}/${motionSpec.targetSteps}\uD68C`
  }

  private clampProgressValue(value: number) {
    if (!Number.isFinite(value)) return 0
    return Phaser.Math.Clamp(value, 0, 1)
  }

  private getMotionProgressRatio(
    motionSpec: AiMotionSpec,
    state: GymnasticsAiState = this.aiState,
  ) {
    if (motionSpec.type === 'daniel') {
      return this.clampProgressValue(state.holdDurationMs / Math.max(1, motionSpec.targetHoldMs))
    }

    return this.clampProgressValue(state.stepCount / Math.max(1, motionSpec.targetSteps))
  }

  private isMotionCompleteByRecord(motionSpec: AiMotionSpec) {
    if (motionSpec.type === 'daniel') {
      return this.aiState.holdCompleted || this.aiState.holdDurationMs >= motionSpec.targetHoldMs
    }

    return this.aiState.stepCount >= motionSpec.targetSteps
  }

  private getCompletedCountByRecord(motionSpec: AiMotionSpec) {
    if (motionSpec.type === 'daniel') {
      return this.isMotionCompleteByRecord(motionSpec) ? 1 : 0
    }

    return Math.min(this.aiState.stepCount, motionSpec.targetSteps)
  }

  private updateHoldProgressUi(motionSpec: AiMotionSpec) {
    const shouldShow = false
    this.progressLabelText?.setVisible(shouldShow)
    this.holdProgressTrack?.setVisible(shouldShow)
    this.holdProgressBar?.setVisible(shouldShow)
    this.holdProgressText?.setVisible(false)

    this.updateHeaderStats()

    if (!shouldShow) return

    const progress = this.getMotionProgressRatio(motionSpec)
    this.holdProgressBar.setScale(progress, 1)
    this.holdProgressText.setText('')
    this.holdProgressText?.setVisible(false)
  }

  private showMotionProgressComplete() {
    const progressText = this.feedbackTipTexts[0]
    this.progressLabelText?.setVisible(false)
    this.holdProgressTrack?.setVisible(false)
    this.holdProgressBar?.setVisible(false)
    this.holdProgressText?.setVisible(false)

    if (!progressText) return

    progressText
      .setText('\uCCB4\uC870 \uC644\uB8CC')
      .setFontSize(this.progressCompleteFontSize)
      .setColor('#2f2118')
      .setVisible(false)
      .setPosition(this.progressTextCenterX, this.progressCompleteCenterY)
    progressText.setFixedSize(this.holdStatusMaxWidth, 0)
    progressText.setOrigin(0.5)
  }

  private resetMotionProgressTextStyle() {
    const progressText = this.feedbackTipTexts[0]
    if (!progressText) return

    progressText
      .setFontSize(this.progressTextFontSize)
      .setColor('#a84a3f')
      .setVisible(false)
      .setPosition(this.progressTextCenterX, this.progressTextCenterY)
    progressText.setFixedSize(this.holdStatusMaxWidth, 0)
  }

  private showRealtimeFeedbackCard() {
    this.feedbackLabelText?.setText('\uC2E4\uC2DC\uAC04 \uD53C\uB4DC\uBC31')
    this.saveRetryButton?.setVisible(false)

    this.feedbackTitleText
      ?.setFontSize(this.feedbackTitleFontSize)
      .setColor('#2f2118')
      .setPosition(this.feedbackTitleCenterX, this.feedbackTitleCenterY)
      .setMaxLines(1)
  }

  private showSaveStatusCard(statusText: string, color: string) {
    this.feedbackLabelText?.setText('\uC800\uC7A5 \uC0C1\uD0DC')
    this.feedbackTitleText
      ?.setText(statusText)
      .setFontSize(this.saveStatusTitleFontSize)
      .setColor(color)
      .setPosition(this.feedbackTitleCenterX, this.saveStatusTitleCenterY)
      .setMaxLines(1)
    this.fitTextToWidth(
      this.feedbackTitleText,
      this.feedbackTitleMaxWidth,
      this.saveStatusTitleFontSize,
      30,
    )
  }

  private refreshMotionProgressDisplay() {
    const motionSpec = this.getCurrentAiMotionSpec()
    const progressDetail = this.getProgressDetailText(motionSpec)
    const progressText = this.feedbackTipTexts[0]

    if (progressText) {
      this.resetMotionProgressTextStyle()
      this.displayedFeedbackDetail = progressDetail
      this.feedbackDetailChangedAtMs = this.time.now
      progressText.setText(progressDetail)
      this.fitTextToWidth(
        progressText,
        this.holdStatusMaxWidth,
        FEEDBACK_TIMER_MAX_FONT_SIZE,
        FEEDBACK_TIMER_MIN_FONT_SIZE,
      )
    }

    this.updateHoldProgressUi(motionSpec)
  }

  private recordCurrentMotionResult() {
    const motionSpec = this.getCurrentAiMotionSpec()
    if (
      this.motionRecords.some(record => record.exerciseMotionId === motionSpec.exerciseMotionId)
    ) {
      return
    }

    const activeDurationMs =
      this.motionStartedAtMs > 0 ? Math.max(0, Date.now() - this.motionStartedAtMs) : 0
    const durationSec = Math.max(
      0,
      Math.round((this.motionAccumulatedDurationMs + activeDurationMs) / 1000),
    )
    const completionRate = this.getMotionProgressRatio(motionSpec)
    const completedCount = this.getCompletedCountByRecord(motionSpec)
    const feedback = this.normalizeSessionFeedback(
      this.aiState.representativeFeedbackText ??
        this.aiState.displayedFeedbackText ??
        this.aiState.feedback,
    )
    const replaySamples = this.sanitizeMotionReplaySamples(this.motionReplaySamples)
    const poseReplay = this.buildCurrentMotionReplayClip(replaySamples, durationSec * 1000)
    const compactPoseReplay = this.buildCompactMotionReplayClip(
      replaySamples,
      durationSec * 1000,
      motionSpec,
    )

    const motionRecord: LocalExerciseMotionRecord = {
      exerciseMotionId: motionSpec.exerciseMotionId,
      durationSec,
      completionRate,
      completedCount,
      feedback,
      ...(poseReplay ? { poseReplay } : {}),
      ...(compactPoseReplay ? { compactPoseReplay } : {}),
    }
    this.motionRecords.push(motionRecord)

    const handle = this.motionRecorderHandle
    this.motionRecorderHandle = null
    const persistPromise = (async () => {
      if (handle) {
        try {
          const rec = await handle.stop()
          const presigned = await requestPresignedUploadUrls({
            videoContentType: rec.videoMimeType,
            thumbContentType: rec.thumbMimeType,
            purpose: 'GYMNASTICS_PERFORMANCE',
          })
          const { video, thumb } = presigned.data
          await Promise.all([
            uploadToPresignedUrl(video, rec.videoBlob),
            uploadToPresignedUrl(thumb, rec.thumbBlob),
          ])
          motionRecord.videoKey = video.key
          motionRecord.thumbKey = thumb.key
        } catch (error) {
          console.warn('[GymnasticsPlayScene] motion recording upload failed', error)
        }
      }
      try {
        const sessionId = await this.ensureExerciseSessionId()
        await createExerciseSessionMotion(sessionId, this.toMotionRequest(motionRecord))
      } catch (error) {
        console.warn('[GymnasticsPlayScene] motion persist failed', error)
      }
    })()
    this.pendingMotionUploads.push(persistPromise)
  }

  private toMotionRequest(record: LocalExerciseMotionRecord): CreateExerciseSessionMotionRequest {
    return {
      exerciseMotionId: record.exerciseMotionId,
      durationSec: record.durationSec,
      accuracy: record.completionRate,
      completedReps: record.completedCount,
      feedback: record.feedback,
      ...(record.videoKey ? { videoKey: record.videoKey } : {}),
      ...(record.thumbKey ? { thumbKey: record.thumbKey } : {}),
      ...(record.poseReplay ? { poseReplay: record.poseReplay } : {}),
      ...(record.compactPoseReplay ? { compactPoseReplay: record.compactPoseReplay } : {}),
    }
  }

  private ensureExerciseSessionId(): Promise<number> {
    if (!this.sessionIdPromise) {
      this.sessionIdPromise = (async () => {
        const patientProfileId = await resolvePatientProfileIdOrFetch()
        if (!patientProfileId) {
          throw new Error('환자 정보가 올바르지 않습니다.')
        }
        this.exerciseSessionPatientProfileId = patientProfileId
        const session = await createExerciseSession({
          patientProfileId,
          exerciseType: this.exerciseType,
        })
        return session.id
      })()
    }
    return this.sessionIdPromise
  }

  private normalizeSessionFeedback(feedback: string | null | undefined) {
    const trimmedFeedback = feedback?.trim()
    return trimmedFeedback ? trimmedFeedback.slice(0, 255) : '\uC6B4\uB3D9 \uC644\uB8CC'
  }

  private async finishExerciseSession() {
    if (this.hasSubmittedSession || this.saveState === 'saving' || this.saveState === 'success')
      return

    // 시범 영상/카운트다운 오버레이 (HTML video 포함) 가 떠 있으면 먼저 정리해야 결과 패널이 위에 보인다.
    this.clearGuideOverlay()
    this.clearCountdownOverlay()

    this.recordCurrentMotionResult()
    this.hasSubmittedSession = true
    this.phase = 'SESSION_COMPLETE'
    this.saveState = 'saving'
    this.isMotionAdvancing = true
    this.aiRequestsEnabled = false
    this.resetFeedbackTts()
    this.renderSaveState()

    try {
      // 동작 단건 저장이 fire-and-forget 으로 진행되었으므로, 남은 persist 들이 끝나길 기다린다.
      // 한 번도 motion 이 저장 안 됐다면 lazy 생성으로 빈 세션이라도 만들어 둔다.
      await this.ensureExerciseSessionId()
      if (this.pendingMotionUploads.length > 0) {
        await Promise.allSettled(this.pendingMotionUploads)
        this.pendingMotionUploads = []
      }
      this.saveState = 'success'
      const patientProfileId = this.exerciseSessionPatientProfileId
      if (patientProfileId) {
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: [EXERCISE_SESSIONS_QUERY_KEY, patientProfileId],
          }),
          queryClient.invalidateQueries({
            queryKey: [EXERCISE_SESSION_REPORT_QUERY_KEY, patientProfileId],
          }),
        ])
      }
      this.renderSaveState()
      const motionCount = this.motionRecords.length
      const averageAccuracy =
        motionCount === 0
          ? 0
          : this.motionRecords.reduce((sum, r) => sum + r.completionRate, 0) / motionCount
      this.showSessionResultPanel(motionCount, averageAccuracy)
    } catch (error) {
      console.warn('[GymnasticsPlayScene] Failed to finalize exercise session.', {
        error,
        apiBaseUrl: import.meta.env.VITE_API_BASE_URL,
        hasAccessToken: Boolean(window.localStorage.getItem('wish_access_token')),
        patientProfileId: resolvePatientProfileId(),
        motionRecords: this.motionRecords,
      })
      this.hasSubmittedSession = false
      this.saveState = 'error'
      this.renderSaveState()
    }
  }

  private renderSaveState() {
    this.showMotionProgressComplete()
    this.saveRetryButton?.setVisible(this.saveState === 'error')

    if (this.saveState === 'saving') {
      this.showSaveStatusCard('\uC800\uC7A5 \uC911', '#6b4a2f')
    } else if (this.saveState === 'success') {
      this.showSaveStatusCard('\uC800\uC7A5 \uC644\uB8CC', '#4d9b5d')
    } else if (this.saveState === 'error') {
      this.showSaveStatusCard('\uC800\uC7A5 \uC2E4\uD328', '#b45b4a')
    }

    this.saveRetryButton?.setVisible(this.saveState === 'error')
  }

  private advanceMotionIfCompleted() {
    const motionSpec = this.getCurrentAiMotionSpec()
    const isComplete = this.isMotionCompleteByRecord(motionSpec)
    if (!isComplete || this.isMotionAdvancing) return

    this.isMotionAdvancing = true
    this.phase = 'MOTION_COMPLETE'
    this.aiRequestsEnabled = false
    this.requestInFlight = false
    this.recordCurrentMotionResult()
    this.setFeedbackTitle('완료!', { force: true })
    this.showMotionAdvanceText('성공!')
    this.time.delayedCall(700, () => {
      this.advanceToNextMotion(false)
    })
  }

  private showMotionAdvanceText(label: string) {
    const { width: vw, height: vh } = this.scale
    const fontSize = Math.round(Phaser.Math.Clamp(vh * 0.16, 80, 200))
    const text = this.add
      .text(vw / 2, vh / 2, label, {
        fontFamily: 'sans-serif',
        fontSize: `${fontSize}px`,
        color: '#ffefc0',
        fontStyle: '900',
        stroke: '#5a3517',
        strokeThickness: 10,
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(42)
      .setAlpha(0)
      .setScale(0.7)
    text.setShadow(0, 5, '#000000', 12, false, true)
    this.tweens.add({
      targets: text,
      alpha: 1,
      scale: 1.12,
      duration: 180,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: text,
          alpha: 0,
          scale: 1,
          delay: 500,
          duration: 200,
          ease: 'Sine.easeIn',
          onComplete: () => text.destroy(),
        })
      },
    })
  }

  private advanceToNextMotion(manual: boolean) {
    if (manual && this.isMotionAdvancing) return

    this.resetFeedbackTts()

    if (this.motionIndex < this.motions.length - 1) {
      if (manual) {
        this.recordCurrentMotionResult()
      }
      this.motionIndex += 1
      this.aiState = createInitialAiState()
      this.aiError = null
      this.isMotionAdvancing = false
      this.displayedFeedbackTitle = ''
      this.feedbackTitleChangedAtMs = 0
      this.displayedFeedbackDetail = ''
      this.feedbackDetailChangedAtMs = 0
      this.motionStartedAtMs = 0
      this.motionAccumulatedDurationMs = 0
      this.resetCurrentMotionReplay()
      this.cancelCurrentMotionRecording()
      this.renderMotion()
      this.showGuidePreview()
      return
    }

    void this.finishExerciseSession()
  }

  private returnToPreviousMotion() {
    if (this.isMotionAdvancing || this.motionIndex <= 0) return

    this.resetFeedbackTts()
    this.motionIndex -= 1
    this.aiState = createInitialAiState()
    this.aiError = null
    this.displayedFeedbackTitle = ''
    this.feedbackTitleChangedAtMs = 0
    this.displayedFeedbackDetail = ''
    this.feedbackDetailChangedAtMs = 0
    this.motionStartedAtMs = 0
    this.motionAccumulatedDurationMs = 0
    this.resetCurrentMotionReplay()
    this.cancelCurrentMotionRecording()
    this.renderMotion()
    this.showSideGuideVideo()
  }

  private updateHeaderStats() {
    const motionSpec = this.getCurrentAiMotionSpec()
    const progressLabel =
      motionSpec.type === 'daniel'
        ? `\uC720\uC9C0 ${this.getDanielHoldDetail(motionSpec)}`
        : `\uD69F\uC218 ${this.getProgressDetailText(motionSpec)}`

    this.timerText?.setText(progressLabel)
    this.fitTextToWidth(this.timerText, this.motionCounterMaxWidth, this.headerFontSize, 14)
  }

  private getCurrentAiMotionSpec() {
    return this.aiSequence[this.motionIndex] ?? this.aiSequence[this.aiSequence.length - 1]
  }

  private toLandmarkPayload(
    landmarks: readonly { x: number; y: number; z: number; visibility?: number }[],
  ): LandmarkPayload[] {
    return landmarks.map((landmark, index) => ({
      name: POSE_LANDMARK_NAMES[index] ?? `LANDMARK_${index}`,
      x: landmark.x,
      y: landmark.y,
      z: landmark.z,
      visibility: landmark.visibility,
    }))
  }

  private resetCurrentMotionReplay() {
    this.motionReplaySamples = []
    this.compactReplayMarkers = []
    this.lastReplaySampleAtMs = Number.NEGATIVE_INFINITY
  }

  private captureCompactReplayMarkers(payload: GymnasticsAiResponse) {
    const motionSpec = this.getCurrentAiMotionSpec()
    const metadata = payload.replay_metadata
    const elapsedMs = Math.round(this.getCurrentMotionElapsedMs())

    if (motionSpec.type === 'top' && this.didTopCountIncrease) {
      this.addCompactReplayMarker(
        'count',
        elapsedMs - TOP_COUNT_MARKER_WINDOW_MS,
        elapsedMs,
        'top count increment window',
      )
    }

    const hasCoachingCue =
      metadata?.tracking === 'tracking_low' ||
      metadata?.frame_label === 'guidance_needed' ||
      Boolean(metadata?.guidance_code || metadata?.guidance_text)
    if (!hasCoachingCue) return

    this.addCompactReplayMarker(
      'coaching',
      elapsedMs - COACHING_MARKER_WINDOW_MS / 2,
      elapsedMs + COACHING_MARKER_WINDOW_MS / 2,
      metadata?.guidance_text ?? metadata?.guidance_code ?? metadata?.frame_label ?? 'coaching cue',
    )
  }

  private addCompactReplayMarker(
    kind: CompactReplayMarker['kind'],
    startMs: number,
    endMs: number,
    reason: string,
  ) {
    if (this.compactReplayMarkers.length >= COMPACT_REPLAY_MAX_MARKERS) return

    const durationMs = Math.max(0, Math.round(this.getCurrentMotionElapsedMs()))
    const marker: CompactReplayMarker = {
      kind,
      startMs: Math.max(0, Math.round(startMs)),
      endMs: Math.max(0, Math.round(Math.min(durationMs, endMs))),
      reason: reason.slice(0, 120),
    }
    if (marker.endMs < marker.startMs) {
      marker.endMs = marker.startMs
    }

    const previous = this.compactReplayMarkers[this.compactReplayMarkers.length - 1]
    if (
      previous &&
      previous.kind === marker.kind &&
      previous.reason === marker.reason &&
      marker.startMs <= previous.endMs + COMPACT_REPLAY_MARKER_MERGE_GAP_MS
    ) {
      previous.endMs = Math.max(previous.endMs, marker.endMs)
      return
    }

    this.compactReplayMarkers.push(marker)
  }

  private sampleCurrentMotionReplay(
    landmarks: readonly { x: number; y: number; z?: number; visibility?: number }[],
  ) {
    if (this.motionReplaySamples.length >= REPLAY_MAX_FRAMES) return

    const elapsedMs = this.getCurrentMotionElapsedMs()
    if (elapsedMs - this.lastReplaySampleAtMs < REPLAY_SAMPLE_INTERVAL_MS) return

    const normalized = this.toReplayLandmarkTuples(landmarks)
    if (!normalized) return

    const frame: MotionReplayFrame = {
      t: Math.max(0, Math.round(elapsedMs)),
      lm: normalized.tuples,
    }

    this.motionReplaySamples.push({
      frame,
      meanConfidence: normalized.meanConfidence,
      trackingOk: normalized.trackingOk,
      progress: this.getMotionProgressRatio(this.getCurrentAiMotionSpec()),
    })
    this.lastReplaySampleAtMs = elapsedMs
  }

  private getCurrentMotionElapsedMs() {
    const activeDurationMs =
      this.motionStartedAtMs > 0 ? Math.max(0, Date.now() - this.motionStartedAtMs) : 0
    return this.motionAccumulatedDurationMs + activeDurationMs
  }

  private toReplayLandmarkTuples(
    landmarks: readonly { x: number; y: number; z?: number; visibility?: number }[],
  ): {
    tuples: readonly MotionReplayLandmarkTuple[]
    meanConfidence: number
    trackingOk: boolean
  } | null {
    const raw = new Map<ReplayLandmarkName, RawReplayLandmark>()

    for (const name of REPLAY_LANDMARK_NAMES) {
      const landmark = this.getLandmark(landmarks, name)
      if (!landmark) continue

      const confidence = landmark.visibility ?? 1
      if (confidence < REPLAY_MIN_CONFIDENCE) continue

      const mirroredName = this.mirrorReplayLandmarkName(name)
      raw.set(mirroredName, {
        x: 1 - landmark.x,
        y: landmark.y,
        z: Number.isFinite(landmark.z) ? landmark.z! : null,
        confidence,
      })
    }

    const leftHip = raw.get('LEFT_HIP')
    const rightHip = raw.get('RIGHT_HIP')
    const hipCenter = {
      x: leftHip && rightHip ? (leftHip.x + rightHip.x) / 2 : 0.5,
      y: leftHip && rightHip ? (leftHip.y + rightHip.y) / 2 : 0.5,
    }
    const leftShoulder = raw.get('LEFT_SHOULDER')
    const rightShoulder = raw.get('RIGHT_SHOULDER')
    if (!leftShoulder || !rightShoulder) return null

    const shoulderWidth = Math.hypot(
      rightShoulder.x - leftShoulder.x,
      rightShoulder.y - leftShoulder.y,
    )
    if (!Number.isFinite(shoulderWidth) || shoulderWidth < REPLAY_MIN_SHOULDER_WIDTH) {
      return null
    }
    const scale = shoulderWidth

    const tuples = REPLAY_LANDMARK_NAMES.map<MotionReplayLandmarkTuple>(name => {
      const landmark = raw.get(name)
      if (!landmark) return [null, null, null, 0]

      return [
        this.roundReplayValue((landmark.x - hipCenter.x) / scale),
        this.roundReplayValue((landmark.y - hipCenter.y) / scale),
        landmark.z == null ? null : this.roundReplayValue(landmark.z / scale),
        this.roundReplayValue(landmark.confidence),
      ]
    })
    const confidenceValues = tuples.map(tuple => tuple[3])
    const meanConfidence =
      confidenceValues.reduce((total, confidence) => total + confidence, 0) /
      confidenceValues.length
    const trackingOk = REPLAY_REQUIRED_TRACKING_NAMES.every(name => raw.has(name))

    return { tuples, meanConfidence, trackingOk }
  }

  private mirrorReplayLandmarkName(name: ReplayLandmarkName): ReplayLandmarkName {
    if (name.startsWith('LEFT_')) return name.replace('LEFT_', 'RIGHT_') as ReplayLandmarkName
    if (name.startsWith('RIGHT_')) return name.replace('RIGHT_', 'LEFT_') as ReplayLandmarkName
    return name
  }

  private roundReplayValue(value: number) {
    return Math.round(value * 10_000) / 10_000
  }

  private sanitizeMotionReplaySamples(
    samples: readonly LocalMotionReplaySample[],
  ): LocalMotionReplaySample[] {
    if (samples.length === 0) return []

    const frames = samples.map(sample => ({
      ...sample.frame,
      lm: sample.frame.lm.map(tuple => [...tuple] as MotionReplayLandmarkTuple),
    }))

    for (let landmarkIndex = 0; landmarkIndex < REPLAY_LANDMARK_NAMES.length; landmarkIndex += 1) {
      let frameIndex = 0

      while (frameIndex < frames.length) {
        if (this.isReplayTupleComplete(frames[frameIndex].lm[landmarkIndex])) {
          frameIndex += 1
          continue
        }

        const startIndex = frameIndex
        while (
          frameIndex < frames.length &&
          !this.isReplayTupleComplete(frames[frameIndex].lm[landmarkIndex])
        ) {
          frameIndex += 1
        }

        const endIndex = frameIndex
        const missingFrameCount = endIndex - startIndex
        const previousIndex = startIndex - 1
        const nextIndex = endIndex
        const previousTuple = frames[previousIndex]?.lm[landmarkIndex]
        const nextTuple = frames[nextIndex]?.lm[landmarkIndex]
        const canInterpolate =
          missingFrameCount <= REPLAY_MAX_INTERPOLATION_GAP_FRAMES &&
          this.isReplayTupleComplete(previousTuple) &&
          this.isReplayTupleComplete(nextTuple) &&
          frames[nextIndex].t > frames[previousIndex].t

        for (let index = startIndex; index < endIndex; index += 1) {
          frames[index].lm[landmarkIndex] = canInterpolate
            ? this.interpolateReplayTuple(
                previousTuple,
                nextTuple,
                frames[previousIndex].t,
                frames[index].t,
                frames[nextIndex].t,
              )
            : this.createMissingReplayTuple()
        }
      }
    }

    return samples.map((sample, index) => ({
      ...sample,
      frame: frames[index],
    }))
  }

  private isReplayTupleComplete(
    tuple: MotionReplayLandmarkTuple | undefined,
  ): tuple is CompleteMotionReplayLandmarkTuple {
    if (!tuple || tuple.length !== 4) return false
    const [x, y, z, confidence] = tuple
    return (
      this.isReplayCoordinatePersistable(x) &&
      this.isReplayCoordinatePersistable(y) &&
      this.isReplayCoordinatePersistable(z) &&
      x !== null &&
      y !== null &&
      Number.isFinite(confidence) &&
      confidence >= 0 &&
      confidence <= 1
    )
  }

  private isReplayCoordinatePersistable(value: number | null) {
    return (
      value === null ||
      (Number.isFinite(value) && Math.abs(value) <= REPLAY_NORMALIZED_COORDINATE_ABS_LIMIT)
    )
  }

  private interpolateReplayTuple(
    previous: CompleteMotionReplayLandmarkTuple,
    next: CompleteMotionReplayLandmarkTuple,
    previousTimeMs: number,
    currentTimeMs: number,
    nextTimeMs: number,
  ): MotionReplayLandmarkTuple {
    if (nextTimeMs <= previousTimeMs) return this.createMissingReplayTuple()

    const denominator = nextTimeMs - previousTimeMs
    const ratio = Math.min(1, Math.max(0, (currentTimeMs - previousTimeMs) / denominator))
    const interpolate = (from: number, to: number) =>
      this.roundReplayValue(from + (to - from) * ratio)
    const z = previous[2] === null || next[2] === null ? null : interpolate(previous[2], next[2])
    const confidence = Math.min(
      REPLAY_MAX_INTERPOLATED_CONFIDENCE,
      this.roundReplayValue(((previous[3] + next[3]) / 2) * REPLAY_INTERPOLATED_CONFIDENCE_DECAY),
    )

    return [interpolate(previous[0], next[0]), interpolate(previous[1], next[1]), z, confidence]
  }

  private createMissingReplayTuple(): MotionReplayLandmarkTuple {
    return [null, null, null, 0]
  }

  private buildCurrentMotionReplayClip(
    samples: readonly LocalMotionReplaySample[],
    durationMs: number,
  ): ExerciseMotionReplayClip | null {
    if (samples.length === 0) return null

    const frames = samples.map(sample => sample.frame)
    const lastFrameMs = frames[frames.length - 1]?.t ?? 0
    const replayDurationMs = Math.max(0, Math.round(Math.max(durationMs, lastFrameMs)))

    return {
      version: REPLAY_VERSION,
      fps: REPLAY_FPS,
      durationMs: replayDurationMs,
      landmarks: REPLAY_LANDMARK_NAMES,
      frames,
      representativeSegment: this.pickRepresentativeReplaySegment(samples, replayDurationMs),
    }
  }

  private buildCompactMotionReplayClip(
    samples: readonly LocalMotionReplaySample[],
    durationMs: number,
    motionSpec: AiMotionSpec,
  ): ExerciseMotionReplayClip | null {
    if (samples.length === 0) return null

    const frameIntervalMs = 1000 / COMPACT_REPLAY_FPS
    const frames: MotionReplayFrame[] = []
    let previousBucket = -1

    for (const sample of samples) {
      const bucket = Math.floor(sample.frame.t / frameIntervalMs)
      if (bucket === previousBucket) continue
      frames.push(sample.frame)
      previousBucket = bucket
    }

    if (frames.length === 0) return null

    const lastFrameMs = frames[frames.length - 1]?.t ?? 0
    const replayDurationMs = Math.max(0, Math.round(Math.max(durationMs, lastFrameMs)))
    const firstCountMarker = this.compactReplayMarkers.find(marker => marker.kind === 'count')
    if (motionSpec.type === 'top') {
      const segment =
        firstCountMarker ?? this.pickRepresentativeReplaySegment(samples, replayDurationMs)
      if (segment) {
        const startMs = Math.max(0, Math.min(replayDurationMs, segment.startMs))
        const endMs = Math.max(startMs, Math.min(replayDurationMs, segment.endMs))
        const clippedFrames = frames
          .filter(frame => frame.t >= startMs && frame.t <= endMs)
          .map(frame => ({ ...frame, t: Math.max(0, Math.round(frame.t - startMs)) }))
        const replayFrames =
          clippedFrames.length > 0
            ? clippedFrames
            : frames.slice(0, 1).map(frame => ({ ...frame, t: 0 }))
        const clipDurationMs = Math.max(
          0,
          endMs - startMs,
          replayFrames[replayFrames.length - 1]?.t ?? 0,
        )

        return {
          version: REPLAY_VERSION,
          fps: COMPACT_REPLAY_FPS,
          durationMs: clipDurationMs,
          landmarks: REPLAY_LANDMARK_NAMES,
          frames: replayFrames,
          representativeSegment: {
            startMs: 0,
            endMs: clipDurationMs,
            reason: segment.reason ?? 'top count compact replay',
          },
          markers: [
            {
              startMs: 0,
              endMs: clipDurationMs,
              reason: segment.reason ?? 'top count compact replay',
            },
          ],
        }
      }
    }

    const representativeSegment = {
      startMs: 0,
      endMs: replayDurationMs,
      reason: 'daniel full session compact replay',
    }
    const markers = this.compactReplayMarkers.map<MotionReplaySegment>(
      ({ startMs, endMs, reason }) => {
        const clippedStartMs = Math.max(0, Math.min(replayDurationMs, startMs))
        const clippedEndMs = Math.max(clippedStartMs, Math.min(replayDurationMs, endMs))
        return {
          startMs: clippedStartMs,
          endMs: clippedEndMs,
          reason,
        }
      },
    )

    return {
      version: REPLAY_VERSION,
      fps: COMPACT_REPLAY_FPS,
      durationMs: replayDurationMs,
      landmarks: REPLAY_LANDMARK_NAMES,
      frames,
      representativeSegment,
      markers,
    }
  }

  private pickRepresentativeReplaySegment(
    samples: readonly LocalMotionReplaySample[],
    durationMs: number,
  ): MotionReplaySegment | null {
    if (samples.length === 0) return null

    const windowMs = Math.min(5000, Math.max(3000, durationMs))
    if (durationMs <= windowMs) {
      return {
        startMs: 0,
        endMs: durationMs,
        reason: 'full motion window',
      }
    }

    const windowSize = Math.max(1, Math.round(windowMs / REPLAY_SAMPLE_INTERVAL_MS))
    const prefixScores = [0]
    samples.forEach(sample => {
      prefixScores.push(
        prefixScores[prefixScores.length - 1] +
          sample.meanConfidence +
          sample.progress +
          (sample.trackingOk ? 0.25 : 0),
      )
    })

    let bestScore = Number.NEGATIVE_INFINITY
    let bestStartMs = 0
    for (let startIndex = 0; startIndex < samples.length; startIndex += 1) {
      const endIndex = Math.min(samples.length - 1, startIndex + windowSize - 1)
      const startMs = samples[startIndex].frame.t
      const endMs = samples[endIndex].frame.t
      if (endMs > durationMs) break

      const sampleCount = endIndex - startIndex + 1
      const qualityScore = (prefixScores[endIndex + 1] - prefixScores[startIndex]) / sampleCount
      if (qualityScore > bestScore) {
        bestScore = qualityScore
        bestStartMs = startMs
      }
    }

    return {
      startMs: Math.round(bestStartMs),
      endMs: Math.round(Math.min(durationMs, bestStartMs + windowMs)),
      reason: 'highest tracking/progress score',
    }
  }

  private updateRecognitionStatus(isRecognized: boolean) {
    if (this.isCameraRecognized === isRecognized) return
    this.isCameraRecognized = isRecognized
    this.statusDot.setFillStyle(isRecognized ? 0x1fbf5b : 0xd13b2f)
    this.statusText.setText(isRecognized ? '인식 중' : '인식 불가')
    this.statusText.setText(isRecognized ? '인식 중' : '인식 대기')
    if (isRecognized) {
      this.clearFeedbackTitle()
    } else {
      this.setFeedbackTitle('전신이 보이게 서요', { force: true })
    }
    if (this.feedbackTitleText) {
      this.layoutStatusBadge()
      this.fitFeedbackTitleToOneLine()
      this.positionFeedbackStar()
    }
  }

  private renderMotion() {
    this.motionTitleText?.setText(this.getMotionDisplayTitle())
    this.fitTextToWidth(this.motionTitleText, this.motionTitleMaxWidth, 34, 22)
    this.centerMotionTitleText()
    if (this.isCameraRecognized) {
      this.clearFeedbackTitle()
    } else {
      this.setFeedbackTitle('전신이 보이게 서요', { force: true })
    }
    this.updateHoldProgressUi(this.getCurrentAiMotionSpec())
    this.fitFeedbackTitleToOneLine()
    this.positionFeedbackStar()
    const motionSpec = this.getCurrentAiMotionSpec()
    const initialDetail = this.getProgressDetailText(motionSpec)
    this.feedbackTipTexts.forEach((text, index) => {
      text.setText(index === 0 ? initialDetail : '')
      if (index === 0) {
        this.displayedFeedbackDetail = initialDetail
        this.feedbackDetailChangedAtMs = this.time.now
      }
      this.fitTextToWidth(
        text,
        this.holdStatusMaxWidth,
        FEEDBACK_TIMER_MAX_FONT_SIZE,
        FEEDBACK_TIMER_MIN_FONT_SIZE,
      )
    })
  }

  private positionFeedbackStar() {
    const centerX = this.feedbackFrameBounds.x + this.feedbackFrameBounds.width / 2
    const mainY =
      this.feedbackFrameBounds.y + this.feedbackFrameBounds.height * FEEDBACK_MAIN_Y_RATIO

    this.feedbackTitleText.setPosition(centerX, mainY)
  }

  private centerMotionTitleText() {
    if (!this.motionTitleText) return

    this.motionTitleText.setPosition(this.motionTitleCenterX, this.motionTitleCenterY)
    this.motionTitleText.setOrigin(0.5, 0.46)
  }

  private fitFeedbackTitleToOneLine() {
    if (!this.feedbackTitleText) return

    this.feedbackTitleText.setMaxLines(1)
    this.fitTextToWidth(
      this.feedbackTitleText,
      this.feedbackTitleMaxWidth,
      FEEDBACK_MAIN_MAX_FONT_SIZE,
      FEEDBACK_MAIN_MIN_FONT_SIZE,
    )
  }

  private canFitTextAtFontSize(textValue: string, maxWidth: number, fontSize: number) {
    if (!this.feedbackTitleText || !Number.isFinite(maxWidth)) return true

    const previousText = this.feedbackTitleText.text
    const previousFontSize =
      Number.parseInt(String(this.feedbackTitleText.style.fontSize), 10) || fontSize

    this.feedbackTitleText.setText(textValue)
    this.feedbackTitleText.setFontSize(fontSize)
    const canFit = this.feedbackTitleText.width <= maxWidth

    this.feedbackTitleText.setText(previousText)
    this.feedbackTitleText.setFontSize(previousFontSize)

    return canFit
  }

  private fitTextToWidth(
    text: Phaser.GameObjects.Text,
    maxWidth: number,
    maxFontSize: number,
    minFontSize: number,
  ) {
    let fontSize = maxFontSize
    text.setFontSize(fontSize)

    while (text.width > maxWidth && fontSize > minFontSize) {
      fontSize -= 1
      text.setFontSize(fontSize)
    }
  }

  private cancelCurrentMotionRecording() {
    this.motionRecorderHandle?.cancel()
    this.motionRecorderHandle = null
  }

  private cleanup() {
    this.timerEvent?.remove(false)
    this.timerEvent = undefined
    this.poseTracker?.stop()
    this.poseTracker = null
    this.requestInFlight = false
    this.resetFeedbackTts()
    this.clearGuideOverlay()
    this.clearCountdownOverlay()
    this.cancelCurrentMotionRecording()
    this.resetCurrentMotionReplay()
    this.pendingMotionUploads = []
    this.sessionIdPromise = null
    this.exerciseSessionPatientProfileId = null
    this.sessionResultPanel?.destroy(true)
    this.sessionResultPanel = undefined
    this.finishButton?.destroy()
    this.finishButton = undefined
  }
}

export class GymnasticsTopScene extends GymnasticsPlaySceneBase {
  constructor() {
    super('GymnasticsTopScene', TOP_AI_MOTIONS, 'top \uCCB4\uC870', 'TOP', TOP_AI_SEQUENCE)
  }
}

export class GymnasticsDanielScene extends GymnasticsPlaySceneBase {
  constructor() {
    super(
      'GymnasticsDanielScene',
      DANIEL_MOTIONS,
      '\uB2E4\uB2C8\uC5D8 \uCCB4\uC870',
      'DANIEL',
      DANIEL_AI_SEQUENCE,
    )
  }
}
