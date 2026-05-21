import { getNpcIdentity } from '../npcIdentity'
import type {
  DialogueSessionDetail,
  DialogueSessionDetailApiResponse,
  EmotionChoiceViewModel,
  EmotionSceneViewModel,
  FinishLighthouseEmotionApiResponse,
  FinishLighthouseEmotionRequest,
  FinishLighthouseEmotionResponse,
  LighthouseChatApiResponse,
  LighthouseChatHistoryItem,
  LighthouseChatResponse,
  StartLighthouseEmotionApiResponse,
  StartLighthouseEmotionResponse,
  SubmitLighthouseChatTurnRequest,
  SubmitLighthouseTurnApiResponse,
  SubmitLighthouseTurnRequest,
  SubmitLighthouseTurnResponse,
} from './types'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api/v1'
const AI_BASE_URL = import.meta.env.VITE_AI_BASE_URL ?? '/ai-api'

export const FREE_INPUT_CHOICE_INTENT_ID = 'FREE_INPUT'
export const MAX_USER_MESSAGE_LENGTH = 500
export const MAX_CONVERSATION_HISTORY_TURNS = 20
const LIGHTHOUSE_IDENTITY = getNpcIdentity('lighthouse_keeper')
const ACCESS_TOKEN_STORAGE_KEY = 'wish_access_token'
const DIALOGUE_SESSION_DETAIL_ERROR_MESSAGE = 'Dialogue session detail response is invalid.'

type LighthouseFreeInputSignal = Required<
  Pick<
    EmotionChoiceViewModel,
    'choiceIntentId' | 'intensity' | 'concernFlags' | 'protectiveFactors'
  >
>

type LighthouseFreeInputSignalRule = LighthouseFreeInputSignal & {
  patterns: RegExp[]
}

const DEFAULT_FREE_INPUT_SIGNAL: LighthouseFreeInputSignal = {
  choiceIntentId: 'entry_talk',
  intensity: 0,
  concernFlags: [],
  protectiveFactors: ['verbal_expression'],
}

const LIGHTHOUSE_FREE_INPUT_SIGNAL_RULES: LighthouseFreeInputSignalRule[] = [
  {
    choiceIntentId: 'worry_pain',
    intensity: 3,
    concernFlags: ['pain_concern', 'procedure_fear'],
    protectiveFactors: ['can_name_fear', 'verbal_expression'],
    patterns: [
      /\uC8FC\uC0AC|\uBC14\uB298|\uC218\uC220|\uC2DC\uC220|\uAC80\uC0AC|\uCE58\uB8CC/,
      /\binjection|needle|surgery|procedure|treatment|test\b/i,
    ],
  },
  {
    choiceIntentId: 'hard_body',
    intensity: 3,
    concernFlags: ['body_discomfort'],
    protectiveFactors: ['body_state_named', 'verbal_expression'],
    patterns: [
      /\uC544\uD30C|\uD1B5\uC99D|\uBC30|\uBA38\uB9AC|\uC5B4\uC9C0\uB7EC|\uC18D\uC774|\uD1A0\uD560|\uC5F4\uC774/,
      /\bpain|hurt|sick|dizzy|nausea|ache|stomach|headache|fever\b/i,
    ],
  },
  {
    choiceIntentId: 'body_tired',
    intensity: 2,
    concernFlags: ['fatigue_present', 'body_discomfort'],
    protectiveFactors: ['body_state_named', 'rest_need_named', 'verbal_expression'],
    patterns: [
      /\uD53C\uACE4|\uC9C0\uCCD0|\uC878\uB824|\uC7A0|\uD798\uC5C6|\uC26C\uACE0/,
      /\btired|sleepy|exhausted|rest|sleep\b/i,
    ],
  },
  {
    choiceIntentId: 'worry_family',
    intensity: 3,
    concernFlags: ['family_worry', 'parent_concern'],
    protectiveFactors: ['relationship_named', 'empathy', 'verbal_expression'],
    patterns: [
      /(?:\uC5C4\uB9C8|\uC544\uBE60|\uAC00\uC871|\uBD80\uBAA8|\uD560\uBA38\uB2C8|\uD560\uC544\uBC84\uC9C0).*(?:\uAC71\uC815|\uBD88\uC548|\uBCF4\uACE0\uC2F6)|(?:\uAC71\uC815|\uBD88\uC548|\uBCF4\uACE0\uC2F6).*(?:\uC5C4\uB9C8|\uC544\uBE60|\uAC00\uC871|\uBD80\uBAA8|\uD560\uBA38\uB2C8|\uD560\uC544\uBC84\uC9C0)/,
      /(?:mom|mother|dad|father|parent|family|grandma|grandpa).*(?:worry|worried|miss|anxious)|(?:worry|worried|miss|anxious).*(?:mom|mother|dad|father|parent|family|grandma|grandpa)/i,
    ],
  },
  {
    choiceIntentId: 'support_family',
    intensity: 0,
    concernFlags: [],
    protectiveFactors: ['family_support_preference', 'support_need_named', 'verbal_expression'],
    patterns: [
      /\uC5C4\uB9C8|\uC544\uBE60|\uAC00\uC871|\uBD80\uBAA8|\uD560\uBA38\uB2C8|\uD560\uC544\uBC84\uC9C0/,
      /\bmom|mother|dad|father|parent|family|grandma|grandpa\b/i,
    ],
  },
  {
    choiceIntentId: 'hard_lonely',
    intensity: 3,
    concernFlags: ['loneliness'],
    protectiveFactors: ['emotion_named', 'relationship_named', 'verbal_expression'],
    patterns: [
      /\uC678\uB85C|\uD63C\uC790|\uCE5C\uAD6C|\uBCF4\uACE0\uC2F6|\uD559\uAD50/,
      /\blonely|alone|friend|miss|school\b/i,
    ],
  },
  {
    choiceIntentId: 'hard_angry',
    intensity: 2,
    concernFlags: ['anger_or_frustration'],
    protectiveFactors: ['emotion_named', 'verbal_expression'],
    patterns: [
      /\uD654\uB098|\uC9DC\uC99D|\uC2EB\uC5B4|\uC18D\uC0C1|\uC5B5\uC6B8/,
      /\bangry|mad|upset|annoyed|hate|frustrated\b/i,
    ],
  },
  {
    choiceIntentId: 'mood_worried',
    intensity: 2,
    concernFlags: ['worry_present'],
    protectiveFactors: ['emotion_named', 'verbal_expression'],
    patterns: [
      /\uAC71\uC815|\uBD88\uC548|\uBB34\uC11C|\uAC81\uB098/,
      /\bworried|worry|anxious|scared|afraid|fear\b/i,
    ],
  },
  {
    choiceIntentId: 'mood_hard',
    intensity: 2,
    concernFlags: ['distress_present'],
    protectiveFactors: ['emotion_named', 'verbal_expression'],
    patterns: [
      /\uD798\uB4E4|\uC2AC\uD37C|\uC6B8|\uC6B0\uC6B8|\uC18D\uC0C1/,
      /\bhard|sad|cry|stress|distress\b/i,
    ],
  },
  {
    choiceIntentId: 'support_medical',
    intensity: 0,
    concernFlags: [],
    protectiveFactors: ['medical_support_preference', 'information_seeking', 'verbal_expression'],
    patterns: [
      /\uC120\uC0DD\uB2D8|\uC758\uC0AC|\uAC04\uD638|\uBB3C\uC5B4|\uAD81\uAE08|\uC54C\uB824|\uC124\uBA85/,
      /\bteacher|doctor|nurse|ask|explain|curious\b/i,
    ],
  },
  {
    choiceIntentId: 'support_draw',
    intensity: 0,
    concernFlags: ['prefers_nonverbal_expression'],
    protectiveFactors: ['alternative_expression', 'creative_expression', 'verbal_expression'],
    patterns: [
      /\uADF8\uB9BC|\uADF8\uB824|\uB9D0\uB85C\s*\uBABB|\uC4F0\uACE0/,
      /\bdraw|drawing|write|picture\b/i,
    ],
  },
  {
    choiceIntentId: 'action_breathe',
    intensity: 0,
    concernFlags: [],
    protectiveFactors: ['breathing_coping', 'verbal_expression'],
    patterns: [/\uC228|\uD638\uD761/, /\bbreathe|breath\b/i],
  },
  {
    choiceIntentId: 'mood_okay',
    intensity: 0,
    concernFlags: [],
    protectiveFactors: ['positive_mood', 'verbal_expression'],
    patterns: [/\uAD1C\uCC2E|\uC88B|\uC7AC\uBBF8|\uD589\uBCF5/, /\bokay|fine|good|happy|fun\b/i],
  },
]

export const LIGHTHOUSE_ENTRY_QUESTION = '오늘은 기분이 어때?'

export const LIGHTHOUSE_ENTRY_CHOICES: EmotionChoiceViewModel[] = [
  {
    choiceIntentId: 'entry_rest',
    text: '쉬고 싶어요',
    nextNodeId: 'rest_01',
    intensity: 1,
    concernFlags: ['needs_rest'],
    protectiveFactors: ['sets_boundary', 'rest_need_named'],
    responseLines: ['그래, 쉬고 싶은 날도 있지.', '등대 옆에서 잠깐 쉬어가도 괜찮단다.'],
  },
  {
    choiceIntentId: 'entry_activity',
    text: '뭔가 해보고 싶어요',
    nextNodeId: 'activity_01',
    intensity: 0,
    concernFlags: [],
    protectiveFactors: ['agency_coping', 'positive_activity_interest'],
    responseLines: ['좋구나. 아주 가볍게 시작해도 괜찮아.', '등대 불빛처럼 작게 켜보자.'],
  },
  {
    choiceIntentId: 'entry_talk',
    text: '잠깐 얘기하고 싶어요',
    nextNodeId: 'talk_topic_01',
    intensity: 0,
    concernFlags: [],
    protectiveFactors: ['support_seeking', 'verbal_expression'],
    responseLines: ['그래, 길게 말하지 않아도 괜찮단다.', '편한 얘기부터 골라보자.'],
  },
]

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY)
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function fetchWithAuth(url: string, init: RequestInit) {
  return fetch(url, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      ...getAuthHeaders(),
    },
  })
}

export function createLighthouseEntryScene(): EmotionSceneViewModel {
  return {
    sceneId: 'entry_01',
    questionText: LIGHTHOUSE_ENTRY_QUESTION,
    choices: LIGHTHOUSE_ENTRY_CHOICES,
    secondaryAction: null,
    shouldEndSession: false,
    generatedBy: 'STATIC',
  }
}

function normalizeChoice(choice: EmotionChoiceViewModel): EmotionChoiceViewModel {
  return {
    ...choice,
    intensity: choice.intensity ?? 0,
    concernFlags: choice.concernFlags ?? [],
    protectiveFactors: choice.protectiveFactors ?? [],
  }
}

export function classifyLighthouseFreeInputSignal(userMessage: string): LighthouseFreeInputSignal {
  const normalized = userMessage.trim()
  const matchedRule = LIGHTHOUSE_FREE_INPUT_SIGNAL_RULES.find(rule =>
    rule.patterns.some(pattern => pattern.test(normalized)),
  )
  return matchedRule
    ? {
        choiceIntentId: matchedRule.choiceIntentId,
        intensity: matchedRule.intensity,
        concernFlags: matchedRule.concernFlags,
        protectiveFactors: matchedRule.protectiveFactors,
      }
    : DEFAULT_FREE_INPUT_SIGNAL
}

export function sanitizeEmotionScene(
  scene: Partial<EmotionSceneViewModel> | null | undefined,
  useFallback = true,
): EmotionSceneViewModel {
  const fallback = createLighthouseEntryScene()

  if (!scene) {
    return fallback
  }

  const questionText =
    typeof scene.questionText === 'string' && scene.questionText.trim().length > 0
      ? scene.questionText
      : useFallback
        ? fallback.questionText
        : ''

  const choices =
    Array.isArray(scene.choices) && scene.choices.length > 0
      ? scene.choices.slice(0, 3).map(choice => normalizeChoice(choice))
      : useFallback
        ? fallback.choices
        : []

  return {
    sceneId: scene.sceneId,
    questionText,
    choices,
    secondaryAction: null,
    shouldEndSession: Boolean(scene.shouldEndSession),
    generatedBy: scene.generatedBy,
  }
}

export async function startLighthouseEmotionSession(
  patientProfileId: number,
  signal?: AbortSignal,
): Promise<StartLighthouseEmotionResponse> {
  const response = await fetchWithAuth(`${API_BASE_URL}/dialogue/sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      patientProfileId,
      npcId: LIGHTHOUSE_IDENTITY.npcId,
      npcName: LIGHTHOUSE_IDENTITY.backendNpcName,
      mode: 'LIGHTHOUSE_LLM',
    }),
    signal,
  })

  if (!response.ok) {
    throw new Error('Failed to start lighthouse dialogue session.')
  }

  const body = (await response.json()) as StartLighthouseEmotionApiResponse
  if (!body.data || body.data.sessionId === undefined || body.data.sessionId === null) {
    throw new Error('Lighthouse session response is invalid.')
  }

  return {
    sessionId: String(body.data.sessionId),
    status: body.data.status,
    scene: createLighthouseEntryScene(),
  }
}

export async function submitLighthouseEmotionTurn(
  sessionId: string,
  request: SubmitLighthouseTurnRequest,
  signal?: AbortSignal,
): Promise<SubmitLighthouseTurnResponse> {
  const selectedChoice = normalizeChoice(request.selectedChoice)

  const response = await fetchWithAuth(`${API_BASE_URL}/dialogue/sessions/${sessionId}/turns`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      npcId: LIGHTHOUSE_IDENTITY.npcId,
      npcName: LIGHTHOUSE_IDENTITY.backendNpcName,
      questionText: request.questionText,
      selectedChoice: {
        choiceIntentId: selectedChoice.choiceIntentId,
        text: selectedChoice.text,
        intensity: selectedChoice.intensity,
        concernFlags: selectedChoice.concernFlags,
        protectiveFactors: selectedChoice.protectiveFactors,
      },
      route: request.route,
      historyIntentIds: request.historyIntentIds,
      previousQuestionTexts: request.previousQuestionTexts,
      dailyActivityState: request.dailyActivityState,
    }),
    signal,
  })

  if (!response.ok) {
    throw new Error('Failed to submit lighthouse dialogue turn.')
  }

  const body = (await response.json()) as SubmitLighthouseTurnApiResponse
  const data = body.data

  return {
    npcResponse: data?.npcResponse,
    nextScene: data?.nextScene
      ? sanitizeEmotionScene(data.nextScene, false)
      : createLighthouseEntryScene(),
  }
}

export async function finishLighthouseEmotionSession(
  sessionId: string,
  finishReason: FinishLighthouseEmotionRequest['finishReason'] = 'COMPLETED',
  signal?: AbortSignal,
): Promise<FinishLighthouseEmotionResponse> {
  const response = await fetchWithAuth(`${API_BASE_URL}/dialogue/sessions/${sessionId}/finish`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ finishReason }),
    signal,
  })

  if (!response.ok) {
    throw new Error('Failed to finish lighthouse dialogue session.')
  }

  const body = (await response.json()) as FinishLighthouseEmotionApiResponse
  return {
    sessionId: String(body.data?.sessionId ?? sessionId),
    status: body.data?.status ?? 'FINISHED',
    closingLines: body.data?.closingLines ?? [],
  }
}

/**
 * GMS Whisper 프록시 (AI 서버 `/dialogue/transcribe`) 로 오디오 → 텍스트 변환.
 * 빈 텍스트 또는 fallback 응답이면 빈 문자열을 돌려준다. 호출 측이 fallback UX 로 흐르도록.
 */
export async function transcribeLighthouseAudio(
  audio: Blob,
  signal?: AbortSignal,
): Promise<string> {
  const formData = new FormData()
  const filename = audio.type.includes('mp4')
    ? 'audio.mp4'
    : audio.type.includes('ogg')
      ? 'audio.ogg'
      : 'audio.webm'
  formData.append('file', audio, filename)

  const response = await fetch(`${AI_BASE_URL}/dialogue/transcribe`, {
    method: 'POST',
    body: formData,
    signal,
  })

  if (!response.ok) {
    throw new Error('Failed to transcribe lighthouse audio.')
  }

  const body = (await response.json()) as { text?: string; is_fallback?: boolean }
  if (body.is_fallback) return ''
  return typeof body.text === 'string' ? body.text : ''
}

export async function chatWithLighthouseLlm(
  patientProfileId: number,
  userMessage: string,
  conversationHistory: LighthouseChatHistoryItem[],
  signal?: AbortSignal,
): Promise<LighthouseChatResponse> {
  const trimmed = userMessage.trim().slice(0, MAX_USER_MESSAGE_LENGTH)
  const trimmedHistory = conversationHistory.slice(-MAX_CONVERSATION_HISTORY_TURNS)

  const response = await fetch(`${AI_BASE_URL}/dialogue/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      patient_profile_id: patientProfileId,
      user_message: trimmed,
      conversation_history: trimmedHistory.map(item => ({
        role: item.role,
        content: item.content,
      })),
    }),
    signal,
  })

  if (!response.ok) {
    throw new Error('Failed to chat with lighthouse LLM.')
  }

  const body = (await response.json()) as LighthouseChatApiResponse
  return {
    npcMessage: typeof body.npc_message === 'string' ? body.npc_message : '',
    isFallback: Boolean(body.is_fallback),
  }
}

export async function submitLighthouseChatTurn(
  sessionId: string,
  request: SubmitLighthouseChatTurnRequest,
  signal?: AbortSignal,
): Promise<void> {
  const trimmedUserMessage = request.userMessage.trim().slice(0, MAX_USER_MESSAGE_LENGTH)
  const freeInputSignal = classifyLighthouseFreeInputSignal(trimmedUserMessage)

  const response = await fetchWithAuth(`${API_BASE_URL}/dialogue/sessions/${sessionId}/turns`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      npcId: LIGHTHOUSE_IDENTITY.npcId,
      npcName: LIGHTHOUSE_IDENTITY.backendNpcName,
      questionText: request.questionText,
      selectedChoice: {
        choiceIntentId: FREE_INPUT_CHOICE_INTENT_ID,
        text: trimmedUserMessage,
        intensity: freeInputSignal.intensity,
        concernFlags: freeInputSignal.concernFlags,
        protectiveFactors: freeInputSignal.protectiveFactors,
      },
      route: 'free_input',
      npcResponseText: request.npcResponseText,
      generatedBy: request.isFallback ? 'FALLBACK' : 'CLAUDE',
    }),
    signal,
  })

  if (!response.ok) {
    throw new Error('Failed to submit lighthouse chat turn.')
  }
}

export async function getDialogueSessionDetail(
  sessionId: string | number,
): Promise<DialogueSessionDetail> {
  const response = await fetchWithAuth(`${API_BASE_URL}/dialogue/sessions/${sessionId}`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(DIALOGUE_SESSION_DETAIL_ERROR_MESSAGE)
  }

  const body = (await response.json()) as DialogueSessionDetailApiResponse
  if (!body.data) {
    throw new Error(DIALOGUE_SESSION_DETAIL_ERROR_MESSAGE)
  }

  return body.data
}
