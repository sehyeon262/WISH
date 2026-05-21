import type { PointerCanvasCoordinates } from '../motion/pointerCanvasCoordinates'
import type {
  ColoringRegionBounds,
  ColoringRegionMap,
  NormalizedRegionPoint,
  PreparedColoringRegion,
} from './coloringRegions'

export type ColoringRegionPointer = NormalizedRegionPoint

export function findColoringRegionForPointer(
  pointerCanvasCoordinates: Pick<
    PointerCanvasCoordinates,
    'normalizedCanvasX' | 'normalizedCanvasY'
  >,
  coloringRegionMap: ColoringRegionMap,
): PreparedColoringRegion | null {
  return findColoringRegionAtPoint(
    {
      x: pointerCanvasCoordinates.normalizedCanvasX,
      y: pointerCanvasCoordinates.normalizedCanvasY,
    },
    coloringRegionMap,
  )
}

export function findColoringRegionAtPoint(
  point: ColoringRegionPointer,
  coloringRegionMap: ColoringRegionMap,
): PreparedColoringRegion | null {
  const normalizedPoint = normalizePoint(point)

  return (
    coloringRegionMap.regions.find(region => isPointInsideRegion(normalizedPoint, region)) ?? null
  )
}

export function isPointInsideRegion(
  point: ColoringRegionPointer,
  region: PreparedColoringRegion,
): boolean {
  const normalizedPoint = normalizePoint(point)

  if (!isPointInsideBounds(normalizedPoint, region.bounds)) {
    return false
  }

  if (region.type === 'rect') {
    return true
  }

  return isPointInsidePolygon(normalizedPoint, region.points)
}

export function isPointInsideBounds(
  point: ColoringRegionPointer,
  bounds: ColoringRegionBounds,
): boolean {
  return (
    point.x >= bounds.minX &&
    point.x <= bounds.maxX &&
    point.y >= bounds.minY &&
    point.y <= bounds.maxY
  )
}

export function isPointInsidePolygon(
  point: ColoringRegionPointer,
  polygon: NormalizedRegionPoint[],
): boolean {
  if (polygon.length < 3) {
    return false
  }

  let isInside = false

  for (
    let currentIndex = 0, previousIndex = polygon.length - 1;
    currentIndex < polygon.length;
    previousIndex = currentIndex++
  ) {
    const currentPoint = polygon[currentIndex]
    const previousPoint = polygon[previousIndex]

    const isIntersecting =
      currentPoint.y > point.y !== previousPoint.y > point.y &&
      point.x <
        ((previousPoint.x - currentPoint.x) * (point.y - currentPoint.y)) /
          (previousPoint.y - currentPoint.y) +
          currentPoint.x

    if (isIntersecting) {
      isInside = !isInside
    }
  }

  return isInside
}

function normalizePoint(point: ColoringRegionPointer): ColoringRegionPointer {
  return {
    x: clampNormalizedValue(point.x),
    y: clampNormalizedValue(point.y),
  }
}

function clampNormalizedValue(value: number): number {
  return Math.min(Math.max(value, 0), 1)
}
