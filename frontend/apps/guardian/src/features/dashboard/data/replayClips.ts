import type { ExerciseMotionReplayClip, MotionReplayLandmarkTuple } from '@wish/api-client'
import { LANDMARK_NAMES, type Landmark, type LandmarkName, type MotionClip } from './motionClips'

const LANDMARK_NAME_SET = new Set<string>(LANDMARK_NAMES)
const MISSING_LANDMARK: Landmark = [null, null, null, 0]
const REQUIRED_LANDMARK_NAMES = [
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
] as const satisfies readonly LandmarkName[]

function isLandmarkName(name: string): name is LandmarkName {
  return LANDMARK_NAME_SET.has(name)
}

function toLandmark(tuple: MotionReplayLandmarkTuple | undefined): Landmark {
  if (!tuple || tuple.length !== 4) return MISSING_LANDMARK
  const [x, y, z, confidence] = tuple
  return [
    typeof x === 'number' && Number.isFinite(x) ? x : null,
    typeof y === 'number' && Number.isFinite(y) ? y : null,
    typeof z === 'number' && Number.isFinite(z) ? z : null,
    Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0,
  ]
}

export function toRecordedMotionClip(
  replay: ExerciseMotionReplayClip | null | undefined,
  id: string,
  name: string,
  source: 'recorded' | 'compact' = 'recorded',
): MotionClip | null {
  if (!replay || replay.fps < 5 || replay.fps > 30 || !Array.isArray(replay.frames)) return null
  if (!replay.landmarks.every(isLandmarkName)) return null
  if (REQUIRED_LANDMARK_NAMES.some(landmarkName => !replay.landmarks.includes(landmarkName))) {
    return null
  }

  const landmarkIndexes = LANDMARK_NAMES.map(landmarkName => replay.landmarks.indexOf(landmarkName))

  const frames = replay.frames
    .filter(
      frame =>
        Number.isFinite(frame.t) &&
        Array.isArray(frame.lm) &&
        frame.lm.length === replay.landmarks.length,
    )
    .map(frame => ({
      t: Math.max(0, Math.round(frame.t)),
      lm: landmarkIndexes.map(index => toLandmark(index < 0 ? undefined : frame.lm[index])),
    }))

  if (frames.length === 0) return null

  return {
    id,
    name,
    fps: replay.fps,
    durationMs: Math.max(0, replay.durationMs),
    landmarks: LANDMARK_NAMES,
    frames,
    source,
    representativeSegment: replay.representativeSegment ?? null,
    markers: replay.markers ?? null,
  }
}
