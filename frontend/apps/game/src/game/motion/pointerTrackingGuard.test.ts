import { describe, expect, it } from 'vitest'
import { PointerTrackingGuard } from './pointerTrackingGuard'

describe('PointerTrackingGuard', () => {
  it('returns tracked when a point is detected', () => {
    const guard = new PointerTrackingGuard<{ x: number; y: number }>({ holdDurationMs: 120 })
    const result = guard.update({ x: 10, y: 20 }, 1000)

    expect(result.status).toBe('tracked')
    expect(result.point).toEqual({ x: 10, y: 20 })
    expect(result.shouldResetSmoother).toBe(false)
  })

  it('holds the last detected point during short detection gaps', () => {
    const guard = new PointerTrackingGuard<{ x: number; y: number }>({ holdDurationMs: 120 })

    guard.update({ x: 10, y: 20 }, 1000)
    const result = guard.update(null, 1080)

    expect(result.status).toBe('holding')
    expect(result.point).toEqual({ x: 10, y: 20 })
    expect(result.shouldResetSmoother).toBe(false)
  })

  it('marks the pointer as missing when the hold duration is exceeded', () => {
    const guard = new PointerTrackingGuard<{ x: number; y: number }>({ holdDurationMs: 120 })

    guard.update({ x: 10, y: 20 }, 1000)
    const result = guard.update(null, 1201)

    expect(result.status).toBe('missing')
    expect(result.point).toBeNull()
    expect(result.shouldResetSmoother).toBe(true)
  })

  it('clears internal state when reset is called', () => {
    const guard = new PointerTrackingGuard<{ x: number; y: number }>({ holdDurationMs: 120 })

    guard.update({ x: 10, y: 20 }, 1000)
    guard.reset()
    const result = guard.update(null, 1050)

    expect(result.status).toBe('missing')
    expect(result.shouldResetSmoother).toBe(false)
  })
})
