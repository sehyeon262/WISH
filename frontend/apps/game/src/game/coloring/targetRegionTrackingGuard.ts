import type { TargetRegionResult } from './targetRegionId'

export type TargetRegionTrackingStatus = 'detected' | 'holding' | 'missing'

export type TargetRegionTrackingGuardOptions = {
  holdDurationMs?: number
}

export type TargetRegionTrackingResult = {
  target: TargetRegionResult
  status: TargetRegionTrackingStatus
  shouldClearHover: boolean
  lastDetectedTimestampMs: number | null
}

export class TargetRegionTrackingGuard {
  private readonly holdDurationMs: number
  private lastDetectedTarget: TargetRegionResult | null = null
  private lastDetectedTimestampMs: number | null = null
  private lastStatus: TargetRegionTrackingStatus = 'missing'

  constructor(options: TargetRegionTrackingGuardOptions = {}) {
    this.holdDurationMs = Math.max(options.holdDurationMs ?? 120, 0)
  }

  update(target: TargetRegionResult, timestampMs: number): TargetRegionTrackingResult {
    if (target.isDetected) {
      this.lastDetectedTarget = target
      this.lastDetectedTimestampMs = timestampMs
      this.lastStatus = 'detected'

      return {
        target,
        status: 'detected',
        shouldClearHover: false,
        lastDetectedTimestampMs: this.lastDetectedTimestampMs,
      }
    }

    if (
      this.lastDetectedTarget &&
      this.lastDetectedTimestampMs !== null &&
      timestampMs - this.lastDetectedTimestampMs <= this.holdDurationMs
    ) {
      this.lastStatus = 'holding'

      return {
        target: this.lastDetectedTarget,
        status: 'holding',
        shouldClearHover: false,
        lastDetectedTimestampMs: this.lastDetectedTimestampMs,
      }
    }

    const shouldClearHover = this.lastStatus !== 'missing'

    this.lastDetectedTarget = null
    this.lastDetectedTimestampMs = null
    this.lastStatus = 'missing'

    return {
      target,
      status: 'missing',
      shouldClearHover,
      lastDetectedTimestampMs: null,
    }
  }

  reset(): void {
    this.lastDetectedTarget = null
    this.lastDetectedTimestampMs = null
    this.lastStatus = 'missing'
  }
}
