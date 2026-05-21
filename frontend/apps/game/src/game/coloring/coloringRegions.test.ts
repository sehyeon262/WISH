import { describe, expect, it } from 'vitest'
import {
  createColoringRegionMap,
  getColoringRegionBounds,
  type ColoringPolygonRegion,
  type ColoringRectRegion,
} from './coloringRegions'

describe('coloringRegions', () => {
  it('creates prepared regions and byId map', () => {
    const regionMap = createColoringRegionMap([
      {
        id: 'face',
        type: 'rect',
        x: 0.2,
        y: 0.1,
        width: 0.3,
        height: 0.2,
      },
    ])

    expect(regionMap.regions).toHaveLength(1)
    expect(regionMap.byId.face.id).toBe('face')
    expect(regionMap.byId.face.bounds.minX).toBeCloseTo(0.2)
    expect(regionMap.byId.face.bounds.minY).toBeCloseTo(0.1)
    expect(regionMap.byId.face.bounds.maxX).toBeCloseTo(0.5)
    expect(regionMap.byId.face.bounds.maxY).toBeCloseTo(0.3)
  })

  it('computes polygon bounds from all points', () => {
    const region: ColoringPolygonRegion = {
      id: 'ear',
      type: 'polygon',
      points: [
        { x: 0.6, y: 0.3 },
        { x: 0.8, y: 0.2 },
        { x: 0.7, y: 0.5 },
      ],
    }

    expect(getColoringRegionBounds(region)).toEqual({
      minX: 0.6,
      minY: 0.2,
      maxX: 0.8,
      maxY: 0.5,
    })
  })

  it('throws when region ids are duplicated', () => {
    const region: ColoringRectRegion = {
      id: 'duplicate',
      type: 'rect',
      x: 0.1,
      y: 0.1,
      width: 0.2,
      height: 0.2,
    }

    expect(() => createColoringRegionMap([region, region])).toThrow(
      'Duplicate coloring region id: duplicate',
    )
  })
})
