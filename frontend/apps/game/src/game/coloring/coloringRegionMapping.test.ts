import { describe, expect, it } from 'vitest'
import { createColoringRegionMap } from './coloringRegions'
import {
  findColoringRegionAtPoint,
  findColoringRegionForPointer,
  isPointInsidePolygon,
} from './coloringRegionMapping'

describe('coloringRegionMapping', () => {
  const regionMap = createColoringRegionMap([
    {
      id: 'face',
      type: 'rect',
      x: 0.2,
      y: 0.2,
      width: 0.3,
      height: 0.3,
    },
    {
      id: 'ear',
      type: 'polygon',
      points: [
        { x: 0.6, y: 0.2 },
        { x: 0.8, y: 0.2 },
        { x: 0.7, y: 0.5 },
      ],
    },
  ])

  it('finds a rect region from normalized point', () => {
    const region = findColoringRegionAtPoint({ x: 0.3, y: 0.3 }, regionMap)

    expect(region?.id).toBe('face')
  })

  it('finds a region from pointer canvas coordinates', () => {
    const region = findColoringRegionForPointer(
      {
        normalizedCanvasX: 0.72,
        normalizedCanvasY: 0.3,
      },
      regionMap,
    )

    expect(region?.id).toBe('ear')
  })

  it('returns null when point is outside every region', () => {
    expect(findColoringRegionAtPoint({ x: 0.95, y: 0.95 }, regionMap)).toBeNull()
  })

  it('detects whether point is inside polygon', () => {
    const polygon = [
      { x: 0.6, y: 0.2 },
      { x: 0.8, y: 0.2 },
      { x: 0.7, y: 0.5 },
    ]

    expect(isPointInsidePolygon({ x: 0.7, y: 0.3 }, polygon)).toBe(true)
    expect(isPointInsidePolygon({ x: 0.85, y: 0.3 }, polygon)).toBe(false)
  })
})
