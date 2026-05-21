export type SeongsuDialogStage = 'guide' | 'choicePrompt'

export interface SeongsuDialogLine {
  id: string
  text: string
}

export const seongsuDialogs: Record<SeongsuDialogStage, SeongsuDialogLine[]> = {
  guide: [
    {
      id: 'seongsu-guide-001',
      text: '안녕! 오늘은 성수 선생님이랑 즐겁게 체조를 해보자.',
    },
  ],
  choicePrompt: [
    {
      id: 'seongsu-choice-prompt-001',
      text: '신나는 동작을 하고 싶으면 TOP 체조,\n재미있는 동작을 하고 싶으면 다니엘 체조를 골라보자.',
    },
  ],
}
