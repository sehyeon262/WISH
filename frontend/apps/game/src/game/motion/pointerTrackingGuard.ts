export type PointerTrackingGuardOptions = {
  holdDurationMs?: number
}

export type PointerTrackingStatus = 'tracked' | 'holding' | 'missing'

export type PointerTrackingResult<T> = {
  point: T | null
  status: PointerTrackingStatus
  shouldResetSmoother: boolean
  lastDetectedTimestampMs: number | null
}

export class PointerTrackingGuard<T> {
  private readonly holdDurationMs: number
  private lastDetectedPoint: T | null = null
  private lastDetectedTimestampMs: number | null = null
  private lastStatus: PointerTrackingStatus = 'missing'

  constructor(options: PointerTrackingGuardOptions = {}) {
    this.holdDurationMs = Math.max(options.holdDurationMs ?? 120, 0)
  }

  update(point: T | null, timestampMs: number): PointerTrackingResult<T> {
    // 1. 손이 정상 검출된 경우
    if (point) {
      this.lastDetectedPoint = point
      this.lastDetectedTimestampMs = timestampMs
      this.lastStatus = 'tracked'

      return {
        point,
        status: 'tracked',
        shouldResetSmoother: false,
        lastDetectedTimestampMs: this.lastDetectedTimestampMs,
      }
    }

    // 2. 손이 안 잡혔지만 아직 hold 시간 안인 경우
    if (
      this.lastDetectedPoint &&
      this.lastDetectedTimestampMs !== null &&
      timestampMs - this.lastDetectedTimestampMs <= this.holdDurationMs
    ) {
      this.lastStatus = 'holding'

      return {
        point: this.lastDetectedPoint,
        status: 'holding',
        shouldResetSmoother: false,
        lastDetectedTimestampMs: this.lastDetectedTimestampMs,
      }
    }

    // 3. 손이 너무 오래 안 잡힌 경우
    const shouldResetSmoother = this.lastStatus !== 'missing'

    this.lastDetectedPoint = null
    this.lastDetectedTimestampMs = null
    this.lastStatus = 'missing'

    return {
      point: null,
      status: 'missing',
      shouldResetSmoother,
      lastDetectedTimestampMs: null,
    }
  }

  reset(): void {
    this.lastDetectedPoint = null
    this.lastDetectedTimestampMs = null
    this.lastStatus = 'missing'
  }
}
