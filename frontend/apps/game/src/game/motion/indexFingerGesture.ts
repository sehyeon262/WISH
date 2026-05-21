import type { TrackedHand } from './handTracker'
import { HAND_LANDMARK_INDEX } from './pointerReference'

export type FingerState = 'extended' | 'folded' | 'unknown'

export type IndexFingerGestureResult = {
  isIndexOnlyGesture: boolean
  indexFinger: FingerState
  middleFinger: FingerState
  ringFinger: FingerState
  pinkyFinger: FingerState
}

export function detectIndexFingerGesture(hand: TrackedHand): IndexFingerGestureResult {
  const indexFinger = getFingerState(hand, HAND_LANDMARK_INDEX.INDEX_FINGER_TIP, 6)
  const middleFinger = getFingerState(hand, HAND_LANDMARK_INDEX.MIDDLE_FINGER_TIP, 10)
  const ringFinger = getFingerState(hand, HAND_LANDMARK_INDEX.RING_FINGER_TIP, 14)
  const pinkyFinger = getFingerState(hand, HAND_LANDMARK_INDEX.PINKY_TIP, 18)

  return {
    isIndexOnlyGesture:
      indexFinger === 'extended' &&
      middleFinger === 'folded' &&
      ringFinger === 'folded' &&
      pinkyFinger === 'folded',
    indexFinger,
    middleFinger,
    ringFinger,
    pinkyFinger,
  }
}

// 손가락 하나가 펴졌는지 접혔는지 판별하는 함수
function getFingerState(hand: TrackedHand, tipIndex: number, pipIndex: number): FingerState {
  const tip = hand.landmarks[tipIndex]
  const pip = hand.landmarks[pipIndex]

  if (!tip || !pip) {
    return 'unknown'
  }

  return tip.y < pip.y ? 'extended' : 'folded'
}
