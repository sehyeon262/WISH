import { describe, expect, it, vi } from 'vitest'
import {
  CREATE_EXERCISE_SESSION_ERROR_MESSAGE,
  createExerciseSession,
  createExerciseSessionMotion,
  EXERCISE_SESSION_DETAIL_ERROR_MESSAGE,
  EXERCISE_SESSION_ERROR_MESSAGE,
  getExerciseSessionDetail,
  getExerciseSessions,
  validateCreateExerciseSessionMotionRequest,
  validateCreateExerciseSessionRequest,
  type CreateExerciseSessionMotionRequest,
  type CreateExerciseSessionRequest,
  type ExerciseSessionDetail,
  type ExerciseMotionReplayClip,
  type ExerciseSessionMotionResult,
  type ExerciseSessionMotionSaveResponse,
  type ExerciseSessionSummary,
} from '@wish/api-client'

const session: ExerciseSessionSummary = {
  id: 1,
  patientProfileId: 1,
  exerciseType: 'TOP',
  durationSec: 200,
  averageAccuracy: 0.82,
  completedMotionCount: 12,
  createdAt: '2026-05-06T01:36:20.863Z',
}

const createPayload: CreateExerciseSessionRequest = {
  patientProfileId: 1,
  exerciseType: 'TOP',
}

const motionPayload: CreateExerciseSessionMotionRequest = {
  exerciseMotionId: 1,
  durationSec: 12,
  accuracy: 0.91,
  completedReps: 8,
  feedback: '무릎을 조금 더 올려요',
}

const emptySession: ExerciseSessionDetail = {
  id: 10,
  patientProfileId: 1,
  exerciseType: 'TOP',
  durationSec: 0,
  averageAccuracy: 0,
  completedMotionCount: 0,
  createdAt: '2026-05-06T01:58:09.949Z',
  motions: [],
}

const savedMotion: ExerciseSessionMotionResult = {
  id: 100,
  exerciseMotionId: 1,
  motionName: '제자리 걷기',
  routineOrder: 1,
  durationSec: 12,
  accuracy: 0.91,
  completedReps: 8,
  feedback: '무릎을 조금 더 올려요',
  createdAt: '2026-05-06T01:58:09.949Z',
}

const motionSaveResponse: ExerciseSessionMotionSaveResponse = {
  sessionId: 10,
  sessionDurationSec: 12,
  sessionAverageAccuracy: 0.91,
  sessionCompletedMotionCount: 1,
  savedMotion,
}

const replayLandmarks = [
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

function replayClip(fps: number): ExerciseMotionReplayClip {
  return {
    version: 1,
    fps,
    durationMs: 200,
    landmarks: replayLandmarks,
    frames: [
      {
        t: 0,
        lm: replayLandmarks.map(() => [0.1, 0.9, 0, 0.92] as const),
      },
      {
        t: 200,
        lm: replayLandmarks.map(() => [0.2, 0.9, 0, 0.92] as const),
      },
    ],
    representativeSegment: {
      startMs: 0,
      endMs: 200,
      reason: 'test segment',
    },
    markers: [
      {
        startMs: 0,
        endMs: 200,
        reason: 'test marker',
      },
    ],
  }
}

function createListClient(data: ExerciseSessionSummary[] | null = [session]) {
  return {
    get: vi.fn().mockResolvedValue({
      data: {
        code: 'OK',
        message: 'ok',
        data,
      },
    }),
  }
}

function createDetailClient(data: ExerciseSessionDetail | null = emptySession) {
  return {
    get: vi.fn().mockResolvedValue({
      data: {
        code: 'OK',
        message: 'ok',
        data,
      },
    }),
  }
}

describe('getExerciseSessions', () => {
  it('requests exercise sessions with patientProfileId and Accept header', async () => {
    const client = createListClient()

    await expect(getExerciseSessions(1, client as never)).resolves.toEqual([session])

    expect(client.get).toHaveBeenCalledWith('/exercise-sessions', {
      params: { patientProfileId: 1 },
      headers: { Accept: 'application/json' },
    })
  })

  it('returns an empty array when response data is null', async () => {
    const client = createListClient(null)

    await expect(getExerciseSessions(1, client as never)).resolves.toEqual([])
  })

  it('does not request when patientProfileId is invalid', async () => {
    const client = createListClient()

    await expect(getExerciseSessions(0, client as never)).rejects.toThrow(/patientProfileId/)
    expect(client.get).not.toHaveBeenCalled()
  })

  it('returns a user-friendly error when the API reports errors', async () => {
    const client = {
      get: vi.fn().mockResolvedValue({
        data: {
          code: 'ERROR',
          message: '',
          data: null,
          errors: { patientProfileId: 'invalid' },
        },
      }),
    }

    await expect(getExerciseSessions(1, client as never)).rejects.toThrow(
      EXERCISE_SESSION_ERROR_MESSAGE,
    )
  })
})

describe('getExerciseSessionDetail', () => {
  it('requests exercise session detail with id and Accept header', async () => {
    const client = createDetailClient()

    await expect(getExerciseSessionDetail(1, client as never)).resolves.toEqual(emptySession)

    expect(client.get).toHaveBeenCalledWith('/exercise-sessions/1', {
      headers: { Accept: 'application/json' },
    })
  })

  it('does not request when id is invalid', async () => {
    const client = createDetailClient()

    await expect(getExerciseSessionDetail(0, client as never)).rejects.toThrow(/ID/)
    expect(client.get).not.toHaveBeenCalled()
  })

  it('returns a user-friendly error when detail API reports errors', async () => {
    const client = {
      get: vi.fn().mockResolvedValue({
        data: {
          code: 'ERROR',
          message: '',
          data: null,
          errors: { id: 'invalid' },
        },
      }),
    }

    await expect(getExerciseSessionDetail(1, client as never)).rejects.toThrow(
      EXERCISE_SESSION_DETAIL_ERROR_MESSAGE,
    )
  })
})

describe('createExerciseSession', () => {
  it('posts an empty exercise session and returns the created shell', async () => {
    const client = {
      post: vi.fn().mockResolvedValue({
        data: {
          code: 'OK',
          message: 'ok',
          data: emptySession,
        },
      }),
    }

    await expect(createExerciseSession(createPayload, client as never)).resolves.toEqual(
      emptySession,
    )

    expect(client.post).toHaveBeenCalledWith('/exercise-sessions', createPayload, {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    })
  })

  it('rejects an invalid patientProfileId', async () => {
    const client = { post: vi.fn() }

    await expect(
      createExerciseSession({ ...createPayload, patientProfileId: 0 }, client as never),
    ).rejects.toThrow(/patientProfileId/)
    expect(client.post).not.toHaveBeenCalled()
  })

  it('returns a user-friendly error when the API reports errors', async () => {
    const client = {
      post: vi.fn().mockResolvedValue({
        data: {
          code: 'ERROR',
          message: '',
          data: null,
          errors: { patientProfileId: 'invalid' },
        },
      }),
    }

    await expect(createExerciseSession(createPayload, client as never)).rejects.toThrow(
      CREATE_EXERCISE_SESSION_ERROR_MESSAGE,
    )
  })
})

describe('createExerciseSessionMotion', () => {
  it('posts a motion to the session-scoped endpoint', async () => {
    const client = {
      post: vi.fn().mockResolvedValue({
        data: {
          code: 'OK',
          message: 'ok',
          data: motionSaveResponse,
        },
      }),
    }

    await expect(createExerciseSessionMotion(10, motionPayload, client as never)).resolves.toEqual(
      motionSaveResponse,
    )

    expect(client.post).toHaveBeenCalledWith('/exercise-sessions/10/motions', motionPayload, {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    })
  })

  it('rejects an invalid session id', async () => {
    const client = { post: vi.fn() }

    await expect(createExerciseSessionMotion(0, motionPayload, client as never)).rejects.toThrow(
      /ID/,
    )
    expect(client.post).not.toHaveBeenCalled()
  })

  it('rejects an invalid motion payload', async () => {
    const client = { post: vi.fn() }

    await expect(
      createExerciseSessionMotion(10, { ...motionPayload, accuracy: 1.2 }, client as never),
    ).rejects.toThrow(/수행률/)
    expect(client.post).not.toHaveBeenCalled()
  })
})

describe('validateCreateExerciseSessionRequest', () => {
  it('accepts a valid payload', () => {
    expect(() => validateCreateExerciseSessionRequest(createPayload)).not.toThrow()
  })

  it('rejects invalid patientProfileId or exerciseType', () => {
    expect(() =>
      validateCreateExerciseSessionRequest({ ...createPayload, patientProfileId: 0 }),
    ).toThrow(/patientProfileId/)
    expect(() =>
      validateCreateExerciseSessionRequest({ ...createPayload, exerciseType: '' }),
    ).toThrow('운동 종류가 올바르지 않습니다.')
  })
})

describe('validateCreateExerciseSessionMotionRequest', () => {
  it('accepts a valid motion payload', () => {
    expect(() => validateCreateExerciseSessionMotionRequest(motionPayload)).not.toThrow()
  })

  it('accepts v1 replay payloads', () => {
    expect(() =>
      validateCreateExerciseSessionMotionRequest({
        ...motionPayload,
        poseReplay: replayClip(30),
        compactPoseReplay: replayClip(5),
      }),
    ).not.toThrow()
  })

  it('rejects an invalid motion id or out-of-range accuracy', () => {
    expect(() =>
      validateCreateExerciseSessionMotionRequest({ ...motionPayload, exerciseMotionId: 0 }),
    ).toThrow(/동작 정보/)
    expect(() =>
      validateCreateExerciseSessionMotionRequest({ ...motionPayload, accuracy: Number.NaN }),
    ).toThrow(/수행률/)
    expect(() =>
      validateCreateExerciseSessionMotionRequest({ ...motionPayload, completedReps: -1 }),
    ).toThrow(/횟수/)
  })
})
