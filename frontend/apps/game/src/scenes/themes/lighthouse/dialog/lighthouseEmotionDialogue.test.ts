import { describe, expect, it } from 'vitest'
import {
  getChoiceDisplayText,
  getLighthouseEmotionScene,
  getQuestionDisplayText,
  getSecondaryAction,
  getVisibleChoices,
  LIGHTHOUSE_EMOTION_START_SCENE_ID,
  LIGHTHOUSE_MAX_QUESTION_SCENES,
  lighthouseShortEmotionDialogue,
  validateDialogueGraph,
  waveMeterCards,
} from './lighthouseEmotionDialogue'

const expectedQuestionChoices = [
  {
    sceneId: 'lh_00_greeting_mood_check',
    question: '오늘 기분은 어떠니?',
    choices: ['괜찮아요', '걱정돼요', '힘들어요', '오늘은 쉬고 싶어요'],
  },
  {
    sceneId: 'lh_01_worry_source',
    question: '무엇이 가장 걱정되니?',
    choices: ['아픈 게 걱정돼요', '잘 모르겠어요', '가족이 걱정돼요', '오늘은 쉬고 싶어요'],
  },
  {
    sceneId: 'lh_02_hard_part',
    question: '지금 가장 힘든 건 뭐니?',
    choices: ['몸이 힘들어요', '외로워요', '화가 나요', '오늘은 쉬고 싶어요'],
  },
  {
    sceneId: 'lh_03_small_action',
    question: '지금 해볼 수 있는 작은 일은?',
    choices: ['숨을 천천히 쉬어요', '그림을 그려요', '한마디 해볼래요', '오늘은 쉬고 싶어요'],
  },
  {
    sceneId: 'lh_04_support_choice',
    question: '어떻게 도움을 받아볼까?',
    choices: ['가족에게 말할래요', '선생님께 말할래요', '그림으로 전할래요', '오늘은 쉬고 싶어요'],
  },
]

describe('lighthouseShortEmotionDialogue', () => {
  it('starts from the required mood check scene', () => {
    const scene = getLighthouseEmotionScene(LIGHTHOUSE_EMOTION_START_SCENE_ID)

    expect(scene?.id).toBe('lh_00_greeting_mood_check')
    expect(scene?.mode).toBe('PLAYER_CHOICE')
  })

  it('keeps question and choice text semantically aligned', () => {
    expectedQuestionChoices.forEach(({ sceneId, question, choices }) => {
      const scene = getLighthouseEmotionScene(sceneId)
      expect(scene).not.toBeNull()

      const visibleText = [
        ...getVisibleChoices(scene!).map(getChoiceDisplayText),
        getSecondaryAction(scene!)?.text,
      ]

      expect(getQuestionDisplayText(scene!)).toBe(question)
      expect(visibleText).toEqual(choices)
    })
  })

  it('limits each visible player choice screen to three primary choices', () => {
    const playerChoiceScenes = lighthouseShortEmotionDialogue.filter(
      scene => scene.mode === 'PLAYER_CHOICE',
    )

    playerChoiceScenes.forEach(scene => {
      expect(getVisibleChoices(scene)).toHaveLength(Math.min(scene.choices?.length ?? 0, 3))
      expect(getVisibleChoices(scene).length).toBeLessThanOrEqual(3)
      expect(getSecondaryAction(scene)?.text).toBe('오늘은 쉬고 싶어요')
    })
  })

  it('does not expose internal keys in child-facing display text', () => {
    const displayTexts = lighthouseShortEmotionDialogue.flatMap(scene => [
      getQuestionDisplayText(scene),
      ...getVisibleChoices(scene).map(getChoiceDisplayText),
      getSecondaryAction(scene)?.text ?? '',
      ...scene.npcLines,
    ])

    expect(displayTexts.join(' ')).not.toMatch(
      /iconKey|choiceId|sceneId|emotionWeights|intensity|concernFlags|protectiveFactors|animationKey|spriteKey/,
    )
  })

  it('keeps normal branches within the three-question limit', () => {
    const paths = [
      ['lh_00_greeting_mood_check', 'mood_okay', 'lh_03_small_action', 'action_breathe'],
      [
        'lh_00_greeting_mood_check',
        'mood_okay',
        'lh_03_small_action',
        'action_tell',
        'lh_04_support_choice',
        'support_family',
      ],
      [
        'lh_00_greeting_mood_check',
        'mood_worried',
        'lh_01_worry_source',
        'worry_pain',
        'lh_04_support_choice',
        'support_family',
      ],
      [
        'lh_00_greeting_mood_check',
        'mood_hard',
        'lh_02_hard_part',
        'hard_body',
        'lh_04_support_choice',
        'support_medical',
      ],
    ]

    paths.forEach(path => {
      const questionSceneCount = path.filter(item => item.startsWith('lh_')).length
      expect(questionSceneCount).toBeLessThanOrEqual(LIGHTHOUSE_MAX_QUESTION_SCENES)
    })
  })

  it('routes every rest action to the rest closing summary scene', () => {
    lighthouseShortEmotionDialogue
      .filter(scene => scene.mode === 'PLAYER_CHOICE')
      .forEach(scene => {
        expect(getSecondaryAction(scene)?.followUpPromptId).toBe('lh_06_rest_closing')
      })

    expect(getLighthouseEmotionScene('lh_05_closing')?.onComplete?.action).toBe(
      'FINISH_EMOTION_CHECKIN',
    )
    expect(getLighthouseEmotionScene('lh_06_rest_closing')?.onComplete?.action).toBe(
      'FINISH_EMOTION_CHECKIN',
    )
  })

  it('validates the dialogue graph without broken follow-up links', () => {
    expect(validateDialogueGraph()).toEqual([])
  })

  it('routes every requested choice path to the postcard terminal action', () => {
    const paths = [
      ['mood_okay', 'action_breathe'],
      ['mood_okay', 'action_draw'],
      ['mood_okay', 'action_tell', 'support_family'],
      ['mood_worried', 'worry_pain', 'support_medical'],
      ['mood_worried', 'worry_unknown', 'support_draw'],
      ['mood_worried', 'worry_family', 'rest_from_support_choice'],
      ['mood_hard', 'hard_body', 'support_family'],
      ['mood_hard', 'hard_lonely', 'rest_from_support_choice'],
      ['rest_from_mood_check'],
    ]

    paths.forEach(choicePath => {
      let scene = getLighthouseEmotionScene(LIGHTHOUSE_EMOTION_START_SCENE_ID)
      expect(scene).not.toBeNull()

      choicePath.forEach(choiceId => {
        const choices = [...getVisibleChoices(scene!), getSecondaryAction(scene!)].filter(Boolean)
        const choice = choices.find(item => item?.id === choiceId)
        expect(choice).toBeDefined()
        scene = getLighthouseEmotionScene(choice!.followUpPromptId!)
        expect(scene).not.toBeNull()
      })

      expect(scene?.onComplete?.action).toBe('FINISH_EMOTION_CHECKIN')
    })
  })

  it('defines wave meter as three non-numeric cards', () => {
    expect(waveMeterCards).toHaveLength(3)
    expect(waveMeterCards.map(card => card.text)).toEqual([
      '잔잔해요',
      '조금 출렁여요',
      '많이 출렁여요',
    ])
  })
})
