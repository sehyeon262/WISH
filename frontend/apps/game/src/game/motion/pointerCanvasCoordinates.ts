import type { PointerCoordinates } from './pointerCoordinates'

export type CanvasBounds = {
  left: number
  top: number
  width: number
  height: number
}

export type CameraWorldView = {
  x: number
  y: number
  width: number
  height: number
}

export type PointerCanvasCoordinateOptions = {
  clampToCanvas?: boolean
}

export type PointerCanvasCoordinates = {
  screenX: number
  screenY: number
  canvasX: number
  canvasY: number
  normalizedCanvasX: number
  normalizedCanvasY: number
  worldX?: number
  worldY?: number
  landmarkIndex: number
  handedness?: string
  score?: number
}

const DEFAULT_POINTER_CANVAS_OPTIONS: Required<PointerCanvasCoordinateOptions> = {
  clampToCanvas: true,
}

export function toPointerCanvasCoordinates(
  pointerCoordinates: PointerCoordinates,
  canvasBounds: CanvasBounds,
  cameraWorldView?: CameraWorldView,
  options: PointerCanvasCoordinateOptions = {},
): PointerCanvasCoordinates {
  const resolvedOptions = {
    ...DEFAULT_POINTER_CANVAS_OPTIONS,
    ...options,
  }

  const normalizedCanvasX = normalizeCanvasAxis(
    pointerCoordinates.x - canvasBounds.left,
    canvasBounds.width,
    resolvedOptions.clampToCanvas,
  )
  const normalizedCanvasY = normalizeCanvasAxis(
    pointerCoordinates.y - canvasBounds.top,
    canvasBounds.height,
    resolvedOptions.clampToCanvas,
  )

  const canvasX = normalizedCanvasX * canvasBounds.width
  const canvasY = normalizedCanvasY * canvasBounds.height

  return {
    screenX: pointerCoordinates.x,
    screenY: pointerCoordinates.y,
    canvasX,
    canvasY,
    normalizedCanvasX,
    normalizedCanvasY,
    worldX:
      cameraWorldView?.x !== undefined
        ? cameraWorldView.x + normalizedCanvasX * cameraWorldView.width
        : undefined,
    worldY:
      cameraWorldView?.y !== undefined
        ? cameraWorldView.y + normalizedCanvasY * cameraWorldView.height
        : undefined,
    landmarkIndex: pointerCoordinates.landmarkIndex,
    handedness: pointerCoordinates.handedness,
    score: pointerCoordinates.score,
  }
}

function normalizeCanvasAxis(value: number, size: number, clampToCanvas: boolean): number {
  if (size <= 0) {
    return 0
  }

  const normalizedValue = value / size

  if (!clampToCanvas) {
    return normalizedValue
  }

  return Math.min(Math.max(normalizedValue, 0), 1)
}
