export type PointerSmootherOptions = {
  alpha?: number // smoothing의 강도
}

export type Point2D = {
  x: number
  y: number
}

export class PointerSmoother {
  private readonly alpha: number
  private previousPoint: Point2D | null = null

  constructor(options: PointerSmootherOptions = {}) {
    this.alpha = clampAlpha(options.alpha ?? 0.35)
  }

  smooth<T extends Point2D>(point: T): T {
    if (!this.previousPoint) {
      this.previousPoint = { x: point.x, y: point.y }
      return point
    }

    const smoothedPoint = {
      ...point,
      x: interpolate(this.previousPoint.x, point.x, this.alpha),
      y: interpolate(this.previousPoint.y, point.y, this.alpha),
    }

    this.previousPoint = { x: smoothedPoint.x, y: smoothedPoint.y }

    return smoothedPoint
  }

  reset(): void {
    this.previousPoint = null
  }
}

function interpolate(previousValue: number, currentValue: number, alpha: number): number {
  return previousValue + (currentValue - previousValue) * alpha
}

function clampAlpha(alpha: number): number {
  return Math.min(Math.max(alpha, 0), 1)
}
