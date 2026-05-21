const BE_TO_AI_MOVEMENT_NAME: Record<string, string> = {
  기본준비: '기본준비',
  '왼 앞서기 아래막기': '앞서고 아래막기',
  '오른 앞서기 아래막기': '앞서고 아래막기',
  '왼 앞서기 몸통지르기': '앞서고 지르기',
  '오른 앞서기 몸통지르기': '앞서고 지르기',
  '왼 앞서고 몸통지르기': '앞서고 지르기',
  '오른 앞서고 몸통지르기': '앞서고 지르기',
  '왼 앞서기 몸통 안막기': '앞서고 안막기',
  '오른 앞서기 몸통 안막기': '앞서고 안막기',
  '왼 앞서기 얼굴막기': '앞서고 얼굴막기',
  '왼 앞굽이 아래막기': '앞굽이하고 아래막기',
  '오른 앞굽이 아래막기': '앞굽이하고 아래막기',
  '왼 몸통지르기': '앞굽이하고 지르기',
  '오른 몸통지르기': '앞굽이하고 지르기',
}

export function toAiMovementName(beName: string): string {
  const trimmed = beName.trim()
  const mapped = BE_TO_AI_MOVEMENT_NAME[trimmed]
  if (mapped) {
    return mapped
  }
  console.warn('[taekwondoMovementName] no AI mapping for BE name:', beName)
  return trimmed
}
