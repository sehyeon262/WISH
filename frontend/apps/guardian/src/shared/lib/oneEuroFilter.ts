/**
 * One Euro Filter — 노이즈가 있는 좌표 입력에 대한 적응형 저역 통과 필터.
 * 좌표가 정지해 있을 땐 강하게 평활화하여 미세 떨림을 제거하고,
 * 빠르게 움직일 땐 자연스럽게 따라가도록 cutoff 가 속도에 비례해 올라감.
 *
 * 참고: Casiez et al., "1€ Filter" (CHI 2012)
 *
 * NOTE: 게임 앱(frontend/apps/game/src/game/motion/oneEuroFilter.ts)에 동일 구현이 존재.
 * 추후 공통 패키지(@wish/motion 등)로 묶어 중복 제거 예정.
 */

export type OneEuroFilterOptions = {
  /** 정지 시 cutoff 주파수 (Hz). 낮을수록 떨림 더 죽임. */
  minCutoff?: number
  /** cutoff 가 속도에 비례하는 정도. 클수록 빠른 움직임에 잘 반응. */
  beta?: number
  /** 속도 추정의 cutoff 주파수 (Hz). 보통 1.0 고정. */
  dCutoff?: number
}

export class OneEuro1D {
  private readonly minCutoff: number
  private readonly beta: number
  private readonly dCutoff: number
  private prevX: number | null = null
  private prevDx = 0
  private prevTime = 0

  constructor({ minCutoff = 1.5, beta = 0.02, dCutoff = 1 }: OneEuroFilterOptions = {}) {
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

function smoothingFactor(dt: number, cutoff: number): number {
  const tau = 1 / (2 * Math.PI * cutoff)
  return 1 / (1 + tau / dt)
}
