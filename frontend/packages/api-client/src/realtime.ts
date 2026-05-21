import { apiClient } from './client'
import type { ApiResponse } from './artworks'
import type {
  GuardianDialogueChoiceTone,
  GuardianDialogueChoiceValence,
  GuardianDialogueNpc,
} from './guardian-dialogue'

// 실시간 모니터링 콘텐츠 타입.
// BE 의 ContentType enum 값(LOGIN 제외) 과 정확히 일치 — enum.name() 으로 직렬화되어 대문자.
export type RealtimeContentType = 'MUSIC' | 'GYMNASTICS' | 'TAEKWONDO' | 'ART'

// LiveKit 토큰 응답 — 게임앱/보호자앱 모두 동일 스키마.
// game-token 호출이든 guardian-token 호출이든 BE 는 같은 record 를 돌려준다.
// contentActive/contentType 는 발급 시점의 콘텐츠 상태 스냅샷으로, 보호자앱이
// 마이크 권한 초기 상태를 결정하는 데 사용된다 (게임앱은 무시해도 됨).
export type LiveKitTokenResponse = {
  loginSessionId: number
  patientProfileId: number
  roomName: string
  livekitUrl: string
  participantIdentity: string
  participantName: string
  token: string
  expiresInSeconds: number
  contentActive: boolean
  contentType: RealtimeContentType | null
}

export type StartContentRequest = {
  contentType: RealtimeContentType
}

// /realtime/events SSE 채널 이벤트.
// BE 의 RealtimeEventType enum 과 매핑.
// CONNECTED 는 subscribe 직후 BE 가 즉시 emit 하는 first-event — 연결 확인용으로만 사용.
// 모든 이벤트에 occurredAt(LocalDateTime ISO 문자열) 이 포함된다.
export type RealtimeEvent =
  | {
      type: 'CONNECTED'
      occurredAt: string
    }
  | {
      type: 'GAME_STARTED'
      loginSessionId: number
      patientProfileId: number
      patientName: string
      occurredAt: string
    }
  | {
      type: 'GAME_ENDED'
      loginSessionId: number
      patientProfileId: number
      occurredAt: string
    }
  | {
      type: 'CONTENT_STARTED'
      loginSessionId: number
      patientProfileId: number
      contentType: RealtimeContentType
      occurredAt: string
    }
  | {
      type: 'CONTENT_ENDED'
      loginSessionId: number
      patientProfileId: number
      contentType: RealtimeContentType
      occurredAt: string
    }
  | {
      type: 'DIALOGUE_EMOTION_UPDATED'
      patientProfileId: number
      dialogueSessionId: number
      npcName: GuardianDialogueNpc
      overallValence: GuardianDialogueChoiceValence
      tone: GuardianDialogueChoiceTone
      intensity: number
      guardianMessage: string | null
      occurredAt: string
    }

export type GamePresenceEvent = {
  type: 'WATCHER_COUNT_CHANGED'
  loginSessionId: number
  watcherCount: number
  occurredAt: string
}

export type ActiveLiveSessionResponse = {
  loginSessionId: number
  patientProfileId: number
  patientName: string
  contentActive: boolean
  contentType: RealtimeContentType | null
}

type OptionalDataApiResponse<T> = Omit<ApiResponse<T>, 'data'> & {
  data?: T | null
}

const KNOWN_EVENT_TYPES: ReadonlySet<RealtimeEvent['type']> = new Set([
  'CONNECTED',
  'GAME_STARTED',
  'GAME_ENDED',
  'CONTENT_STARTED',
  'CONTENT_ENDED',
  'DIALOGUE_EMOTION_UPDATED',
])

const KNOWN_GAME_PRESENCE_EVENT_TYPES: ReadonlySet<GamePresenceEvent['type']> = new Set([
  'WATCHER_COUNT_CHANGED',
])

export async function requestGameLivekitToken(loginSessionId: number) {
  const response = await apiClient.post<ApiResponse<LiveKitTokenResponse>>(
    `/realtime/login-sessions/${loginSessionId}/game-token`,
  )
  return response.data
}

export async function requestGuardianLivekitToken(loginSessionId: number) {
  const response = await apiClient.post<ApiResponse<LiveKitTokenResponse>>(
    `/realtime/login-sessions/${loginSessionId}/guardian-token`,
  )
  return response.data
}

export async function getActiveLiveSession(options?: {
  signal?: AbortSignal
}): Promise<ActiveLiveSessionResponse | null> {
  const response = await apiClient.get<OptionalDataApiResponse<ActiveLiveSessionResponse>>(
    '/realtime/active-login-session',
    {
      signal: options?.signal,
    },
  )
  return response.data.data ?? null
}

export async function startContent(loginSessionId: number, request: StartContentRequest) {
  const response = await apiClient.post<ApiResponse<void>>(
    `/realtime/login-sessions/${loginSessionId}/content/start`,
    request,
  )
  return response.data
}

export async function endContent(loginSessionId: number) {
  const response = await apiClient.post<ApiResponse<void>>(
    `/realtime/login-sessions/${loginSessionId}/content/end`,
  )
  return response.data
}

type RealtimeSubscriptionOptions = {
  onEvent: (event: RealtimeEvent) => void
  onError?: (error: unknown) => void
  signal?: AbortSignal
}

type GamePresenceSubscriptionOptions = {
  onEvent: (event: GamePresenceEvent) => void
  onError?: (error: unknown) => void
  signal?: AbortSignal
}

type WatchingSubscriptionOptions = {
  onOpen?: () => void
  onError?: (error: unknown) => void
  signal?: AbortSignal
}

// EventSource 가 Authorization 헤더를 못 붙이는 한계를 우회하려고 fetch + ReadableStream 으로
// 직접 SSE 를 구독한다. BE 는 `event:realtime\ndata:{...}\n\n` 형태로 보내며 본 파서는
// data: 라인만 추출하므로 event: 라인은 자연스럽게 무시된다. 재연결/백오프는 호출자
// (useRealtimeEvents) 에서 처리.
export async function subscribeRealtimeEvents({
  onEvent,
  onError,
  signal,
}: RealtimeSubscriptionOptions): Promise<void> {
  const baseUrl = import.meta.env.VITE_API_BASE_URL ?? '/api/v1'
  const token = localStorage.getItem('wish_access_token')
  const response = await fetch(`${baseUrl}/realtime/events`, {
    method: 'GET',
    headers: {
      Accept: 'text/event-stream',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    signal,
  })

  if (!response.ok || !response.body) {
    throw new Error(`SSE connection failed: ${response.status}`)
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''

  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += value
      // SSE 메시지 구분자는 빈 줄(\n\n).
      let separatorIndex = buffer.indexOf('\n\n')
      while (separatorIndex !== -1) {
        const rawMessage = buffer.slice(0, separatorIndex)
        buffer = buffer.slice(separatorIndex + 2)
        const dataLine = rawMessage.split('\n').find(line => line.startsWith('data:'))
        if (dataLine) {
          const payload = dataLine.slice('data:'.length).trim()
          if (payload) {
            try {
              const parsed = JSON.parse(payload) as { type?: unknown }
              // 알 수 없는 type 은 무시 — BE 가 새 이벤트 추가했을 때 forward-compat.
              if (
                typeof parsed.type === 'string' &&
                KNOWN_EVENT_TYPES.has(parsed.type as RealtimeEvent['type'])
              ) {
                onEvent(parsed as RealtimeEvent)
              }
            } catch (parseError) {
              onError?.(parseError)
            }
          }
        }
        separatorIndex = buffer.indexOf('\n\n')
      }
    }
  } catch (streamError) {
    if (signal?.aborted) return
    onError?.(streamError)
  } finally {
    reader.releaseLock()
  }
}

export async function subscribeWatching(
  loginSessionId: number,
  { onOpen, onError, signal }: WatchingSubscriptionOptions,
): Promise<void> {
  const baseUrl = import.meta.env.VITE_API_BASE_URL ?? '/api/v1'
  const token = localStorage.getItem('wish_access_token')
  const response = await fetch(`${baseUrl}/realtime/login-sessions/${loginSessionId}/watching`, {
    method: 'GET',
    headers: {
      Accept: 'text/event-stream',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    signal,
  })

  if (!response.ok || !response.body) {
    throw new Error(`Watching SSE connection failed: ${response.status}`)
  }

  onOpen?.()

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()

  try {
    while (true) {
      const { done } = await reader.read()
      if (done) break
    }
  } catch (streamError) {
    if (signal?.aborted) return
    onError?.(streamError)
  } finally {
    reader.releaseLock()
  }
}

export async function subscribeGamePresence(
  loginSessionId: number,
  { onEvent, onError, signal }: GamePresenceSubscriptionOptions,
): Promise<void> {
  const baseUrl = import.meta.env.VITE_API_BASE_URL ?? '/api/v1'
  const token = localStorage.getItem('wish_access_token')
  const response = await fetch(
    `${baseUrl}/realtime/login-sessions/${loginSessionId}/game-presence`,
    {
      method: 'GET',
      headers: {
        Accept: 'text/event-stream',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal,
    },
  )

  if (!response.ok || !response.body) {
    throw new Error(`Game presence SSE connection failed: ${response.status}`)
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''

  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += value
      let separatorIndex = buffer.indexOf('\n\n')
      while (separatorIndex !== -1) {
        const rawMessage = buffer.slice(0, separatorIndex)
        buffer = buffer.slice(separatorIndex + 2)
        const dataLine = rawMessage.split('\n').find(line => line.startsWith('data:'))
        if (dataLine) {
          const payload = dataLine.slice('data:'.length).trim()
          if (payload) {
            try {
              const parsed = JSON.parse(payload) as { type?: unknown }
              if (
                typeof parsed.type === 'string' &&
                KNOWN_GAME_PRESENCE_EVENT_TYPES.has(parsed.type as GamePresenceEvent['type'])
              ) {
                onEvent(parsed as GamePresenceEvent)
              }
            } catch (parseError) {
              onError?.(parseError)
            }
          }
        }
        separatorIndex = buffer.indexOf('\n\n')
      }
    }
  } catch (streamError) {
    if (signal?.aborted) return
    onError?.(streamError)
  } finally {
    reader.releaseLock()
  }
}
