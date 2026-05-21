export type ArtContentMode = 'free-drawing' | 'coloring'

export type RumiSelectDialogStage = 'greeting' | 'choice-prompt'

export type RumiContentDialogStage =
  | 'confirm'
  | 'intro'
  | 'first-action'
  | 'idle'
  | 'encourage'
  | 'almost-done'
  | 'complete'
  | 'next-step'

export interface RumiDialogLine {
  id: string
  text: string
}

export interface ArtChoiceOption {
  mode: ArtContentMode
  label: string
  description: string
}

export const artChoiceOptions: ArtChoiceOption[] = [
  { mode: 'free-drawing', label: '그림 퀴즈', description: '제시어를 보고 그림으로 표현해봐!' },
  { mode: 'coloring', label: '색칠하기', description: '준비된 그림에 예쁜 색을 입혀봐!' },
]

export const rumiSelectDialogs: Record<RumiSelectDialogStage, RumiDialogLine[]> = {
  greeting: [
    { id: 'rumi-greeting-001', text: '안녕, 와줘서 고마워. 오늘도 루미랑 그림 놀이해볼까?' },
    { id: 'rumi-greeting-002', text: '반가워. 여기서는 천천히, 네 마음 가는 대로 해도 괜찮아.' },
  ],
  'choice-prompt': [
    {
      id: 'rumi-choice-001',
      text: '오늘은 제시어를 보고 그림 퀴즈를 풀어볼까, 아니면 준비된 그림에 예쁜 색을 입혀보고 싶어?',
    },
    {
      id: 'rumi-choice-002',
      text: '제시어 보고 그려보고 싶으면 그림 퀴즈, 그림에 색을 채우고 싶으면 색칠하기를 골라보자.',
    },
  ],
}

export const rumiContentDialogs: Record<
  ArtContentMode,
  Record<RumiContentDialogStage, RumiDialogLine[]>
> = {
  'free-drawing': {
    confirm: [
      { id: 'rumi-free-confirm-001', text: '좋아, 어떻게 놀고 싶은지 골라보자.' },
      { id: 'rumi-free-confirm-002', text: '좋아, 혼자 할지 친구랑 할지 골라봐.' },
    ],
    intro: [
      { id: 'rumi-free-intro-001', text: '위쪽에 제시어가 보이지? 천천히 그려보자.' },
      {
        id: 'rumi-free-intro-002',
        text: '제시어처럼 보이게 그리면 돼. 다 그렸으면 "그렸어요!"를 눌러.',
      },
    ],
    'first-action': [
      { id: 'rumi-free-first-001', text: '우와, 시작됐구나. 네 그림이 조금씩 나타나고 있어.' },
      { id: 'rumi-free-first-002', text: '좋아, 네 손끝에서 멋진 이야기가 시작되고 있어.' },
    ],
    idle: [
      { id: 'rumi-free-idle-001', text: '천천히 생각해도 괜찮아. 다음엔 어떤 걸 그리고 싶니?' },
      { id: 'rumi-free-idle-002', text: '잠깐 쉬어가도 좋아. 떠오르는 색이 있으면 다시 그려보자.' },
    ],
    encourage: [
      { id: 'rumi-free-encourage-001', text: '잘하고 있어. 네 방식대로 그리면 돼.' },
      {
        id: 'rumi-free-encourage-002',
        text: '그 선도 참 멋지다. 네 그림만의 느낌이 살아나고 있어.',
      },
      { id: 'rumi-free-encourage-003', text: '천천히 해도 괜찮아. 루미가 옆에 있을게.' },
    ],
    'almost-done': [
      { id: 'rumi-free-almost-001', text: '우와, 그림이 점점 더 풍성해지고 있어.' },
      { id: 'rumi-free-almost-002', text: '조금만 더 하면 네 그림이 더 또렷해지겠어.' },
    ],
    complete: [
      { id: 'rumi-free-complete-001', text: '완성했구나. 네 마음이 그림 속에 예쁘게 담겼어.' },
      { id: 'rumi-free-complete-002', text: '정말 멋진 그림이야. 네가 고른 색과 선이 참 따뜻해.' },
    ],
    'next-step': [
      { id: 'rumi-free-next-001', text: '다시 그려볼래, 아니면 다른 그림 놀이를 해볼까?' },
      {
        id: 'rumi-free-next-002',
        text: '이번 그림도 좋았어. 다음엔 다른 방식으로도 해볼 수 있어.',
      },
    ],
  },
  coloring: {
    confirm: [
      { id: 'rumi-color-confirm-001', text: '좋아, 오늘은 예쁜 색으로 그림을 채워보자.' },
      { id: 'rumi-color-confirm-002', text: '좋아, 준비된 그림에 네가 좋아하는 색을 입혀보자.' },
    ],
    intro: [
      { id: 'rumi-color-intro-001', text: '밑그림이 준비되어 있어. 마음에 드는 색부터 골라보자.' },
      {
        id: 'rumi-color-intro-002',
        text: '어떤 색부터 써도 괜찮아. 네가 고른 색이 그림을 특별하게 만들 거야.',
      },
    ],
    'first-action': [
      { id: 'rumi-color-first-001', text: '우와, 색이 들어가니까 그림이 환해지고 있어.' },
      { id: 'rumi-color-first-002', text: '좋아, 네 색이 그림을 반짝이게 만들어주고 있어.' },
    ],
    idle: [
      { id: 'rumi-color-idle-001', text: '천천히 골라도 괜찮아. 다음엔 어디를 색칠해볼까?' },
      { id: 'rumi-color-idle-002', text: '마음에 드는 색을 찾고 있구나. 천천히 둘러봐도 좋아.' },
    ],
    encourage: [
      { id: 'rumi-color-encourage-001', text: '이 색도 참 예쁘다. 그림 분위기가 달라지고 있어.' },
      {
        id: 'rumi-color-encourage-002',
        text: '정말 잘하고 있어. 네가 고른 색들이 서로 잘 어울려.',
      },
      { id: 'rumi-color-encourage-003', text: '네가 칠한 자리마다 그림이 조금씩 살아나고 있어.' },
    ],
    'almost-done': [
      {
        id: 'rumi-color-almost-001',
        text: '우와, 거의 다 왔구나. 그림이 점점 알록달록 예뻐지고 있어.',
      },
      { id: 'rumi-color-almost-002', text: '조금만 더 하면 네 색이 그림을 가득 채워주겠어.' },
    ],
    complete: [
      {
        id: 'rumi-color-complete-001',
        text: '완성했구나. 네가 고른 색이 그림을 정말 특별하게 만들었어.',
      },
      {
        id: 'rumi-color-complete-002',
        text: '정말 따뜻한 그림이야. 네 색이 그림 속에 예쁘게 담겼어.',
      },
    ],
    'next-step': [
      { id: 'rumi-color-next-001', text: '다른 그림도 색칠해볼래, 아니면 자유롭게 그려볼까?' },
      { id: 'rumi-color-next-002', text: '이번 그림도 참 좋았어. 다음엔 또 다른 색으로 놀아보자.' },
    ],
  },
}
