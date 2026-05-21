import type { FrontNpcId } from '../npcIdentity'

export type VillagerNpcId =
  | 'nurse_bunny'
  | 'sleepy_sheep'
  | 'gardener_bear'
  | 'monkey_friend'
  | 'squirrel_friend'
  | 'dain'

export type BackendNpcName = 'JOEUN' | 'GEONBIN' | 'JEONGHO' | 'SEORIN' | 'SEHYEON' | 'DAIN'

export interface VillagerIdentity {
  npcId: VillagerNpcId
  displayName: string
  backendNpcName: BackendNpcName
}

export type VillagerDialogueStatus =
  | 'idle'
  | 'opening_greeting'
  | 'showing_question'
  | 'waiting_choice'
  | 'submitting_choice'
  | 'showing_response'
  | 'waiting_final_close'
  | 'finished'
  | 'error'

export type CounselingEndingType =
  | 'GO_LIGHT_ACTIVITY'
  | 'REST_THEN_ACTIVITY'
  | 'REST_ONLY'
  | 'ASK_HELP_FIRST'
  | 'ASK_ADULT_FIRST'
  | 'ASK_MEDICAL_FIRST'
  | 'EXPRESS_WITH_DRAWING'
  | 'SOCIAL_CONNECT'
  | 'PRIVATE_OKAY'
  | 'CALM_DOWN'
  | 'NO_PRESSURE'

export type VillagerLineKey =
  | 'entry_rest'
  | 'entry_activity'
  | 'entry_talk'
  | 'rest_quiet'
  | 'rest_eyes'
  | 'rest_family'
  | 'activity_music'
  | 'activity_art'
  | 'activity_move'
  | 'talk_body'
  | 'talk_peer'
  | 'talk_worry'
  | 'body_okay'
  | 'body_tired'
  | 'body_pain_worry'
  | 'body_rest_quiet'
  | 'body_family_near'
  | 'body_tell_adult'
  | 'pain_tell_teacher'
  | 'pain_point_place'
  | 'pain_hold_hand'
  | 'peer_miss'
  | 'peer_draw'
  | 'peer_later'
  | 'school_curious'
  | 'school_ask_family'
  | 'school_ask_friend'
  | 'school_later'
  | 'worry_hospital'
  | 'worry_family'
  | 'worry_upset'
  | 'hospital_injection'
  | 'hospital_unknown'
  | 'hospital_okay'
  | 'hospital_family_near'
  | 'hospital_teacher_explain'
  | 'hospital_hold_hand'
  | 'hospital_ask_teacher'
  | 'hospital_ask_family'
  | 'hospital_draw_question'
  | 'family_say_worry'
  | 'family_tell_teacher'
  | 'family_show_drawing'
  | 'anger_pause'
  | 'anger_say_upset'
  | 'anger_call_help'
  | 'expression_words'
  | 'expression_drawing'

export interface DailyActivityState {
  completedActivityCount: number
  hasDoneAnyActivityToday: boolean
  hasCompletedAllRecommendedActivities?: boolean
  recommendedActivityLabel?: string
}

export interface CounselingChoice {
  choiceIntentId: string
  text: string
  nextNodeId: string | null
  endAfterSelect?: boolean
  intensity: 0 | 1 | 2 | 3
  concernFlags: string[]
  protectiveFactors: string[]
  responseKey?: VillagerLineKey
  fallbackResponseLines: string[]
  responseLines?: string[]
  endingType?: CounselingEndingType
  endingLines?: string[]
  activityEndingLines?: {
    pending: string[]
    completed: string[]
  }
}

export interface CounselingNode {
  nodeId: string
  questionText: string
  choices: CounselingChoice[]
}

export interface CounselingScript {
  scriptId: string
  title: string
  domain?: 'body' | 'pain' | 'fatigue' | 'family' | 'peer' | 'expression' | 'anger'
  weight?: number
  fallbackEndingLine?: string
  startNodeId: string
  nodes: Record<string, CounselingNode>
}

export type VillagerChoice = CounselingChoice
export type VillagerDialogueNode = CounselingNode

export interface VillagerDialogueScript extends VillagerIdentity {
  theme: string
}

export interface VillagerChoiceEvent {
  sessionId: string | number
  clientEventId?: string
  npcId: FrontNpcId
  displayName: string
  npcName: BackendNpcName
  topicId?: string
  sceneId: string
  nodeId?: string
  questionText: string
  choiceIntentId: string
  choiceText: string
  intensity: 0 | 1 | 2 | 3
  concernFlags: string[]
  protectiveFactors: string[]
  generatedBy: 'STATIC' | 'CLAUDE' | 'FALLBACK'
  createdAt: string
}

export type VillagerDialogueOpenPayload = {
  npcId: VillagerNpcId
}
