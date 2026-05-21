import type { PointerCanvasCoordinates } from '../motion/pointerCanvasCoordinates'
import type { ColoringRegionMap, PreparedColoringRegion } from './coloringRegions'
import { findColoringRegionForPointer } from './coloringRegionMapping'

export type TargetRegionId = string

export type TargetRegionResult = {
  targetRegionId: TargetRegionId | null
  region: PreparedColoringRegion | null
  isDetected: boolean
}

export function toTargetRegionId(region: Pick<PreparedColoringRegion, 'id'>): TargetRegionId {
  return region.id
}

export function toTargetRegionResult(region: PreparedColoringRegion | null): TargetRegionResult {
  return {
    targetRegionId: region ? toTargetRegionId(region) : null,
    region,
    isDetected: region !== null,
  }
}

export function resolveTargetRegionForPointer(
  pointerCanvasCoordinates: Pick<
    PointerCanvasCoordinates,
    'normalizedCanvasX' | 'normalizedCanvasY'
  >,
  coloringRegionMap: ColoringRegionMap,
): TargetRegionResult {
  return toTargetRegionResult(
    findColoringRegionForPointer(pointerCanvasCoordinates, coloringRegionMap),
  )
}
