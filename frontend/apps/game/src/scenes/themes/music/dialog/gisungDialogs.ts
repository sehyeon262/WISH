export type MusicContentMode = 'rhythm-game' | 'free-play'

export type GisungSelectDialogStage = 'greeting' | 'choice-prompt'

export type GisungChoiceDialogStage = 'hover' | 'confirm'

export type GisungContentDialogStage =
  | 'intro'
  | 'first-action'
  | 'idle'
  | 'encourage'
  | 'complete'
  | 'next-step'

export interface GisungDialogLine {
  id: string
  text: string
}

export interface MusicChoiceOption {
  mode: MusicContentMode
  label: string
  description: string
}

export const musicChoiceOptions: MusicChoiceOption[] = [
  {
    mode: 'rhythm-game',
    label: '리듬 놀이',
    description: '음악에 맞춰 박자를 눌러봐!',
  },
  {
    mode: 'free-play',
    label: '자유 연주',
    description: '내 마음대로 소리를 만들어봐!',
  },
]

export const gisungSelectDialogs: Record<GisungSelectDialogStage, GisungDialogLine[]> = {
  greeting: [
    { id: 'gisung-greeting-001', text: '오늘은 음악으로 놀아볼 시간이야!' },
    { id: 'gisung-greeting-002', text: '귀를 쫑긋 열고, 소리의 흐름을 느껴보자.' },
  ],
  'choice-prompt': [
    {
      id: 'gisung-choice-prompt-001',
      text: '박자를 따라가 볼까, 아니면 마음대로 연주해볼까?',
    },
    {
      id: 'gisung-choice-prompt-002',
      text: '리듬을 따라갈 수도 있고, 네가 직접 연주할 수도 있어!',
    },
  ],
}

export const gisungChoiceDialogs: Record<
  MusicContentMode,
  Record<GisungChoiceDialogStage, GisungDialogLine[]>
> = {
  'rhythm-game': {
    hover: [
      {
        id: 'gisung-rhythm-hover-001',
        text: '노래를 잘 듣고, 알맞은 순간에 톡 눌러보는 놀이야!',
      },
      {
        id: 'gisung-rhythm-hover-002',
        text: '표시가 도착하는 순간을 잘 보고 박자를 맞춰봐.',
      },
    ],
    confirm: [
      {
        id: 'gisung-rhythm-confirm-001',
        text: '좋아! 귀를 쫑긋 열고 박자에 맞춰 눌러보자!',
      },
      {
        id: 'gisung-rhythm-confirm-002',
        text: '좋아! 하나, 둘, 셋! 리듬을 타볼까?',
      },
    ],
  },
  'free-play': {
    hover: [
      {
        id: 'gisung-free-hover-001',
        text: '여기서는 정답이 없어. 네가 누르는 소리가 음악이 돼!',
      },
      {
        id: 'gisung-free-hover-002',
        text: '높은 소리와 낮은 소리를 섞어서 나만의 멜로디를 만들어봐.',
      },
    ],
    confirm: [
      {
        id: 'gisung-free-confirm-001',
        text: '좋아! 이번엔 네 마음대로 멋진 연주를 만들어보자!',
      },
      {
        id: 'gisung-free-confirm-002',
        text: '좋아! 누르는 소리마다 네 음악이 될 거야.',
      },
    ],
  },
}

export const gisungContentDialogs: Record<
  MusicContentMode,
  Record<GisungContentDialogStage, GisungDialogLine[]>
> = {
  'rhythm-game': {
    intro: [
      { id: 'gisung-rhythm-intro-001', text: '음악을 잘 듣고 박자에 맞춰 눌러보자!' },
      { id: 'gisung-rhythm-intro-002', text: '표시가 내려오는 순간을 보고 톡 눌러봐.' },
    ],
    'first-action': [
      { id: 'gisung-rhythm-first-001', text: '좋아, 첫 박자를 잘 잡았어!' },
      { id: 'gisung-rhythm-first-002', text: '멋져! 리듬이 시작됐어.' },
    ],
    idle: [
      { id: 'gisung-rhythm-idle-001', text: '음악을 들으면서 천천히 따라가면 돼.' },
      { id: 'gisung-rhythm-idle-002', text: '다음 박자가 올 때까지 귀를 기울여보자.' },
    ],
    encourage: [
      { id: 'gisung-rhythm-encourage-001', text: '좋아, 박자를 잘 잡고 있어!' },
      { id: 'gisung-rhythm-encourage-002', text: '괜찮아, 다음 박자를 노려보자.' },
      { id: 'gisung-rhythm-encourage-003', text: '멋져! 리듬이 점점 살아나고 있어.' },
    ],
    complete: [
      { id: 'gisung-rhythm-complete-001', text: '끝까지 잘 따라왔어!' },
      { id: 'gisung-rhythm-complete-002', text: '네가 만든 리듬이 음악이랑 잘 어울렸어.' },
    ],
    'next-step': [
      { id: 'gisung-rhythm-next-001', text: '다시 해볼까, 아니면 다른 연주를 해볼까?' },
      { id: 'gisung-rhythm-next-002', text: '이번엔 자유롭게 소리를 만들어봐도 좋아.' },
    ],
  },
  'free-play': {
    intro: [
      { id: 'gisung-free-intro-001', text: '이번엔 네 마음대로 연주해보자!' },
      { id: 'gisung-free-intro-002', text: '천천히 눌러도 좋고, 신나게 이어서 눌러도 좋아.' },
    ],
    'first-action': [
      { id: 'gisung-free-first-001', text: '오, 재미있는 소리가 났어!' },
      { id: 'gisung-free-first-002', text: '좋아, 네 멜로디가 시작됐어.' },
    ],
    idle: [
      { id: 'gisung-free-idle-001', text: '마음에 드는 소리를 천천히 찾아봐.' },
      { id: 'gisung-free-idle-002', text: '이번엔 다른 순서로 눌러볼까?' },
    ],
    encourage: [
      { id: 'gisung-free-encourage-001', text: '소리를 이어보니까 음악처럼 들리지?' },
      { id: 'gisung-free-encourage-002', text: '이번 멜로디는 네가 직접 만든 거야.' },
      { id: 'gisung-free-encourage-003', text: '좋아, 소리들이 멋지게 이어지고 있어.' },
    ],
    complete: [
      { id: 'gisung-free-complete-001', text: '멋진 연주였어!' },
      { id: 'gisung-free-complete-002', text: '네가 만든 음악은 하나뿐인 음악이야.' },
    ],
    'next-step': [
      { id: 'gisung-free-next-001', text: '다른 소리 조합도 만들어볼까?' },
      { id: 'gisung-free-next-002', text: '다음에는 리듬에 맞춰 연주해봐도 좋아.' },
    ],
  },
}
