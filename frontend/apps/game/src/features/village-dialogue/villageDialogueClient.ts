import type { VillagerChoiceEvent } from './types'
import type { VillageDialogueNpcEnum } from './npcMapping'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api/v1'
const ACCESS_TOKEN_STORAGE_KEY = 'wish_access_token'
const LOCAL_STORAGE_KEY = 'villager_dialogue_events'
const LOCAL_SESSION_STORAGE_KEY = 'villager_dialogue_sessions'

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY)
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export type VillageDialogueSessionStatus = 'IN_PROGRESS' | 'FINISHED' | 'CANCELLED'

/** BE 가 내려주는 한 화면 (마을 NPC catalog 기반, B2 이후). */
export type VillageScene = {
  questionText: string
  choices: Array<{ choiceIntentId: string; text: string }>
  secondaryAction: { choiceIntentId: string; text: string } | null
  shouldEndSession: boolean
  generatedBy: 'NPC_SCRIPT' | 'FALLBACK' | 'CLAUDE'
  npcResponse: string[]
}

export type StartVillageDialogueSessionResponse = {
  sessionId: number
  status: VillageDialogueSessionStatus
  /** BE catalog 기반 첫 화면. 등대지기는 null. */
  scene: VillageScene | null
}

type StartApiResponse = {
  code: string
  message: string
  data: {
    sessionId: number
    status: VillageDialogueSessionStatus
    scene: VillageScene | null
  } | null
}

export async function startVillageDialogueSession(
  patientProfileId: number,
  npcName: VillageDialogueNpcEnum,
): Promise<StartVillageDialogueSessionResponse> {
  const response = await fetch(`${API_BASE_URL}/dialogue/sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ patientProfileId, npcName }),
  })

  if (!response.ok) {
    throw new Error('대화 세션을 시작하지 못했습니다.')
  }

  const payload = (await response.json()) as StartApiResponse
  if (!payload.data?.sessionId) {
    throw new Error('대화 세션 응답이 올바르지 않습니다.')
  }

  return {
    sessionId: payload.data.sessionId,
    status: payload.data.status,
    scene: payload.data.scene ?? null,
  }
}

/**
 * B2 카탈로그 기반 turn 제출. 마을 NPC 경로에선 BE 가 catalog 에서 임상 메타를 채우므로 FE 는 choiceIntentId 만 보내면 된다.
 *
 * <p>응답에서 {@code nextScene} 을 받아 화면에 그대로 렌더. {@code shouldEndSession=true} 이면 catalog 의 ending
 * 라인이 함께 내려온다 (npcResponse 에 closingLine 포함).
 */
export async function submitVillageTurnCatalog(
  sessionId: number,
  choiceIntentId: string,
  /** FE 가 echo 하는 직전 질문 (BE 가 그대로 영속). */
  questionText: string,
  /** FE 가 렌더했던 선택지 텍스트 (BE 가 catalog 값으로 override 하지만 호환 위해 보냄). */
  choiceText: string,
): Promise<{ nextScene: VillageScene }> {
  const response = await fetch(`${API_BASE_URL}/dialogue/sessions/${sessionId}/turns`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({
      questionText,
      selectedChoice: {
        choiceIntentId,
        text: choiceText,
        intensity: 0,
        concernFlags: [],
        protectiveFactors: [],
      },
    }),
  })

  if (!response.ok) {
    throw new Error('대화 턴 제출에 실패했습니다.')
  }

  const payload = (await response.json()) as {
    code: string
    data: { nextScene: VillageScene | null } | null
  }
  if (!payload.data?.nextScene) {
    throw new Error('다음 화면 응답이 비어있습니다.')
  }
  return { nextScene: payload.data.nextScene }
}

export async function saveVillagerChoiceEvent(event: VillagerChoiceEvent) {
  const mode = import.meta.env.VITE_VILLAGE_DIALOGUE_SAVE_MODE ?? 'local'

  if (mode === 'backend' || typeof event.sessionId === 'number') {
    const response = await fetch(`${API_BASE_URL}/dialogue/sessions/${event.sessionId}/turns`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify({
        clientEventId: event.clientEventId,
        npcId: event.npcId,
        npcName: event.npcName,
        topicId: event.topicId,
        sceneId: event.sceneId,
        nodeId: event.nodeId,
        questionText: event.questionText,
        selectedChoice: {
          choiceIntentId: event.choiceIntentId,
          text: event.choiceText,
          intensity: event.intensity,
          concernFlags: event.concernFlags,
          protectiveFactors: event.protectiveFactors,
        },
        generatedBy: event.generatedBy,
      }),
    })

    if (!response.ok) {
      throw new Error('대화 선택을 저장하지 못했습니다.')
    }

    return
  }

  const prev = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) ?? '[]') as VillagerChoiceEvent[]
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify([...prev, event]))
}

export type VillageDialogueFinishReason = 'COMPLETED' | 'CANCELLED' | 'ERROR'

export async function finishVillageDialogueSession(
  sessionId: number,
  finishReason: VillageDialogueFinishReason,
) {
  const response = await fetch(`${API_BASE_URL}/dialogue/sessions/${sessionId}/finish`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ finishReason }),
  })

  if (!response.ok) {
    throw new Error('대화 세션을 종료하지 못했습니다.')
  }
}

export async function cancelVillagerDialogueSession(sessionId: string | number) {
  if (typeof sessionId === 'number') {
    await finishVillageDialogueSession(sessionId, 'CANCELLED')
    return
  }

  const prev = JSON.parse(localStorage.getItem(LOCAL_SESSION_STORAGE_KEY) ?? '[]') as Array<{
    sessionId: string
    status: string
    finishedAt: string
  }>
  localStorage.setItem(
    LOCAL_SESSION_STORAGE_KEY,
    JSON.stringify([
      ...prev,
      {
        sessionId,
        status: 'CANCELLED',
        finishedAt: new Date().toISOString(),
      },
    ]),
  )
}
