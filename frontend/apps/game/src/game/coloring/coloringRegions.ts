export type NormalizedRegionPoint = {
  x: number
  y: number
}

export type ColoringRegionBounds = {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

type ColoringRegionBase = {
  id: string
  name?: string
}

export type ColoringRectRegion = ColoringRegionBase & {
  type: 'rect'
  x: number
  y: number
  width: number
  height: number
}

export type ColoringPolygonRegion = ColoringRegionBase & {
  type: 'polygon'
  points: NormalizedRegionPoint[]
}

export type ColoringRegion = ColoringRectRegion | ColoringPolygonRegion

export type PreparedColoringRegion = ColoringRegion & {
  bounds: ColoringRegionBounds
}

export type ColoringRegionMap = {
  regions: PreparedColoringRegion[]
  byId: Record<string, PreparedColoringRegion>
}

export function createColoringRegionMap(regions: ColoringRegion[]): ColoringRegionMap {
  const preparedRegions = regions.map(prepareColoringRegion)
  const byId: Record<string, PreparedColoringRegion> = {}

  preparedRegions.forEach(region => {
    if (byId[region.id]) {
      throw new Error(`Duplicate coloring region id: ${region.id}`)
    }

    byId[region.id] = region
  })

  return {
    regions: preparedRegions,
    byId,
  }
}

export function prepareColoringRegion(region: ColoringRegion): PreparedColoringRegion {
  return {
    ...region,
    bounds: getColoringRegionBounds(region),
  }
}

export function getColoringRegionBounds(region: ColoringRegion): ColoringRegionBounds {
  if (region.type === 'rect') {
    const minX = clampNormalizedValue(region.x)
    const minY = clampNormalizedValue(region.y)
    const maxX = clampNormalizedValue(region.x + region.width)
    const maxY = clampNormalizedValue(region.y + region.height)

    return { minX, minY, maxX, maxY }
  }

  if (region.points.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 }
  }

  const normalizedPoints = region.points.map(point => ({
    x: clampNormalizedValue(point.x),
    y: clampNormalizedValue(point.y),
  }))

  return {
    minX: Math.min(...normalizedPoints.map(point => point.x)),
    minY: Math.min(...normalizedPoints.map(point => point.y)),
    maxX: Math.max(...normalizedPoints.map(point => point.x)),
    maxY: Math.max(...normalizedPoints.map(point => point.y)),
  }
}

function clampNormalizedValue(value: number): number {
  return Math.min(Math.max(value, 0), 1)
}
