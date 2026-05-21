import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import { describe, expect, it } from 'vitest'
import type { TrackedHand } from './handTracker'
import { detectPinchGesture } from './pinchGesture'

function createLandmark(x = 0.5, y = 0.5): NormalizedLandmark {
  return { x, y, z: 0, visibility: 1 }
}

function createHand(thumbTip: NormalizedLandmark, indexTip: NormalizedLandmark): TrackedHand {
  const landmarks = Array.from({ length: 21 }, () => createLandmark())
  // wrist (0) ↔ index_mcp (5) reference span ≈ 0.20
  landmarks[0] = createLandmark(0.5, 0.9)
  landmarks[5] = createLandmark(0.5, 0.7)
  landmarks[4] = thumbTip
  landmarks[8] = indexTip
  return { landmarks, handedness: 'Right', score: 0.9 }
}

describe('detectPinchGesture', () => {
  it('detects pinch when thumb and index tips overlap', () => {
    const hand = createHand(createLandmark(0.5, 0.5), createLandmark(0.51, 0.5))
    const result = detectPinchGesture(hand)
    expect(result.isPinching).toBe(true)
    expect(result.pinchRatio).not.toBeNull()
    expect(result.pinchRatio!).toBeLessThan(0.35)
  })

  it('does not detect pinch when fingers are open', () => {
    const hand = createHand(createLandmark(0.4, 0.5), createLandmark(0.6, 0.3))
    const result = detectPinchGesture(hand)
    expect(result.isPinching).toBe(false)
    expect(result.pinchRatio!).toBeGreaterThanOrEqual(0.35)
  })

  it('respects a custom threshold', () => {
    // pinchRatio ≈ 0.5 (distance 0.10 / reference 0.20)
    const hand = createHand(createLandmark(0.45, 0.5), createLandmark(0.55, 0.5))
    expect(detectPinchGesture(hand, 0.4).isPinching).toBe(false)
    expect(detectPinchGesture(hand, 0.6).isPinching).toBe(true)
  })

  it('returns null ratio when reference landmarks are missing', () => {
    const hand = createHand(createLandmark(0.5, 0.5), createLandmark(0.5, 0.5))
    hand.landmarks = hand.landmarks.slice(0, 4) as TrackedHand['landmarks']
    const result = detectPinchGesture(hand)
    expect(result.isPinching).toBe(false)
    expect(result.pinchRatio).toBeNull()
  })
})
