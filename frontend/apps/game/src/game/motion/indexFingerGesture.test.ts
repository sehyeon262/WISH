import { describe, expect, it } from 'vitest'
import { detectIndexFingerGesture } from './indexFingerGesture'
import type { TrackedHand } from './handTracker'
import type { NormalizedLandmark } from '@mediapipe/tasks-vision'

function createLandmark(): NormalizedLandmark {
  return {
    x: 0.5,
    y: 0.5,
    z: 0,
    visibility: 1,
  }
}

function createHand(): TrackedHand {
  const landmarks = Array.from({ length: 21 }, () => createLandmark())

  landmarks[8].y = 0.2
  landmarks[6].y = 0.4

  landmarks[12].y = 0.7
  landmarks[10].y = 0.5
  landmarks[16].y = 0.72
  landmarks[14].y = 0.52
  landmarks[20].y = 0.74
  landmarks[18].y = 0.54

  return {
    landmarks,
    handedness: 'Right',
    score: 0.9,
  }
}

describe('detectIndexFingerGesture', () => {
  it('returns true when only the index finger is extended', () => {
    const result = detectIndexFingerGesture(createHand())

    expect(result.isIndexOnlyGesture).toBe(true)
    expect(result.indexFinger).toBe('extended')
    expect(result.middleFinger).toBe('folded')
  })

  it('returns false when another finger is also extended', () => {
    const hand = createHand()
    hand.landmarks[12].y = 0.2
    hand.landmarks[10].y = 0.4

    const result = detectIndexFingerGesture(hand)

    expect(result.isIndexOnlyGesture).toBe(false)
    expect(result.middleFinger).toBe('extended')
  })

  it('returns unknown when required landmarks are missing', () => {
    const hand = createHand()
    // Cast to simulate a malformed landmark array.
    hand.landmarks = hand.landmarks.slice(0, 10) as TrackedHand['landmarks']

    const result = detectIndexFingerGesture(hand)

    expect(result.middleFinger).toBe('unknown')
    expect(result.isIndexOnlyGesture).toBe(false)
  })
})
