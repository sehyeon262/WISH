import type { PointerReference } from './pointerReference'

export type PointerViewport = {
  width: number
  height: number
}

export type PointerCoordinateOptions = {
  mirrorX?: boolean
  mirrorY?: boolean
  clamp?: boolean
}

export type PointerCoordinates = {
  x: number
  y: number
  normalizedX: number
  normalizedY: number
  landmarkIndex: number
  handedness?: string
  score?: number
}

const DEFAULT_POINTER_COORDINATE_OPTIONS: Required<PointerCoordinateOptions> = {
  mirrorX: false,
  mirrorY: false,
  clamp: true,
}

export function toPointerCoordinates(
  pointerReference: PointerReference,
  viewport: PointerViewport,
  options: PointerCoordinateOptions = {},
): PointerCoordinates {
  const resolvedOptions = {
    ...DEFAULT_POINTER_COORDINATE_OPTIONS,
    ...options,
  }

  const normalizedX = transformAxis(
    pointerReference.landmark.x,
    resolvedOptions.mirrorX,
    resolvedOptions.clamp,
  )
  const normalizedY = transformAxis(
    pointerReference.landmark.y,
    resolvedOptions.mirrorY,
    resolvedOptions.clamp,
  )

  return {
    x: normalizedX * viewport.width,
    y: normalizedY * viewport.height,
    normalizedX,
    normalizedY,
    landmarkIndex: pointerReference.landmarkIndex,
    handedness: pointerReference.handedness,
    score: pointerReference.score,
  }
}

function transformAxis(value: number, mirror: boolean, clamp: boolean): number {
  const transformedValue = mirror ? 1 - value : value

  if (!clamp) {
    return transformedValue
  }

  return Math.min(Math.max(transformedValue, 0), 1)
}
