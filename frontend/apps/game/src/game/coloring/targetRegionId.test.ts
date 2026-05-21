import { describe, expect, it } from 'vitest'
import { createColoringRegionMap } from './coloringRegions'
import {
  resolveTargetRegionForPointer,
  toTargetRegionId,
  toTargetRegionResult,
} from './targetRegionId'

describe('targetRegionId', () => {
  const regionMap = createColoringRegionMap([
    {
      id: 'face',
      type: 'rect',
      x: 0.2,
      y: 0.2,
      width: 0.3,
      height: 0.3,
    },
  ])

  it('uses region id as targetRegionId', () => {
    expect(toTargetRegionId(regionMap.byId.face)).toBe('face')
  })

  it('converts detected region into FE-friendly result', () => {
    expect(toTargetRegionResult(regionMap.byId.face)).toEqual({
      targetRegionId: 'face',
      region: regionMap.byId.face,
      isDetected: true,
    })
  })

  it('returns null targetRegionId when region is missing', () => {
    expect(toTargetRegionResult(null)).toEqual({
      targetRegionId: null,
      region: null,
      isDetected: false,
    })
  })

  it('resolves target region directly from pointer coordinates', () => {
    const result = resolveTargetRegionForPointer(
      {
        normalizedCanvasX: 0.25,
        normalizedCanvasY: 0.25,
      },
      regionMap,
    )

    expect(result.targetRegionId).toBe('face')
    expect(result.isDetected).toBe(true)
  })
})
