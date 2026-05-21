import { describe, expect, it } from 'vitest'
import { PointerSmoother } from './pointerSmoother'

describe('PointerSmoother', () => {
  it('returns the first point unchanged', () => {
    const smoother = new PointerSmoother({ alpha: 0.35 })
    const point = smoother.smooth({ x: 100, y: 200 })

    expect(point).toEqual({ x: 100, y: 200 })
  })

  it('smooths subsequent points using alpha interpolation', () => {
    const smoother = new PointerSmoother({ alpha: 0.35 })

    smoother.smooth({ x: 100, y: 200 })
    const point = smoother.smooth({ x: 200, y: 100 })

    expect(point.x).toBeCloseTo(135)
    expect(point.y).toBeCloseTo(165)
  })

  it('resets internal state when reset is called', () => {
    const smoother = new PointerSmoother({ alpha: 0.35 })

    smoother.smooth({ x: 100, y: 100 })
    smoother.smooth({ x: 200, y: 200 })
    smoother.reset()

    expect(smoother.smooth({ x: 10, y: 20 })).toEqual({ x: 10, y: 20 })
  })
})
