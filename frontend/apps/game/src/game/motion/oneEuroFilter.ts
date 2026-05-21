/**
 * One Euro Filter — 노이즈가 있는 좌표 입력에 대한 적응형 저역 통과 필터.
 * 손이 멈춰있을 땐 강하게 평활화하여 미세 떨림을 제거하고,
 * 빠르게 움직일 땐 자연스럽게 따라가도록 cutoff 가 속도에 비례해 올라감.
 *
 * 참고: Casiez et al., "1€ Filter" (CHI 2012)
 */

export type OneEuroFilterOptions = {
  /** 정지 시 cutoff 주파수 (Hz). 낮을수록 떨림 더 죽임. */
  minCutoff?: number
  /** cutoff 가 속도에 비례하는 정도. 클수록 빠른 움직임에 잘 반응. */
  beta?: number
  /** 속도 추정의 cutoff 주파수 (Hz). 보통 1.0 고정. */
  dCutoff?: number
}

class OneEuro1D {
  private readonly minCutoff: number
  private readonly beta: number
  private readonly dCutoff: number
  private prevX: number | null = null
  private prevDx = 0
  private prevTime = 0

  constructor({ minCutoff = 0.6, beta = 0.012, dCutoff = 1 }: OneEuroFilterOptions = {}) {
    this.minCutoff = minCutoff
    this.beta = beta
    this.dCutoff = dCutoff
  }

  filter(value: number, timeMs: number): number {
    if (this.prevX === null || timeMs <= this.prevTime) {
      this.prevX = value
      this.prevDx = 0
      this.prevTime = timeMs
      return value
    }
    const dt = (timeMs - this.prevTime) / 1000
    const dx = (value - this.prevX) / dt
    const aD = smoothingFactor(dt, this.dCutoff)
    const dxFiltered = aD * dx + (1 - aD) * this.prevDx
    const cutoff = this.minCutoff + this.beta * Math.abs(dxFiltered)
    const a = smoothingFactor(dt, cutoff)
    const xFiltered = a * value + (1 - a) * this.prevX

    this.prevX = xFiltered
    this.prevDx = dxFiltered
    this.prevTime = timeMs
    return xFiltered
  }

  reset() {
    this.prevX = null
    this.prevDx = 0
    this.prevTime = 0
  }
}

export class OneEuroPointFilter {
  private readonly fx: OneEuro1D
  private readonly fy: OneEuro1D

  constructor(options?: OneEuroFilterOptions) {
    this.fx = new OneEuro1D(options)
    this.fy = new OneEuro1D(options)
  }

  filter(point: { x: number; y: number }, timeMs: number = performance.now()) {
    return {
      x: this.fx.filter(point.x, timeMs),
      y: this.fy.filter(point.y, timeMs),
    }
  }

  reset() {
    this.fx.reset()
    this.fy.reset()
  }
}

function smoothingFactor(dt: number, cutoff: number): number {
  const tau = 1 / (2 * Math.PI * cutoff)
  return 1 / (1 + tau / dt)
}
