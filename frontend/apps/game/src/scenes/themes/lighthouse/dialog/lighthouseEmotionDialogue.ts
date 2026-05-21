export type EmotionTag =
  | 'hopeJoy'
  | 'anxietyFear'
  | 'sadnessLoneliness'
  | 'angerFrustration'
  | 'painSomatic'
  | 'parentConcern'
  | 'avoidanceWithdrawal'
  | 'supportSeeking'
  | 'agencyCoping'
  | 'informationNeed'

export type EmotionWeights = Partial<Record<EmotionTag, number>>

export type LighthouseChoiceIconKey =
  | 'sun'
  | 'fog'
  | 'wave'
  | 'heart'
  | 'bandage'
  | 'friend'
  | 'anchor'
  | 'lantern'
  | 'pause'

export type LighthouseEmotionChoice = {
  id: string
  text: string
  iconKey: LighthouseChoiceIconKey
  emotionWeights: EmotionWeights
  intensity: 0 | 1 | 2 | 3
  concernFlags?: string[]
  protectiveFactors?: string[]
  npcResponse: string[]
  followUpPromptId?: string | null
}

export type LighthouseSceneEngagement = {
  presentationType?: 'emotion_card_select'
  afterChoiceFeedback?: boolean
  neutralRewardId?: 'daily_light_piece'
  companionId?: 'mong'
  showPostcardOnEnd?: boolean
  giveNeutralReward?: boolean
  allowDecorReward?: boolean
}

export type LighthouseEmotionScene = {
  id: string
  mode: 'NPC_DIALOGUE' | 'PLAYER_CHOICE'
  speaker: string
  nameplate: string
  questionText?: string
  maxChoices?: number
  npcLines: string[]
  choices?: LighthouseEmotionChoice[]
  secondaryAction?: LighthouseEmotionChoice
  engagement?: LighthouseSceneEngagement
  onComplete?: {
    action: 'FINISH_EMOTION_CHECKIN'
  }
}

export type WaveMeterCard = {
  id: 'wave_low' | 'wave_mid' | 'wave_high'
  text: string
  iconKey: LighthouseChoiceIconKey
  scoreRange: [number, number]
  distressSignalLevelHint: 'low' | 'watch' | 'support_recommended'
}

export type DialogueGraphValidationIssue = {
  sceneId: string
  message: string
}

export const LIGHTHOUSE_EMOTION_START_SCENE_ID = 'lh_00_greeting_mood_check'
export const LIGHTHOUSE_EMOTION_CLOSING_SCENE_ID = 'lh_05_closing'
export const LIGHTHOUSE_REST_CLOSING_SCENE_ID = 'lh_06_rest_closing'
export const LIGHTHOUSE_MAX_QUESTION_SCENES = 3

const SPEAKER_YOUNGCHEOL = '등대지기 영철'

const playerChoiceEngagement: LighthouseSceneEngagement = {
  presentationType: 'emotion_card_select',
  afterChoiceFeedback: true,
  neutralRewardId: 'daily_light_piece',
  companionId: 'mong',
  showPostcardOnEnd: false,
}

const closingEngagement: LighthouseSceneEngagement = {
  showPostcardOnEnd: true,
  giveNeutralReward: true,
  allowDecorReward: true,
}

function createRestAction(id: string, npcResponse: string[] = ['알겠다. 오늘은 쉬어도 괜찮단다.']) {
  return {
    id,
    text: '오늘은 쉬고 싶어요',
    iconKey: 'pause',
    emotionWeights: {
      avoidanceWithdrawal: 1,
      agencyCoping: 1,
    },
    intensity: 1,
    concernFlags: ['ended_checkin'],
    protectiveFactors: ['sets_boundary'],
    npcResponse,
    followUpPromptId: LIGHTHOUSE_REST_CLOSING_SCENE_ID,
  } satisfies LighthouseEmotionChoice
}

export const globalRestTodayChoice: LighthouseEmotionChoice =
  createRestAction('rest_from_mood_check')

export const waveMeterCards: WaveMeterCard[] = [
  {
    id: 'wave_low',
    text: '잔잔해요',
    iconKey: 'sun',
    scoreRange: [0, 2],
    distressSignalLevelHint: 'low',
  },
  {
    id: 'wave_mid',
    text: '조금 출렁여요',
    iconKey: 'fog',
    scoreRange: [3, 5],
    distressSignalLevelHint: 'watch',
  },
  {
    id: 'wave_high',
    text: '많이 출렁여요',
    iconKey: 'wave',
    scoreRange: [6, 10],
    distressSignalLevelHint: 'support_recommended',
  },
]

export const lighthouseShortEmotionDialogue: LighthouseEmotionScene[] = [
  {
    id: 'lh_00_greeting_mood_check',
    mode: 'PLAYER_CHOICE',
    speaker: SPEAKER_YOUNGCHEOL,
    nameplate: SPEAKER_YOUNGCHEOL,
    questionText: '오늘 기분은 어떠니?',
    maxChoices: 3,
    engagement: playerChoiceEngagement,
    npcLines: ['안녕, 오늘도 와줬구나.', '오늘 기분은 어떠니?'],
    choices: [
      {
        id: 'mood_okay',
        text: '괜찮아요',
        iconKey: 'sun',
        emotionWeights: { hopeJoy: 2, agencyCoping: 1 },
        intensity: 0,
        concernFlags: [],
        protectiveFactors: ['positive_mood'],
        npcResponse: ['좋구나. 작은 햇빛이 보이는 날이네.'],
        followUpPromptId: 'lh_03_small_action',
      },
      {
        id: 'mood_worried',
        text: '걱정돼요',
        iconKey: 'fog',
        emotionWeights: { anxietyFear: 2, informationNeed: 1 },
        intensity: 2,
        concernFlags: ['worry_present'],
        protectiveFactors: ['emotion_named'],
        npcResponse: ['걱정이 찾아왔구나.'],
        followUpPromptId: 'lh_01_worry_source',
      },
      {
        id: 'mood_hard',
        text: '힘들어요',
        iconKey: 'wave',
        emotionWeights: { sadnessLoneliness: 1, painSomatic: 1, avoidanceWithdrawal: 1 },
        intensity: 2,
        concernFlags: ['distress_present'],
        protectiveFactors: ['emotion_named'],
        npcResponse: ['말해줘서 고맙구나.'],
        followUpPromptId: 'lh_02_hard_part',
      },
    ],
    secondaryAction: globalRestTodayChoice,
  },
  {
    id: 'lh_01_worry_source',
    mode: 'PLAYER_CHOICE',
    speaker: SPEAKER_YOUNGCHEOL,
    nameplate: SPEAKER_YOUNGCHEOL,
    questionText: '무엇이 가장 걱정되니?',
    maxChoices: 3,
    engagement: playerChoiceEngagement,
    npcLines: ['무엇이 가장 걱정되니?'],
    choices: [
      {
        id: 'worry_pain',
        text: '아픈 게 걱정돼요',
        iconKey: 'bandage',
        emotionWeights: { anxietyFear: 2, painSomatic: 2 },
        intensity: 3,
        concernFlags: ['pain_concern', 'procedure_fear'],
        protectiveFactors: ['can_name_fear'],
        npcResponse: ['아픈 게 걱정될 수 있지.', '선생님께 말해도 괜찮아.'],
        followUpPromptId: 'lh_04_support_choice',
      },
      {
        id: 'worry_unknown',
        text: '잘 모르겠어요',
        iconKey: 'fog',
        emotionWeights: { anxietyFear: 2, informationNeed: 2 },
        intensity: 2,
        concernFlags: ['uncertainty'],
        protectiveFactors: ['information_need_named'],
        npcResponse: ['잘 모를 때 더 답답할 수 있단다.'],
        followUpPromptId: 'lh_04_support_choice',
      },
      {
        id: 'worry_family',
        text: '가족이 걱정돼요',
        iconKey: 'heart',
        emotionWeights: { parentConcern: 3, anxietyFear: 1 },
        intensity: 3,
        concernFlags: ['parent_concern'],
        protectiveFactors: ['empathy'],
        npcResponse: ['가족을 많이 아끼는구나.'],
        followUpPromptId: 'lh_04_support_choice',
      },
    ],
    secondaryAction: createRestAction('rest_from_worry_source'),
  },
  {
    id: 'lh_02_hard_part',
    mode: 'PLAYER_CHOICE',
    speaker: SPEAKER_YOUNGCHEOL,
    nameplate: SPEAKER_YOUNGCHEOL,
    questionText: '지금 가장 힘든 건 뭐니?',
    maxChoices: 3,
    engagement: playerChoiceEngagement,
    npcLines: ['지금 가장 힘든 건 뭐니?'],
    choices: [
      {
        id: 'hard_body',
        text: '몸이 힘들어요',
        iconKey: 'bandage',
        emotionWeights: { painSomatic: 3, sadnessLoneliness: 1 },
        intensity: 3,
        concernFlags: ['body_discomfort'],
        protectiveFactors: ['body_state_named'],
        npcResponse: ['몸이 힘들면 마음도 지치기 쉽지.'],
        followUpPromptId: 'lh_04_support_choice',
      },
      {
        id: 'hard_lonely',
        text: '외로워요',
        iconKey: 'friend',
        emotionWeights: { sadnessLoneliness: 3, avoidanceWithdrawal: 1 },
        intensity: 3,
        concernFlags: ['loneliness'],
        protectiveFactors: ['emotion_named'],
        npcResponse: ['혼자 있는 것처럼 느껴졌구나.'],
        followUpPromptId: 'lh_04_support_choice',
      },
      {
        id: 'hard_angry',
        text: '화가 나요',
        iconKey: 'wave',
        emotionWeights: { angerFrustration: 3 },
        intensity: 2,
        concernFlags: ['anger_or_frustration'],
        protectiveFactors: ['emotion_named'],
        npcResponse: ['화나는 마음도 말해도 괜찮아.'],
        followUpPromptId: 'lh_04_support_choice',
      },
    ],
    secondaryAction: createRestAction('rest_from_hard_part', ['오늘은 쉬어도 괜찮단다.']),
  },
  {
    id: 'lh_03_small_action',
    mode: 'PLAYER_CHOICE',
    speaker: SPEAKER_YOUNGCHEOL,
    nameplate: SPEAKER_YOUNGCHEOL,
    questionText: '지금 해볼 수 있는 작은 일은?',
    maxChoices: 3,
    engagement: playerChoiceEngagement,
    npcLines: ['지금 해볼 수 있는 작은 일은?'],
    choices: [
      {
        id: 'action_breathe',
        text: '숨을 천천히 쉬어요',
        iconKey: 'anchor',
        emotionWeights: { agencyCoping: 3 },
        intensity: 0,
        concernFlags: [],
        protectiveFactors: ['breathing_coping'],
        npcResponse: ['좋구나. 숨은 작은 닻이 된단다.'],
        followUpPromptId: LIGHTHOUSE_EMOTION_CLOSING_SCENE_ID,
      },
      {
        id: 'action_draw',
        text: '그림을 그려요',
        iconKey: 'lantern',
        emotionWeights: { agencyCoping: 2, supportSeeking: 1 },
        intensity: 0,
        concernFlags: [],
        protectiveFactors: ['creative_expression'],
        npcResponse: ['그림도 마음의 말이 될 수 있지.'],
        followUpPromptId: LIGHTHOUSE_EMOTION_CLOSING_SCENE_ID,
      },
      {
        id: 'action_tell',
        text: '한마디 해볼래요',
        iconKey: 'heart',
        emotionWeights: { supportSeeking: 3, agencyCoping: 1 },
        intensity: 0,
        concernFlags: [],
        protectiveFactors: ['adult_support_plan'],
        npcResponse: ['좋다. 한마디면 충분할 때도 있단다.'],
        followUpPromptId: 'lh_04_support_choice',
      },
    ],
    secondaryAction: createRestAction('rest_from_small_action', ['오늘은 여기까지 쉬자꾸나.']),
  },
  {
    id: 'lh_04_support_choice',
    mode: 'PLAYER_CHOICE',
    speaker: SPEAKER_YOUNGCHEOL,
    nameplate: SPEAKER_YOUNGCHEOL,
    questionText: '어떻게 도움을 받아볼까?',
    maxChoices: 3,
    engagement: playerChoiceEngagement,
    npcLines: ['어떻게 도움을 받아볼까?'],
    choices: [
      {
        id: 'support_family',
        text: '가족에게 말할래요',
        iconKey: 'heart',
        emotionWeights: { supportSeeking: 3 },
        intensity: 0,
        concernFlags: [],
        protectiveFactors: ['family_support_preference'],
        npcResponse: ['가족에게 한마디 건네보자.'],
        followUpPromptId: LIGHTHOUSE_EMOTION_CLOSING_SCENE_ID,
      },
      {
        id: 'support_medical',
        text: '선생님께 말할래요',
        iconKey: 'bandage',
        emotionWeights: { supportSeeking: 2, informationNeed: 2 },
        intensity: 0,
        concernFlags: [],
        protectiveFactors: ['medical_support_preference'],
        npcResponse: ['선생님께 말해도 된단다.'],
        followUpPromptId: LIGHTHOUSE_EMOTION_CLOSING_SCENE_ID,
      },
      {
        id: 'support_draw',
        text: '그림으로 전할래요',
        iconKey: 'lantern',
        emotionWeights: { supportSeeking: 1, agencyCoping: 2 },
        intensity: 0,
        concernFlags: ['prefers_nonverbal_expression'],
        protectiveFactors: ['alternative_expression'],
        npcResponse: ['말이 어려우면 그림도 좋단다.'],
        followUpPromptId: LIGHTHOUSE_EMOTION_CLOSING_SCENE_ID,
      },
    ],
    secondaryAction: createRestAction('rest_from_support_choice'),
  },
  {
    id: LIGHTHOUSE_EMOTION_CLOSING_SCENE_ID,
    mode: 'NPC_DIALOGUE',
    speaker: SPEAKER_YOUNGCHEOL,
    nameplate: SPEAKER_YOUNGCHEOL,
    npcLines: ['오늘 말해줘서 고맙구나.', '등대 불은 여기 켜두마.'],
    engagement: closingEngagement,
    onComplete: {
      action: 'FINISH_EMOTION_CHECKIN',
    },
  },
  {
    id: LIGHTHOUSE_REST_CLOSING_SCENE_ID,
    mode: 'NPC_DIALOGUE',
    speaker: SPEAKER_YOUNGCHEOL,
    nameplate: SPEAKER_YOUNGCHEOL,
    npcLines: ['오늘은 쉬어도 괜찮단다.', '등대 불은 조용히 켜두마.'],
    engagement: closingEngagement,
    onComplete: {
      action: 'FINISH_EMOTION_CHECKIN',
    },
  },
]

const lighthouseEmotionSceneById = new Map(
  lighthouseShortEmotionDialogue.map(scene => [scene.id, scene]),
)

export function getLighthouseEmotionScene(id: string) {
  return lighthouseEmotionSceneById.get(id) ?? null
}

export function getVisibleChoices(scene: LighthouseEmotionScene) {
  if (scene.mode !== 'PLAYER_CHOICE') return []
  return (scene.choices ?? []).slice(0, scene.maxChoices ?? 3)
}

export function getSecondaryAction(scene: LighthouseEmotionScene) {
  return scene.mode === 'PLAYER_CHOICE' ? (scene.secondaryAction ?? null) : null
}

export function getChoiceDisplayText(choice: LighthouseEmotionChoice) {
  return choice.text
}

export function getQuestionDisplayText(scene: LighthouseEmotionScene) {
  return scene.questionText ?? scene.npcLines.at(-1) ?? ''
}

export function validateDialogueGraph(
  scenes: LighthouseEmotionScene[] = lighthouseShortEmotionDialogue,
) {
  const issues: DialogueGraphValidationIssue[] = []
  const sceneIds = new Set<string>()
  const forbiddenDisplayPattern =
    /\b(iconKey|choiceId|sceneId|emotionWeights|intensity|concernFlags|protectiveFactors|animationKey|spriteKey)\b/

  scenes.forEach(scene => {
    if (sceneIds.has(scene.id)) {
      issues.push({ sceneId: scene.id, message: 'Duplicate scene id.' })
    }
    sceneIds.add(scene.id)
  })

  scenes.forEach(scene => {
    if (scene.mode === 'PLAYER_CHOICE') {
      const choices = getVisibleChoices(scene)
      const secondaryAction = getSecondaryAction(scene)
      if (!scene.questionText?.trim()) {
        issues.push({ sceneId: scene.id, message: 'PLAYER_CHOICE scene is missing questionText.' })
      }
      if (choices.length < 1 || choices.length > 3) {
        issues.push({ sceneId: scene.id, message: 'PLAYER_CHOICE scene must show 1-3 choices.' })
      }
      if (!secondaryAction) {
        issues.push({
          sceneId: scene.id,
          message: 'PLAYER_CHOICE scene is missing secondaryAction.',
        })
      } else if (secondaryAction.followUpPromptId !== LIGHTHOUSE_REST_CLOSING_SCENE_ID) {
        issues.push({
          sceneId: scene.id,
          message: `Secondary action must route to ${LIGHTHOUSE_REST_CLOSING_SCENE_ID}.`,
        })
      }
      ;[...choices, ...(secondaryAction ? [secondaryAction] : [])].forEach(choice => {
        if (!choice.text.trim()) {
          issues.push({ sceneId: scene.id, message: `Choice ${choice.id} has empty text.` })
        }
        if (forbiddenDisplayPattern.test(choice.text)) {
          issues.push({
            sceneId: scene.id,
            message: `Choice ${choice.id} exposes an internal key.`,
          })
        }
        if (choice.followUpPromptId && !sceneIds.has(choice.followUpPromptId)) {
          issues.push({
            sceneId: scene.id,
            message: `Choice ${choice.id} points to a missing scene: ${choice.followUpPromptId}.`,
          })
        }
        if (!choice.followUpPromptId) {
          issues.push({
            sceneId: scene.id,
            message: `Choice ${choice.id} has no followUpPromptId.`,
          })
        }
      })
    }

    if (scene.npcLines.some(line => forbiddenDisplayPattern.test(line))) {
      issues.push({ sceneId: scene.id, message: 'NPC line exposes an internal key.' })
    }

    if (
      scene.mode === 'NPC_DIALOGUE' &&
      (scene.id === LIGHTHOUSE_EMOTION_CLOSING_SCENE_ID ||
        scene.id === LIGHTHOUSE_REST_CLOSING_SCENE_ID) &&
      scene.onComplete?.action !== 'FINISH_EMOTION_CHECKIN'
    ) {
      issues.push({ sceneId: scene.id, message: 'Closing scene must finish emotion check-in.' })
    }
  })

  const terminalSceneIds = new Set(
    scenes
      .filter(scene => scene.onComplete?.action === 'FINISH_EMOTION_CHECKIN')
      .map(scene => scene.id),
  )
  const reachableSceneIds = new Set<string>()
  const visit = (sceneId: string, path: string[]) => {
    if (path.includes(sceneId)) {
      issues.push({ sceneId, message: `Cycle detected: ${[...path, sceneId].join(' -> ')}` })
      return
    }
    const scene = scenes.find(item => item.id === sceneId)
    if (!scene) return
    reachableSceneIds.add(sceneId)
    if (terminalSceneIds.has(sceneId)) return

    const nextIds =
      scene.mode === 'PLAYER_CHOICE'
        ? [...getVisibleChoices(scene), ...(scene.secondaryAction ? [scene.secondaryAction] : [])]
            .map(choice => choice.followUpPromptId)
            .filter((id): id is string => Boolean(id))
        : []

    if (nextIds.length === 0) {
      issues.push({ sceneId, message: 'Non-terminal scene does not reach FINISH_EMOTION_CHECKIN.' })
      return
    }
    nextIds.forEach(nextId => visit(nextId, [...path, sceneId]))
  }

  visit(LIGHTHOUSE_EMOTION_START_SCENE_ID, [])
  scenes.forEach(scene => {
    if (!reachableSceneIds.has(scene.id)) {
      issues.push({ sceneId: scene.id, message: 'Scene is not reachable from the check-in start.' })
    }
  })

  return issues
}

export function logDialogueGraphForReview(
  scenes: LighthouseEmotionScene[] = lighthouseShortEmotionDialogue,
) {
  scenes
    .filter(scene => scene.mode === 'PLAYER_CHOICE')
    .forEach(scene => {
      const choices = [
        ...getVisibleChoices(scene),
        ...(scene.secondaryAction ? [scene.secondaryAction] : []),
      ]
      console.info(
        `[lighthouse-dialogue] ${scene.id}: ${getQuestionDisplayText(scene)} -> ${choices
          .map(choice => choice.text)
          .join(' / ')}`,
      )
    })
}
