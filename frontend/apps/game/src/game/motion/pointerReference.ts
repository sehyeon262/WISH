import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import type { TrackedHand } from './handTracker'

export const HAND_LANDMARK_INDEX = {
  WRIST: 0,
  THUMB_TIP: 4,
  INDEX_FINGER_TIP: 8,
  MIDDLE_FINGER_TIP: 12,
  RING_FINGER_TIP: 16,
  PINKY_TIP: 20,
} as const

export const DEFAULT_POINTER_LANDMARK_INDEX = HAND_LANDMARK_INDEX.INDEX_FINGER_TIP

export type PointerReference = {
  landmark: NormalizedLandmark
  landmarkIndex: number
  handedness?: string
  score?: number
}

export function getPointerReference(
  hand: TrackedHand,
  landmarkIndex: number = DEFAULT_POINTER_LANDMARK_INDEX,
): PointerReference | null {
  const landmark = hand.landmarks[landmarkIndex]

  if (!landmark) {
    return null
  }

  return {
    landmark,
    landmarkIndex,
    handedness: hand.handedness,
    score: hand.score,
  }
}
