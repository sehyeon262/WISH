import type { BackendNpcName, FrontNpcId } from '../npcIdentity'

export type LighthouseDialogueStatus =
  | 'idle'
  | 'opening_welcome'
  | 'opening_safe_line'
  | 'entry_question'
  | 'waiting_user_speech'
  | 'submitting_chat'
  | 'showing_response'
  | 'waiting_final_close'
  | 'finished'

export type LighthouseChatRole = 'user' | 'assistant'

export interface LighthouseChatHistoryItem {
  role: LighthouseChatRole
  content: string
}

export interface LighthouseChatRequest {
  patientProfileId: number
  userMessage: string
  conversationHistory: LighthouseChatHistoryItem[]
}

export interface LighthouseChatResponse {
  npcMessage: string
  isFallback: boolean
}

export interface LighthouseChatApiResponse {
  npc_message: string
  is_fallback: boolean
}

export interface SubmitLighthouseChatTurnRequest {
  questionText: string
  userMessage: string
  npcResponseText: string
  isFallback: boolean
}

export interface EmotionChoiceViewModel {
  choiceIntentId: string
  text: string
  nextNodeId?: string | null
  endAfterSelect?: boolean
  responseLines?: string[]
  intensity?: number
  concernFlags?: string[]
  protectiveFactors?: string[]
}

export interface EmotionSceneViewModel {
  sceneId?: string | null
  questionText: string
  choices: EmotionChoiceViewModel[]
  secondaryAction: EmotionChoiceViewModel | null
  shouldEndSession: boolean
  reasonCode?: string
  generatedBy?: 'CLAUDE' | 'FALLBACK' | 'STATIC'
}

export interface StartLighthouseEmotionRequest {
  patientProfileId: number
  npcName: Extract<BackendNpcName, 'YEONGCHEOL'>
}

export interface StartLighthouseEmotionResponse {
  sessionId: string
  status: 'IN_PROGRESS' | 'FINISHED' | 'CANCELLED'
  scene: EmotionSceneViewModel
}

export interface StartLighthouseEmotionApiResponse {
  code: string
  message: string
  data: {
    sessionId: number
    status: 'IN_PROGRESS' | 'FINISHED' | 'CANCELLED'
    scene: EmotionSceneViewModel | null
  }
  errors?: Record<string, string>
}

export interface DailyActivityState {
  hasDoneAnyActivityToday: boolean
  completedActivityCount: number
  recommendedActivityLabel?: string
}

export interface SubmitLighthouseTurnRequest {
  questionText: string
  selectedChoice: EmotionChoiceViewModel
  route?: string
  historyIntentIds?: string[]
  previousQuestionTexts?: string[]
  dailyActivityState?: DailyActivityState
}

export interface SubmitLighthouseTurnResponse {
  npcResponse?: string[]
  nextScene: EmotionSceneViewModel
  closingLines?: string[]
}

export interface SubmitLighthouseTurnApiResponse {
  code: string
  message: string
  data: {
    sessionId: number
    status: 'IN_PROGRESS' | 'FINISHED' | 'CANCELLED'
    nextScene: EmotionSceneViewModel
    npcResponse?: string[]
    closingLines?: string[]
  } | null
  errors?: Record<string, string>
}

export interface FinishLighthouseEmotionRequest {
  finishReason: 'COMPLETED' | 'REST_TODAY' | 'TIMEOUT'
}

export interface FinishLighthouseEmotionResponse {
  sessionId: string
  status: 'IN_PROGRESS' | 'FINISHED' | 'CANCELLED'
  closingLines: string[]
  reportUpdated?: boolean
}

export interface DialogueTurnDetail {
  id: number
  stepIndex: number
  questionText: string
  choiceIntentId: string
  choiceText: string
  intensity: number
  concernFlags: string[]
  protectiveFactors: string[]
  generatedBy: 'CLAUDE' | 'FALLBACK' | 'STATIC'
  createdAt: string
}

export interface DialogueSessionDetail {
  sessionId: number
  patientProfileId: number
  npcId?: FrontNpcId
  npcName: BackendNpcName | string
  status: 'IN_PROGRESS' | 'FINISHED' | 'CANCELLED'
  stepCount: number
  maxSteps: number
  finishReason: FinishLighthouseEmotionRequest['finishReason'] | null
  startedAt: string
  endedAt: string | null
  turns: DialogueTurnDetail[]
}

export interface DialogueSessionDetailApiResponse {
  code: string
  message: string
  data: DialogueSessionDetail | null
  errors?: Record<string, string>
}

export interface FinishLighthouseEmotionApiResponse {
  code: string
  message: string
  data: {
    sessionId: number
    status: 'IN_PROGRESS' | 'FINISHED' | 'CANCELLED'
    closingLines: string[]
  } | null
  errors?: Record<string, string>
}

export interface LighthouseEmotionState {
  sessionId: string | null
  status: LighthouseDialogueStatus
  currentQuestionText: string
  npcResponseLines: string[]
  closingLines: string[]
  conversationHistory: LighthouseChatHistoryItem[]
  isFallback: boolean
  errorMessage: string | null
  stepCount: number
}
