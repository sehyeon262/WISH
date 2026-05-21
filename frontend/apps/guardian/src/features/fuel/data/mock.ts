export type FuelOptionId = 'small' | 'warm' | 'sparkle' | 'custom'

export type FuelOption = {
  id: FuelOptionId
  label: string
  amount: number | null
  starColor: string
}

// 게이지 100% 가 목표 (BE: lifetime sum 100 도달 시 completed=true).
export const FUEL_GOAL_PERCENT = 100

export const FUEL_OPTIONS: ReadonlyArray<FuelOption> = [
  { id: 'small', label: '잔잔한 별빛', amount: 5, starColor: '#dcd9ec' },
  { id: 'warm', label: '따뜻한 별빛', amount: 10, starColor: '#ffd55c' },
  { id: 'sparkle', label: '환한 별빛', amount: 15, starColor: '#a892ff' },
  { id: 'custom', label: '직접 입력', amount: null, starColor: '#ffb547' },
]

// BE FuelEvent.amount 로부터 표시용 라벨/색을 역매핑. FUEL_OPTIONS 의 5/10/15
// 외 값은 모두 "직접 입력" 으로 fallback (custom 옵션과 동일 색).
export function fuelLabelByAmount(amount: number) {
  const matched = FUEL_OPTIONS.find(o => o.amount === amount)
  if (matched) return { label: matched.label, starColor: matched.starColor }
  const custom = FUEL_OPTIONS.find(o => o.id === 'custom')
  return { label: '직접 입력', starColor: custom?.starColor ?? '#ffb547' }
}

export const MESSAGE_MAX_LENGTH = 100
