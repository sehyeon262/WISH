import type { NormalizedLandmark } from '@mediapipe/tasks-vision'

type AihubJointDef = {
  name: string
  index?: number
  mid?: [number, number]
}

export const AIHUB_29_JOINTS: AihubJointDef[] = [
  { name: '코', index: 0 },
  { name: '목', mid: [11, 12] },
  { name: '왼쪽 눈', index: 2 },
  { name: '오른쪽 눈', index: 5 },
  { name: '왼쪽 귀', index: 7 },
  { name: '오른쪽 귀', index: 8 },
  { name: '왼쪽 어깨', index: 11 },
  { name: '오른쪽 어깨', index: 12 },
  { name: '왼쪽 팔꿈치', index: 13 },
  { name: '오른쪽 팔꿈치', index: 14 },
  { name: '왼쪽 손목', index: 15 },
  { name: '오른쪽 손목', index: 16 },
  { name: '왼쪽 엄지 손가락', index: 21 },
  { name: '오른쪽 엄지 손가락', index: 22 },
  { name: '왼쪽 중지 손가락', index: 19 },
  { name: '오른쪽 중지 손가락', index: 20 },
  { name: '왼쪽 엉덩이', index: 23 },
  { name: '오른쪽 엉덩이', index: 24 },
  { name: '가운데 엉덩이', mid: [23, 24] },
  { name: '왼쪽 무릎', index: 25 },
  { name: '오른쪽 무릎', index: 26 },
  { name: '왼쪽 발목', index: 27 },
  { name: '오른쪽 발목', index: 28 },
  { name: '왼쪽 뒷꿈치', index: 29 },
  { name: '오른쪽 뒷꿈치', index: 30 },
  { name: '왼쪽 엄지 발가락', index: 31 },
  { name: '오른쪽 엄지 발가락', index: 32 },
  { name: '왼쪽 새끼 발가락', index: 31 },
  { name: '오른쪽 새끼 발가락', index: 32 },
]

function safeValue(value: number | undefined) {
  return Number.isFinite(value) ? (value as number) : 0
}

function landmarkPoint(landmark: NormalizedLandmark | undefined): number[] {
  if (!landmark) {
    return [0, 0, 0]
  }
  return [safeValue(landmark.x), safeValue(landmark.y), safeValue(landmark.visibility)]
}

function midpoint(
  landmarks: NormalizedLandmark[],
  leftIndex: number,
  rightIndex: number,
): number[] {
  const left = landmarks[leftIndex]
  const right = landmarks[rightIndex]
  if (!left || !right) {
    return [0, 0, 0]
  }
  const leftVisibility = safeValue(left.visibility)
  const rightVisibility = safeValue(right.visibility)
  return [
    (safeValue(left.x) + safeValue(right.x)) / 2,
    (safeValue(left.y) + safeValue(right.y)) / 2,
    Math.min(leftVisibility, rightVisibility),
  ]
}

export function mediaPipe33ToAihub29(landmarks: NormalizedLandmark[]): number[][] {
  return AIHUB_29_JOINTS.map(joint => {
    if (joint.mid) {
      return midpoint(landmarks, joint.mid[0], joint.mid[1])
    }
    return landmarkPoint(landmarks[joint.index ?? -1])
  })
}
