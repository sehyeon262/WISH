import { act, cleanup, render, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getActiveLiveSession,
  type ActiveLiveSessionResponse,
  type RealtimeEvent,
} from '@wish/api-client'
import { useAuthStore } from '@/shared/auth/store'
import { useNotificationStore } from '@/stores/notificationStore'
import { useRealtimeStore } from '@/stores/realtimeStore'
import { RealtimeNotificationBridge } from './RealtimeNotificationBridge'

vi.mock('@wish/api-client', () => ({
  getActiveLiveSession: vi.fn(),
}))

const mockGetActiveLiveSession = vi.mocked(getActiveLiveSession)

const ACTIVE_SESSION: ActiveLiveSessionResponse = {
  loginSessionId: 77,
  patientProfileId: 10,
  patientName: '임건빈',
  contentActive: false,
  contentType: null,
}

function setAuthToken(token: string | null) {
  useAuthStore.setState({
    token,
    email: token ? 'guardian@example.com' : null,
    role: token ? 'GUARDIAN' : null,
  })
}

function gameStartedEvent(
  overrides: Partial<Extract<RealtimeEvent, { type: 'GAME_STARTED' }>> = {},
) {
  return {
    type: 'GAME_STARTED',
    loginSessionId: ACTIVE_SESSION.loginSessionId,
    patientProfileId: ACTIVE_SESSION.patientProfileId,
    patientName: ACTIVE_SESSION.patientName,
    occurredAt: '2026-05-19T10:00:00',
    ...overrides,
  } satisfies Extract<RealtimeEvent, { type: 'GAME_STARTED' }>
}

function dialogueEmotionUpdatedEvent(
  overrides: Partial<Extract<RealtimeEvent, { type: 'DIALOGUE_EMOTION_UPDATED' }>> = {},
) {
  return {
    type: 'DIALOGUE_EMOTION_UPDATED',
    patientProfileId: ACTIVE_SESSION.patientProfileId,
    dialogueSessionId: 321,
    npcName: 'SEORIN',
    overallValence: 'NEGATIVE',
    tone: 'WORRIED',
    intensity: 2,
    guardianMessage: '건빈이가 오늘 대화에서 걱정을 표현했어요.',
    occurredAt: '2026-05-19T10:10:00',
    ...overrides,
  } satisfies Extract<RealtimeEvent, { type: 'DIALOGUE_EMOTION_UPDATED' }>
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })

  return { promise, resolve, reject }
}

function renderBridge() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <RealtimeNotificationBridge />
    </QueryClientProvider>,
  )
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  localStorage.clear()
  useRealtimeStore.getState().reset()
  useNotificationStore.getState().clear()
  setAuthToken(null)
})

describe('RealtimeNotificationBridge', () => {
  it('does not duplicate a game-started notification after an active-session snapshot alert', async () => {
    mockGetActiveLiveSession.mockResolvedValueOnce(ACTIVE_SESSION)
    setAuthToken('guardian-token')

    renderBridge()

    await waitFor(() => {
      expect(useNotificationStore.getState().items).toHaveLength(1)
    })

    act(() => {
      useRealtimeStore.getState().applyEvent(gameStartedEvent())
    })

    expect(useNotificationStore.getState().items).toHaveLength(1)
    expect(useNotificationStore.getState().unreadCount).toBe(1)
  })

  it('ignores an active-session snapshot that resolves after the auth token changes', async () => {
    const staleSnapshot = deferred<ActiveLiveSessionResponse | null>()
    mockGetActiveLiveSession.mockReturnValueOnce(staleSnapshot.promise).mockResolvedValueOnce(null)
    setAuthToken('old-token')

    renderBridge()

    await waitFor(() => {
      expect(mockGetActiveLiveSession).toHaveBeenCalledTimes(1)
    })

    act(() => {
      setAuthToken('new-token')
    })

    await waitFor(() => {
      expect(mockGetActiveLiveSession).toHaveBeenCalledTimes(2)
    })

    await act(async () => {
      staleSnapshot.resolve(ACTIVE_SESSION)
      await Promise.resolve()
    })

    expect(useRealtimeStore.getState().activeSession).toBeNull()
    expect(useNotificationStore.getState().items).toHaveLength(0)
  })

  it('pushes a chat deep-link notification when dialogue emotion is updated', () => {
    mockGetActiveLiveSession.mockResolvedValueOnce(null)
    setAuthToken('guardian-token')

    renderBridge()

    act(() => {
      useRealtimeStore.getState().applyEvent(dialogueEmotionUpdatedEvent())
    })

    const [item] = useNotificationStore.getState().items
    expect(item.kind).toBe('DIALOGUE_EMOTION_UPDATED')
    expect(item.description).toBe('건빈이가 오늘 대화에서 걱정을 표현했어요.')
    expect(item.href).toBe('/chat?npc=SEORIN&sessionId=321')
  })
})
