import { describe, expect, it } from 'vitest'
import { toPointerCanvasCoordinates } from './pointerCanvasCoordinates'
import type { PointerCoordinates } from './pointerCoordinates'

const pointerCoordinates: PointerCoordinates = {
  x: 500,
  y: 300,
  normalizedX: 0.5,
  normalizedY: 0.5,
  landmarkIndex: 8,
  handedness: 'Right',
  score: 0.9,
}

describe('toPointerCanvasCoordinates', () => {
  it('maps screen coordinates into canvas-local coordinates', () => {
    const result = toPointerCanvasCoordinates(pointerCoordinates, {
      left: 100,
      top: 50,
      width: 800,
      height: 400,
    })

    expect(result.canvasX).toBe(400)
    expect(result.canvasY).toBe(250)
    expect(result.normalizedCanvasX).toBe(0.5)
    expect(result.normalizedCanvasY).toBe(0.625)
  })

  it('computes world coordinates when camera bounds are provided', () => {
    const result = toPointerCanvasCoordinates(
      pointerCoordinates,
      {
        left: 100,
        top: 50,
        width: 800,
        height: 400,
      },
      {
        x: 1000,
        y: 200,
        width: 800,
        height: 400,
      },
    )

    expect(result.worldX).toBe(1400)
    expect(result.worldY).toBe(450)
  })

  it('clamps coordinates into the canvas by default', () => {
    const result = toPointerCanvasCoordinates(
      {
        ...pointerCoordinates,
        x: 50,
        y: 25,
      },
      {
        left: 100,
        top: 50,
        width: 800,
        height: 400,
      },
    )

    expect(result.normalizedCanvasX).toBe(0)
    expect(result.normalizedCanvasY).toBe(0)
    expect(result.canvasX).toBe(0)
    expect(result.canvasY).toBe(0)
  })
})
