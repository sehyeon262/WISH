import { describe, expect, it } from 'vitest'
import { getPointerReference } from './pointerReference'
import type { TrackedHand } from './handTracker'
import type { NormalizedLandmark } from '@mediapipe/tasks-vision'

function createLandmark(value: number): NormalizedLandmark {
  return {
    x: value,
    y: value,
    z: 0,
    visibility: 1,
  }
}

function createHand(): TrackedHand {
  return {
    landmarks: Array.from({ length: 21 }, (_, index) => createLandmark(index / 100)),
    handedness: 'Right',
    score: 0.9,
  }
}

describe('getPointerReference', () => {
  it('returns the index finger tip by default', () => {
    const pointerReference = getPointerReference(createHand())

    expect(pointerReference?.landmarkIndex).toBe(8)
    expect(pointerReference?.landmark.x).toBe(0.08)
  })

  it('returns the requested landmark index when provided', () => {
    const pointerReference = getPointerReference(createHand(), 4)

    expect(pointerReference?.landmarkIndex).toBe(4)
    expect(pointerReference?.landmark.y).toBe(0.04)
  })

  it('returns null when the requested landmark does not exist', () => {
    expect(getPointerReference(createHand(), 99)).toBeNull()
  })
})
