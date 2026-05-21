import type { TrackedHand } from './handTracker'
import { HAND_LANDMARK_INDEX } from './pointerReference'

const INDEX_FINGER_MCP_LANDMARK = 5

export type PinchGestureResult = {
  isPinching: boolean
  thumbIndexDistance: number
  referenceDistance: number
  pinchRatio: number | null
}

// 엄지·검지 끝의 거리 vs 손목→검지MCP 거리 비율로 핀치 여부 판정.
// 카메라와의 거리·손 크기에 의존하지 않게 비율로 정규화.
export function detectPinchGesture(hand: TrackedHand, threshold = 0.35): PinchGestureResult {
  const thumb = hand.landmarks[HAND_LANDMARK_INDEX.THUMB_TIP]
  const index = hand.landmarks[HAND_LANDMARK_INDEX.INDEX_FINGER_TIP]
  const wrist = hand.landmarks[HAND_LANDMARK_INDEX.WRIST]
  const indexMcp = hand.landmarks[INDEX_FINGER_MCP_LANDMARK]

  if (!thumb || !index || !wrist || !indexMcp) {
    return {
      isPinching: false,
      thumbIndexDistance: Number.NaN,
      referenceDistance: Number.NaN,
      pinchRatio: null,
    }
  }

  const thumbIndexDistance = Math.hypot(thumb.x - index.x, thumb.y - index.y)
  const referenceDistance = Math.hypot(indexMcp.x - wrist.x, indexMcp.y - wrist.y)

  if (referenceDistance === 0) {
    return {
      isPinching: false,
      thumbIndexDistance,
      referenceDistance,
      pinchRatio: null,
    }
  }

  const pinchRatio = thumbIndexDistance / referenceDistance

  return {
    isPinching: pinchRatio < threshold,
    thumbIndexDistance,
    referenceDistance,
    pinchRatio,
  }
}
