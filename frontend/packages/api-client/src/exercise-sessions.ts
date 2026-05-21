import { isAxiosError, type AxiosInstance } from 'axios'
import { apiClient } from './client'
import type { ApiResponse, PageResponse } from './artworks'
import { listPatientProfiles } from './patient-profiles'

export type ExerciseSessionType = string
const EXERCISE_SESSION_DETAIL_CONCURRENCY = 6

export type ExerciseSessionSummary = {
  id: number
  patientProfileId: number
  exerciseType: ExerciseSessionType
  durationSec: number
  averageAccuracy: number
  completedMotionCount: number
  createdAt: string
}

export type CreateExerciseSessionMotionRequest = {
  exerciseMotionId: number
  durationSec: number
  accuracy: number
  completedReps: number
  feedback?: string
  videoKey?: string
  thumbKey?: string
  poseReplay?: ExerciseMotionReplayClip
  compactPoseReplay?: ExerciseMotionReplayClip
}

export type MotionReplayLandmarkTuple = readonly [
  number | null,
  number | null,
  number | null,
  number,
]

export type MotionReplayFrame = {
  t: number
  lm: readonly MotionReplayLandmarkTuple[]
}

export type MotionReplaySegment = {
  startMs: number
  endMs: number
  reason?: string | null
}

export type ExerciseMotionReplayClip = {
  version: number
  fps: number
  durationMs: number
  landmarks: readonly string[]
  frames: readonly MotionReplayFrame[]
  representativeSegment?: MotionReplaySegment | null
  markers?: readonly MotionReplaySegment[] | null
}

export type ExerciseMotionReplayResponse = {
  motionResultId: number
  exerciseMotionId: number
  motionName: string
  routineOrder: number
  replayAvailable: boolean
  replay: ExerciseMotionReplayClip | null
  compactReplay?: ExerciseMotionReplayClip | null
}

export type ExerciseMotionMovementAnalysisJointRange = {
  jointName: string
  label: string
  analysisAvailable: boolean
  validFrameCount: number
  coverageRate: number
  minAngleDeg: number | null
  maxAngleDeg: number | null
  rangeDeg: number | null
  averageConfidence: number | null
}

export type ExerciseMotionMovementAnalysisSegment = {
  startMs: number | null
  endMs: number | null
  reason: string | null
}

export type ExerciseMotionMovementAnalysisResponse = {
  motionResultId: number
  exerciseMotionId: number
  motionName: string
  routineOrder: number
  analysisAvailable: boolean
  replaySource: 'RAW' | 'COMPACT' | 'NONE' | string
  durationMs: number | null
  totalFrameCount: number
  analyzedFrameCount: number
  excludedFrameCount: number
  analyzedDurationMs: number | null
  excludedDurationMs: number | null
  confidenceThreshold: number
  averageConfidence: number | null
  joints: ExerciseMotionMovementAnalysisJointRange[]
  excludedSegments: ExerciseMotionMovementAnalysisSegment[]
  representativeSegment: ExerciseMotionMovementAnalysisSegment | null
}

export type CreateExerciseSessionRequest = {
  patientProfileId: number
  exerciseType: ExerciseSessionType
}

export type ExerciseSessionMotionResult = {
  id: number
  exerciseMotionId: number
  motionName: string
  routineOrder: number
  durationSec: number
  accuracy: number
  completedReps: number
  feedback: string
  videoUrl?: string | null
  thumbUrl?: string | null
  replayAvailable?: boolean
  createdAt: string
}

export type ExerciseSessionDetail = ExerciseSessionSummary & {
  motions: ExerciseSessionMotionResult[]
}

export type ExerciseSessionMotionSaveResponse = {
  sessionId: number
  sessionDurationSec: number
  sessionAverageAccuracy: number
  sessionCompletedMotionCount: number
  savedMotion: ExerciseSessionMotionResult
}

export const EXERCISE_SESSION_ERROR_MESSAGE =
  '\uCCB4\uC870 \uC138\uC158 \uAE30\uB85D\uC744 \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694.'

export const CREATE_EXERCISE_SESSION_ERROR_MESSAGE =
  '\uCCB4\uC870 \uAE30\uB85D\uC744 \uC800\uC7A5\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694.'

export const EXERCISE_SESSION_DETAIL_ERROR_MESSAGE =
  '\uCCB4\uC870 \uC138\uC158 \uC0C1\uC138 \uAE30\uB85D\uC744 \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694.'

export const EXERCISE_MOTION_REPLAY_ERROR_MESSAGE =
  '\uCCB4\uC870 \uB3D9\uC791 \uB9AC\uD50C\uB808\uC774\uB97C \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694.'

export const EXERCISE_MOTION_MOVEMENT_ANALYSIS_ERROR_MESSAGE =
  '\uCCB4\uC870 \uB3D9\uC791 \uC6C0\uC9C1\uC784 \uBD84\uC11D\uC744 \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694.'

const INVALID_PATIENT_PROFILE_ID_MESSAGE =
  'patientProfileId\uAC00 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.'
const INVALID_EXERCISE_SESSION_ID_MESSAGE =
  '\uCCB4\uC870 \uC138\uC158 ID\uAC00 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.'
const INVALID_EXERCISE_MOTION_RESULT_ID_MESSAGE =
  '\uCCB4\uC870 \uB3D9\uC791 \uACB0\uACFC ID\uAC00 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.'
const INVALID_EXERCISE_TYPE_MESSAGE =
  '\uC6B4\uB3D9 \uC885\uB958\uAC00 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.'
const INVALID_SAVE_RESPONSE_MESSAGE =
  '\uCCB4\uC870 \uC138\uC158 \uC800\uC7A5 \uC751\uB2F5\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.'
const INVALID_DETAIL_RESPONSE_MESSAGE =
  '\uCCB4\uC870 \uC138\uC158 \uC0C1\uC138 \uC751\uB2F5\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.'
const INVALID_REPLAY_RESPONSE_MESSAGE =
  '\uCCB4\uC870 \uB3D9\uC791 \uB9AC\uD50C\uB808\uC774 \uC751\uB2F5\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.'
const INVALID_MOVEMENT_ANALYSIS_RESPONSE_MESSAGE =
  '\uCCB4\uC870 \uB3D9\uC791 \uC6C0\uC9C1\uC784 \uBD84\uC11D \uC751\uB2F5\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.'
const INVALID_POSE_REPLAY_MESSAGE =
  '\uC88C\uD45C \uB9AC\uD50C\uB808\uC774 \uB370\uC774\uD130\uAC00 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.'

const RAW_REPLAY_FPS = 30
const COMPACT_REPLAY_MIN_FPS = 5
const COMPACT_REPLAY_MAX_FPS = 10
const REPLAY_LANDMARK_NAMES_V1 = [
  'LEFT_SHOULDER',
  'RIGHT_SHOULDER',
  'LEFT_ELBOW',
  'RIGHT_ELBOW',
  'LEFT_WRIST',
  'RIGHT_WRIST',
  'LEFT_HIP',
  'RIGHT_HIP',
  'LEFT_KNEE',
  'RIGHT_KNEE',
  'LEFT_ANKLE',
  'RIGHT_ANKLE',
] as const
const REPLAY_LANDMARK_NAMES_V2 = [
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
const REPLAY_TUPLE_SIZE = 4
const REPLAY_MAX_CAPTURE_SECONDS = 180
const REPLAY_MAX_DURATION_MS = REPLAY_MAX_CAPTURE_SECONDS * 1000
// Avatar replay stores normalized pose coordinates. z/pose normalization can exceed [-1, 1],
// but values outside this bound are treated as corrupted payloads.
const REPLAY_NORMALIZED_COORDINATE_ABS_LIMIT = 10

export function createExerciseSessionError(error: unknown) {
  const message =
    error instanceof Error && error.message.trim() ? error.message : EXERCISE_SESSION_ERROR_MESSAGE
  return new Error(message)
}

function createExerciseSessionSaveError(error: unknown) {
  if (error instanceof Error && error.message === INVALID_SAVE_RESPONSE_MESSAGE) {
    return error
  }

  if (isAxiosError(error)) {
    const status = error.response?.status
    const responseBody = error.response?.data as Partial<ApiResponse<unknown>> | undefined
    const responseMessage =
      typeof responseBody?.message === 'string' && responseBody.message.trim()
        ? responseBody.message.trim()
        : undefined
    const errorDetails =
      responseBody?.errors && Object.keys(responseBody.errors).length > 0
        ? JSON.stringify(responseBody.errors)
        : undefined
    const detail = responseMessage ?? errorDetails ?? error.message

    return new Error(
      status
        ? `${CREATE_EXERCISE_SESSION_ERROR_MESSAGE} (${status}: ${detail})`
        : `${CREATE_EXERCISE_SESSION_ERROR_MESSAGE} (${detail})`,
    )
  }

  return new Error(CREATE_EXERCISE_SESSION_ERROR_MESSAGE)
}

function assertValidPatientProfileId(patientProfileId: number) {
  if (!Number.isInteger(patientProfileId) || patientProfileId <= 0) {
    throw new Error(INVALID_PATIENT_PROFILE_ID_MESSAGE)
  }
}

function assertValidExerciseSessionId(id: number) {
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(INVALID_EXERCISE_SESSION_ID_MESSAGE)
  }
}

function assertValidExerciseMotionResultId(id: number) {
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(INVALID_EXERCISE_MOTION_RESULT_ID_MESSAGE)
  }
}

function assertFiniteNumber(value: number, message: string) {
  if (!Number.isFinite(value)) {
    throw new Error(message)
  }
}

function assertCompletionRate(value: number, message: string) {
  assertFiniteNumber(value, message)
  if (value < 0 || value > 1) {
    throw new Error(message)
  }
}

function getExpectedReplayLandmarks(version: number): readonly string[] | null {
  if (version === 1) return REPLAY_LANDMARK_NAMES_V1
  if (version === 2) return REPLAY_LANDMARK_NAMES_V2
  return null
}

function hasExpectedReplayLandmarks(
  landmarks: readonly string[],
  expectedLandmarks: readonly string[],
): boolean {
  return (
    landmarks.length === expectedLandmarks.length &&
    landmarks.every((landmark, index) => landmark === expectedLandmarks[index])
  )
}

function isValidReplayFps(fps: number, mode: 'raw' | 'compact'): boolean {
  if (mode === 'raw') return fps === RAW_REPLAY_FPS
  return fps >= COMPACT_REPLAY_MIN_FPS && fps <= COMPACT_REPLAY_MAX_FPS
}

function validateReplaySegment(
  segment: MotionReplaySegment | null | undefined,
  durationMs: number,
): void {
  if (!segment) return
  if (
    !Number.isFinite(segment.startMs) ||
    !Number.isFinite(segment.endMs) ||
    segment.startMs < 0 ||
    segment.endMs < segment.startMs ||
    segment.endMs > durationMs
  ) {
    throw new Error(INVALID_POSE_REPLAY_MESSAGE)
  }
}

function validatePoseReplay(replay: ExerciseMotionReplayClip, mode: 'raw' | 'compact'): void {
  const expectedLandmarks = getExpectedReplayLandmarks(replay.version)
  if (
    expectedLandmarks == null ||
    !Number.isInteger(replay.fps) ||
    !isValidReplayFps(replay.fps, mode) ||
    !Number.isInteger(replay.durationMs) ||
    replay.durationMs < 0 ||
    replay.durationMs > REPLAY_MAX_DURATION_MS ||
    !Array.isArray(replay.landmarks) ||
    !hasExpectedReplayLandmarks(replay.landmarks, expectedLandmarks) ||
    !Array.isArray(replay.frames) ||
    replay.frames.length === 0 ||
    replay.frames.length > replay.fps * REPLAY_MAX_CAPTURE_SECONDS
  ) {
    throw new Error(INVALID_POSE_REPLAY_MESSAGE)
  }

  let previousTimestampMs = -1
  replay.frames.forEach(frame => {
    if (
      !Number.isInteger(frame.t) ||
      frame.t < 0 ||
      frame.t <= previousTimestampMs ||
      frame.t > replay.durationMs ||
      !Array.isArray(frame.lm) ||
      frame.lm.length !== expectedLandmarks.length
    ) {
      throw new Error(INVALID_POSE_REPLAY_MESSAGE)
    }
    previousTimestampMs = frame.t

    frame.lm.forEach((tuple: MotionReplayLandmarkTuple) => {
      if (!Array.isArray(tuple) || tuple.length !== REPLAY_TUPLE_SIZE) {
        throw new Error(INVALID_POSE_REPLAY_MESSAGE)
      }

      const [x, y, z, confidence] = tuple
      const coordinates = [x, y, z]
      if (
        coordinates.some(
          value =>
            value !== null &&
            (!Number.isFinite(value) || Math.abs(value) > REPLAY_NORMALIZED_COORDINATE_ABS_LIMIT),
        ) ||
        !Number.isFinite(confidence) ||
        confidence < 0 ||
        confidence > 1
      ) {
        throw new Error(INVALID_POSE_REPLAY_MESSAGE)
      }
    })
  })

  validateReplaySegment(replay.representativeSegment, replay.durationMs)
  if (replay.markers != null) {
    if (!Array.isArray(replay.markers) || replay.markers.length > 32) {
      throw new Error(INVALID_POSE_REPLAY_MESSAGE)
    }
    replay.markers.forEach(marker => validateReplaySegment(marker, replay.durationMs))
  }
}

function getMotionMessage(
  order: number,
  field: 'info' | 'duration' | 'completionRate' | 'count' | 'feedback',
) {
  const labels = {
    info: ['\uB3D9\uC791 \uC815\uBCF4', '\uAC00'],
    duration: ['\uB3D9\uC791 \uC2DC\uAC04', '\uC774'],
    completionRate: ['\uB3D9\uC791 \uC218\uD589\uB960', '\uC774'],
    count: ['\uC218\uD589 \uD69F\uC218', '\uAC00'],
    feedback: ['\uD53C\uB4DC\uBC31', '\uC774'],
  } satisfies Record<typeof field, [string, string]>
  const [label, particle] = labels[field]
  return `${order}\uBC88\uC9F8 ${label}${particle} \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.`
}

export function validateCreateExerciseSessionRequest(payload: CreateExerciseSessionRequest): void {
  assertValidPatientProfileId(payload.patientProfileId)

  if (!payload.exerciseType.trim()) {
    throw new Error(INVALID_EXERCISE_TYPE_MESSAGE)
  }
}

export function validateCreateExerciseSessionMotionRequest(
  motion: CreateExerciseSessionMotionRequest,
): void {
  if (!Number.isInteger(motion.exerciseMotionId) || motion.exerciseMotionId <= 0) {
    throw new Error(getMotionMessage(1, 'info'))
  }

  assertFiniteNumber(motion.durationSec, getMotionMessage(1, 'duration'))
  if (motion.durationSec < 0) {
    throw new Error(getMotionMessage(1, 'duration'))
  }

  assertCompletionRate(motion.accuracy, getMotionMessage(1, 'completionRate'))

  assertFiniteNumber(motion.completedReps, getMotionMessage(1, 'count'))
  if (motion.completedReps < 0) {
    throw new Error(getMotionMessage(1, 'count'))
  }

  if (motion.feedback !== undefined && typeof motion.feedback !== 'string') {
    throw new Error(getMotionMessage(1, 'feedback'))
  }

  if (motion.poseReplay) {
    validatePoseReplay(motion.poseReplay, 'raw')
  }

  if (motion.compactPoseReplay) {
    validatePoseReplay(motion.compactPoseReplay, 'compact')
  }
}

export async function getExerciseSessions(
  patientProfileId: number,
  client: AxiosInstance = apiClient,
): Promise<ExerciseSessionSummary[]> {
  assertValidPatientProfileId(patientProfileId)

  try {
    const response = await client.get<ApiResponse<ExerciseSessionSummary[] | null>>(
      '/exercise-sessions',
      {
        params: { patientProfileId },
        headers: { Accept: 'application/json' },
      },
    )

    const body = response.data
    if (body.errors && Object.keys(body.errors).length > 0) {
      throw new Error(body.message || EXERCISE_SESSION_ERROR_MESSAGE)
    }

    return body.data ?? []
  } catch (error) {
    throw createExerciseSessionError(error)
  }
}

export async function createExerciseSession(
  payload: CreateExerciseSessionRequest,
  client: AxiosInstance = apiClient,
): Promise<ExerciseSessionDetail> {
  validateCreateExerciseSessionRequest(payload)

  try {
    const response = await client.post<ApiResponse<ExerciseSessionDetail | null>>(
      '/exercise-sessions',
      payload,
      {
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
      },
    )

    const body = response.data
    if (body.errors && Object.keys(body.errors).length > 0) {
      throw new Error(CREATE_EXERCISE_SESSION_ERROR_MESSAGE)
    }

    if (!body.data) {
      throw new Error(INVALID_SAVE_RESPONSE_MESSAGE)
    }

    return body.data
  } catch (error) {
    throw createExerciseSessionSaveError(error)
  }
}

export async function createExerciseSessionMotion(
  sessionId: number,
  payload: CreateExerciseSessionMotionRequest,
  client: AxiosInstance = apiClient,
): Promise<ExerciseSessionMotionSaveResponse> {
  assertValidExerciseSessionId(sessionId)
  validateCreateExerciseSessionMotionRequest(payload)

  try {
    const response = await client.post<ApiResponse<ExerciseSessionMotionSaveResponse | null>>(
      `/exercise-sessions/${sessionId}/motions`,
      payload,
      {
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
      },
    )

    const body = response.data
    if (body.errors && Object.keys(body.errors).length > 0) {
      throw new Error(CREATE_EXERCISE_SESSION_ERROR_MESSAGE)
    }

    if (!body.data) {
      throw new Error(INVALID_SAVE_RESPONSE_MESSAGE)
    }

    return body.data
  } catch (error) {
    throw createExerciseSessionSaveError(error)
  }
}

export type ExerciseSessionPage = PageResponse<ExerciseSessionDetail>

export type GetMyExerciseSessionsParams = {
  page?: number
  size?: number
  sort?: string
  exerciseType?: ExerciseSessionType
  patientProfileId?: number
}

// 본인 환자 프로필의 체조 세션 목록을 백엔드 환자별 컬렉션 규칙에 맞춰 조회한다.
// 서버에는 /exercise-sessions/me가 없으므로 list + detail 조합으로 page shape을 맞춘다.
function normalizeExerciseSessionPage(page: number | undefined): number {
  return Number.isInteger(page) && page != null && page >= 0 ? page : 0
}

function normalizeExerciseSessionPageSize(size: number | undefined): number {
  return Number.isInteger(size) && size != null && size > 0 ? size : 50
}

function sortExerciseSessionSummaries(
  sessions: ExerciseSessionSummary[],
  sort = 'createdAt,desc',
): ExerciseSessionSummary[] {
  const [field, rawDirection] = sort.split(',')
  if (field !== 'createdAt') return [...sessions]

  const direction = rawDirection?.toLowerCase() === 'asc' ? 1 : -1
  return [...sessions].sort((a, b) => {
    const left = new Date(a.createdAt).getTime()
    const right = new Date(b.createdAt).getTime()
    return (left - right) * direction
  })
}

function toExerciseSessionPage(
  content: ExerciseSessionDetail[],
  totalElements: number,
  page: number,
  size: number,
): ExerciseSessionPage {
  const totalPages = totalElements === 0 ? 0 : Math.ceil(totalElements / size)

  return {
    totalElements,
    totalPages,
    pageable: {
      unpaged: false,
      pageNumber: page,
      paged: true,
      pageSize: size,
      offset: page * size,
      sort: {
        unsorted: false,
        sorted: true,
        empty: false,
      },
    },
    numberOfElements: content.length,
    first: page === 0,
    last: totalPages === 0 || page >= totalPages - 1,
    size,
    content,
    number: page,
    sort: {
      unsorted: false,
      sorted: true,
      empty: false,
    },
    empty: content.length === 0,
  }
}

async function resolveMyExerciseSessionPatientProfileId(patientProfileId?: number) {
  if (patientProfileId !== undefined) {
    assertValidPatientProfileId(patientProfileId)
    return patientProfileId
  }

  const profiles = await listPatientProfiles()
  return profiles.data[0]?.id
}

async function fetchExerciseSessionDetails(
  sessions: ExerciseSessionSummary[],
): Promise<ExerciseSessionDetail[]> {
  const details: ExerciseSessionDetail[] = []

  for (let index = 0; index < sessions.length; index += EXERCISE_SESSION_DETAIL_CONCURRENCY) {
    const chunk = sessions.slice(index, index + EXERCISE_SESSION_DETAIL_CONCURRENCY)
    details.push(...(await Promise.all(chunk.map(session => getExerciseSessionDetail(session.id)))))
  }

  return details
}

export async function getMyExerciseSessions({
  page = 0,
  size = 50,
  sort = 'createdAt,desc',
  exerciseType,
  patientProfileId,
}: GetMyExerciseSessionsParams = {}) {
  const normalizedPage = normalizeExerciseSessionPage(page)
  const normalizedSize = normalizeExerciseSessionPageSize(size)
  const resolvedPatientProfileId = await resolveMyExerciseSessionPatientProfileId(patientProfileId)

  if (!resolvedPatientProfileId) {
    return {
      code: 'OK',
      message: 'ok',
      data: toExerciseSessionPage([], 0, normalizedPage, normalizedSize),
    } satisfies ApiResponse<ExerciseSessionPage>
  }

  const sessions = await getExerciseSessions(resolvedPatientProfileId)
  const filtered = exerciseType
    ? sessions.filter(session => session.exerciseType === exerciseType)
    : sessions
  const start = normalizedPage * normalizedSize
  const selected = sortExerciseSessionSummaries(filtered, sort).slice(start, start + normalizedSize)
  const details = await fetchExerciseSessionDetails(selected)

  return {
    code: 'OK',
    message: 'ok',
    data: toExerciseSessionPage(details, filtered.length, normalizedPage, normalizedSize),
  } satisfies ApiResponse<ExerciseSessionPage>
}

export async function getExerciseSessionDetail(
  id: number,
  client: AxiosInstance = apiClient,
): Promise<ExerciseSessionDetail> {
  assertValidExerciseSessionId(id)

  try {
    const response = await client.get<ApiResponse<ExerciseSessionDetail | null>>(
      `/exercise-sessions/${id}`,
      {
        headers: { Accept: 'application/json' },
      },
    )

    const body = response.data
    if (body.errors && Object.keys(body.errors).length > 0) {
      throw new Error(EXERCISE_SESSION_DETAIL_ERROR_MESSAGE)
    }

    if (!body.data) {
      throw new Error(INVALID_DETAIL_RESPONSE_MESSAGE)
    }

    return body.data
  } catch (error) {
    if (error instanceof Error && error.message === INVALID_DETAIL_RESPONSE_MESSAGE) {
      throw error
    }
    throw new Error(EXERCISE_SESSION_DETAIL_ERROR_MESSAGE)
  }
}

export async function getExerciseMotionReplay(
  motionResultId: number,
  client: AxiosInstance = apiClient,
): Promise<ExerciseMotionReplayResponse> {
  assertValidExerciseMotionResultId(motionResultId)

  try {
    const response = await client.get<ApiResponse<ExerciseMotionReplayResponse | null>>(
      `/exercise-sessions/motions/${motionResultId}/replay`,
      {
        headers: { Accept: 'application/json' },
      },
    )

    const body = response.data
    if (body.errors && Object.keys(body.errors).length > 0) {
      throw new Error(EXERCISE_MOTION_REPLAY_ERROR_MESSAGE)
    }

    if (!body.data) {
      throw new Error(INVALID_REPLAY_RESPONSE_MESSAGE)
    }

    return body.data
  } catch (error) {
    if (error instanceof Error && error.message === INVALID_REPLAY_RESPONSE_MESSAGE) {
      throw error
    }
    throw new Error(EXERCISE_MOTION_REPLAY_ERROR_MESSAGE)
  }
}

export async function getExerciseMotionMovementAnalysis(
  motionResultId: number,
  client: AxiosInstance = apiClient,
): Promise<ExerciseMotionMovementAnalysisResponse> {
  assertValidExerciseMotionResultId(motionResultId)

  try {
    const response = await client.get<ApiResponse<ExerciseMotionMovementAnalysisResponse | null>>(
      `/exercise-sessions/motions/${motionResultId}/movement-analysis`,
      {
        headers: { Accept: 'application/json' },
      },
    )

    const body = response.data
    if (body.errors && Object.keys(body.errors).length > 0) {
      throw new Error(EXERCISE_MOTION_MOVEMENT_ANALYSIS_ERROR_MESSAGE)
    }

    if (!body.data) {
      throw new Error(INVALID_MOVEMENT_ANALYSIS_RESPONSE_MESSAGE)
    }

    return body.data
  } catch (error) {
    if (error instanceof Error && error.message === INVALID_MOVEMENT_ANALYSIS_RESPONSE_MESSAGE) {
      throw error
    }
    throw new Error(EXERCISE_MOTION_MOVEMENT_ANALYSIS_ERROR_MESSAGE)
  }
}
