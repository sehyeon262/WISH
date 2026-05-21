import { create } from 'zustand'
import type {
  ActiveLiveSessionResponse,
  RealtimeContentType,
  RealtimeEvent,
} from '@wish/api-client'

// SSE 연결 상태.
// - idle: 초기 상태(미인증)
// - connecting: 첫 연결 시도 중
// - connected: BE 가 CONNECTED 이벤트 보낸 이후
// - reconnecting: 끊어졌고 재연결 백오프 중
// - error: 재시도 한도 등으로 포기한 상태(개발용 — v1 에서는 무한 재시도)
export type RealtimeConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error'

export type ActiveLiveSession = {
  loginSessionId: number
  patientProfileId: number
  patientName: string
}

type RealtimeState = {
  connectionStatus: RealtimeConnectionStatus
  activeSession: ActiveLiveSession | null
  contentActive: boolean
  contentType: RealtimeContentType | null
  sessionVersion: number

  // 토스트 레이어가 useEffect 로 구독하기 위한 transient 필드.
  // lastEventNonce 가 증가하면 새 이벤트가 들어온 것 — 같은 객체 비교가 아니라
  // primitive nonce 로 useEffect 의존성을 잡으면 재렌더가 발생해도 한 번만 트리거된다.
  lastEvent: RealtimeEvent | null
  lastEventNonce: number

  setConnectionStatus: (status: RealtimeConnectionStatus) => void
  applyEvent: (event: RealtimeEvent) => void
  hydrateActiveSession: (
    snapshot: ActiveLiveSessionResponse | null,
    expectedSessionVersion?: number,
  ) => void
  reset: () => void
}

const INITIAL_STATE = {
  connectionStatus: 'idle' as RealtimeConnectionStatus,
  activeSession: null,
  contentActive: false,
  contentType: null,
  sessionVersion: 0,
  lastEvent: null,
  lastEventNonce: 0,
}

export const useRealtimeStore = create<RealtimeState>(set => ({
  ...INITIAL_STATE,
  setConnectionStatus: status => set({ connectionStatus: status }),
  applyEvent: event =>
    set(state => {
      const next: Partial<RealtimeState> = {
        lastEvent: event,
        lastEventNonce: state.lastEventNonce + 1,
      }
      switch (event.type) {
        case 'CONNECTED':
          // 페이로드 없음 — 연결 확인용. derived state 변경 없음.
          break
        case 'GAME_STARTED':
          next.sessionVersion = state.sessionVersion + 1
          next.activeSession = {
            loginSessionId: event.loginSessionId,
            patientProfileId: event.patientProfileId,
            patientName: event.patientName,
          }
          next.contentActive = false
          next.contentType = null
          break
        case 'GAME_ENDED':
          // 현재 활성 세션과 일치할 때만 비운다 (out-of-order 방지).
          if (state.activeSession?.loginSessionId === event.loginSessionId) {
            next.sessionVersion = state.sessionVersion + 1
            next.activeSession = null
            next.contentActive = false
            next.contentType = null
          }
          break
        case 'CONTENT_STARTED':
          if (state.activeSession?.loginSessionId === event.loginSessionId) {
            next.sessionVersion = state.sessionVersion + 1
            next.contentActive = true
            next.contentType = event.contentType
          }
          break
        case 'CONTENT_ENDED':
          if (state.activeSession?.loginSessionId === event.loginSessionId) {
            next.sessionVersion = state.sessionVersion + 1
            next.contentActive = false
            next.contentType = null
          }
          break
      }
      return next
    }),
  hydrateActiveSession: (snapshot, expectedSessionVersion) =>
    set(state => {
      if (expectedSessionVersion !== undefined && state.sessionVersion !== expectedSessionVersion) {
        return {}
      }

      if (!snapshot) {
        if (!state.activeSession && !state.contentActive && state.contentType === null) {
          return {}
        }
        return {
          activeSession: null,
          contentActive: false,
          contentType: null,
          sessionVersion: state.sessionVersion + 1,
        }
      }

      const activeSession = {
        loginSessionId: snapshot.loginSessionId,
        patientProfileId: snapshot.patientProfileId,
        patientName: snapshot.patientName,
      }
      const currentSession = state.activeSession
      const unchanged =
        currentSession !== null &&
        currentSession.loginSessionId === activeSession.loginSessionId &&
        currentSession.patientProfileId === activeSession.patientProfileId &&
        currentSession.patientName === activeSession.patientName &&
        state.contentActive === snapshot.contentActive &&
        state.contentType === snapshot.contentType

      if (unchanged) {
        return {}
      }

      return {
        activeSession,
        contentActive: snapshot.contentActive,
        contentType: snapshot.contentType,
        sessionVersion: state.sessionVersion + 1,
      }
    }),
  reset: () => set({ ...INITIAL_STATE }),
}))
