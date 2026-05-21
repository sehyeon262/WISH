// 아동 친화 한글 제시어 풀 — 단순하고 그리기 쉬운 사물/동물/자연 위주.
// 너무 추상적(감정, 개념)이거나 묘사가 복잡한 단어는 제외.
export type DrawingPrompt = {
  word: string
  hint?: string
}

export const DRAWING_PROMPTS: readonly DrawingPrompt[] = [
  { word: '사과', hint: '빨갛고 동그래요' },
  { word: '바나나', hint: '길고 노래요' },
  { word: '수박', hint: '줄무늬가 있어요' },
  { word: '딸기', hint: '점이 콕콕 박혀요' },
  { word: '집', hint: '지붕과 문이 있어요' },
  { word: '나무', hint: '뿌리와 잎이 있어요' },
  { word: '꽃', hint: '꽃잎이 동그랗게 모여요' },
  { word: '해', hint: '동그라미 주변에 햇살이 뻗어요' },
  { word: '달', hint: '밤하늘에 떠 있어요' },
  { word: '별', hint: '뾰족뾰족 다섯 갈래' },
  { word: '구름', hint: '말랑말랑 동글동글' },
  { word: '비', hint: '하늘에서 떨어져요' },
  { word: '무지개', hint: '둥글게 휜 줄무늬' },
  { word: '눈사람', hint: '동그라미 두 개를 쌓아요' },
  { word: '고양이', hint: '귀가 뾰족하고 꼬리가 있어요' },
  { word: '강아지', hint: '귀가 늘어지고 꼬리를 흔들어요' },
  { word: '토끼', hint: '귀가 길어요' },
  { word: '곰', hint: '몸이 통통하고 귀가 둥글어요' },
  { word: '물고기', hint: '꼬리 지느러미가 있어요' },
  { word: '새', hint: '날개가 있어요' },
  { word: '나비', hint: '날개에 무늬가 있어요' },
  { word: '거북이', hint: '등껍질이 있어요' },
  { word: '자동차', hint: '바퀴 네 개가 있어요' },
  { word: '기차', hint: '길게 이어진 칸이 있어요' },
  { word: '비행기', hint: '날개와 꼬리가 있어요' },
  { word: '배', hint: '물 위에 떠요' },
  { word: '풍선', hint: '동그랗고 줄이 달려있어요' },
  { word: '우산', hint: '비올 때 펴요' },
  { word: '안경', hint: '동그라미 두 개가 이어져요' },
  { word: '시계', hint: '바늘이 두 개예요' },
  { word: '연필', hint: '한쪽이 뾰족해요' },
  { word: '컵', hint: '손잡이가 있을 수도 있어요' },
  { word: '케이크', hint: '초가 꽂혀있어요' },
  { word: '아이스크림', hint: '콘 위에 동그라미가 얹혀있어요' },
  { word: '도넛', hint: '가운데가 뚫린 동그라미' },
  { word: '하트', hint: '사랑을 나타내요' },
  { word: '왕관', hint: '뾰족뾰족 윗부분' },
  { word: '공', hint: '동그래요' },
  { word: '책', hint: '펼치면 두 장이 보여요' },
  { word: '열쇠', hint: '문을 여는 도구예요' },
]

export function pickRandomPrompt(exclude?: string): DrawingPrompt {
  // exclude 와 다른 제시어를 뽑되, 풀이 1개뿐이면 그냥 그대로
  const candidates =
    exclude && DRAWING_PROMPTS.length > 1
      ? DRAWING_PROMPTS.filter(prompt => prompt.word !== exclude)
      : [...DRAWING_PROMPTS]
  const index = Math.floor(Math.random() * candidates.length)
  return candidates[index] ?? DRAWING_PROMPTS[0]
}
