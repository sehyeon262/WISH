import { describe, expect, it } from 'vitest'
import { TargetRegionTrackingGuard } from './targetRegionTrackingGuard'
import type { TargetRegionResult } from './targetRegionId'

function createTarget(targetRegionId: string | null): TargetRegionResult {
  return {
    targetRegionId,
    region: targetRegionId
      ? ({
          id: targetRegionId,
          type: 'rect',
          x: 0,
          y: 0,
          width: 0.2,
          height: 0.2,
          bounds: {
            minX: 0,
            minY: 0,
            maxX: 0.2,
            maxY: 0.2,
          },
        } as const)
      : null,
    isDetected: targetRegionId !== null,
  }
}

describe('TargetRegionTrackingGuard', () => {
  it('returns detected when target is present', () => {
    const guard = new TargetRegionTrackingGuard({ holdDurationMs: 120 })
    const result = guard.update(createTarget('face'), 1000)

    expect(result.status).toBe('detected')
    expect(result.target.targetRegionId).toBe('face')
    expect(result.shouldClearHover).toBe(false)
  })

  it('holds last target for a short missing duration', () => {
    const guard = new TargetRegionTrackingGuard({ holdDurationMs: 120 })

    guard.update(createTarget('face'), 1000)
    const result = guard.update(createTarget(null), 1080)

    expect(result.status).toBe('holding')
    expect(result.target.targetRegionId).toBe('face')
    expect(result.shouldClearHover).toBe(false)
  })

  it('transitions to missing when hold duration expires', () => {
    const guard = new TargetRegionTrackingGuard({ holdDurationMs: 120 })

    guard.update(createTarget('face'), 1000)
    const result = guard.update(createTarget(null), 1201)

    expect(result.status).toBe('missing')
    expect(result.target.targetRegionId).toBeNull()
    expect(result.shouldClearHover).toBe(true)
  })
})
