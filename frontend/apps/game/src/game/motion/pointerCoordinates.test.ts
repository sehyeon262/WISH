import { describe, expect, it } from 'vitest'
import { toPointerCoordinates } from './pointerCoordinates'
import type { PointerReference } from './pointerReference'
import type { NormalizedLandmark } from '@mediapipe/tasks-vision'

function createLandmark(x: number, y: number): NormalizedLandmark {
  return {
    x,
    y,
    z: 0,
    visibility: 1,
  }
}

const pointerReference: PointerReference = {
  landmark: createLandmark(0.25, 0.5),
  landmarkIndex: 8,
  handedness: 'Right',
  score: 0.9,
}

describe('toPointerCoordinates', () => {
  it('converts normalized coordinates into viewport pixels', () => {
    const coordinates = toPointerCoordinates(pointerReference, { width: 1000, height: 800 })

    expect(coordinates.x).toBe(250)
    expect(coordinates.y).toBe(400)
    expect(coordinates.normalizedX).toBe(0.25)
    expect(coordinates.normalizedY).toBe(0.5)
  })

  it('applies mirroring when requested', () => {
    const coordinates = toPointerCoordinates(
      pointerReference,
      { width: 1000, height: 800 },
      { mirrorX: true },
    )

    expect(coordinates.normalizedX).toBe(0.75)
    expect(coordinates.x).toBe(750)
  })

  it('clamps coordinates into the viewport range by default', () => {
    const coordinates = toPointerCoordinates(
      {
        ...pointerReference,
        landmark: createLandmark(1.2, -0.2),
      },
      { width: 1000, height: 800 },
    )

    expect(coordinates.normalizedX).toBe(1)
    expect(coordinates.normalizedY).toBe(0)
    expect(coordinates.x).toBe(1000)
    expect(coordinates.y).toBe(0)
  })
})
