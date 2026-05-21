import { useEffect } from 'react'
import { subscribeRealtimeEvents } from '@wish/api-client'
import { useAuthStore } from '@/shared/auth/store'
import { useRealtimeStore } from '@/stores/realtimeStore'

// 백오프 — 1s → 2s → 4s → 8s → 16s → 30s 캡.
// CONNECTED 이벤트 수신 시 즉시 1s 로 리셋해 다음 끊김에서 빠르게 회복한다.
const INITIAL_BACKOFF_MS = 1_000
const MAX_BACKOFF_MS = 30_000

// 보호자앱 SSE 구독 훅 — 토큰이 있는 동안 GET /realtime/events 를 유지한다.
// 토큰 사라지면(로그아웃) abort 하고 store reset, 다시 들어오면 재연결.
//
// App 최상단(BrowserRouter 안, Routes 옆) 에 1번만 마운트하면 라우트 전환 중에도
// 연결이 유지된다. 중복 마운트 시 SSE 도 중복으로 열리니 단일 mount 지킬 것.
export function useRealtimeEvents() {
  const token = useAuthStore(state => state.token)
  const setConnectionStatus = useRealtimeStore(state => state.setConnectionStatus)
  const applyEvent = useRealtimeStore(state => state.applyEvent)
  const reset = useRealtimeStore(state => state.reset)

  useEffect(() => {
    if (!token) {
      // 로그아웃/토큰 만료 — 연결 안 하고 store 초기화.
      reset()
      return
    }

    const controller = new AbortController()
    let cancelled = false
    let backoffMs = INITIAL_BACKOFF_MS
    let reconnectTimerId: number | null = null

    const clearReconnectTimer = () => {
      if (reconnectTimerId !== null) {
        window.clearTimeout(reconnectTimerId)
        reconnectTimerId = null
      }
    }

    const connect = async () => {
      if (cancelled) return
      setConnectionStatus(backoffMs === INITIAL_BACKOFF_MS ? 'connecting' : 'reconnecting')
      try {
        await subscribeRealtimeEvents({
          signal: controller.signal,
          onEvent: event => {
            if (event.type === 'CONNECTED') {
              backoffMs = INITIAL_BACKOFF_MS
              setConnectionStatus('connected')
            }
            applyEvent(event)
          },
          onError: error => {
            // SSE 스트림 자체 에러는 아래 catch 에서 처리 — 여기는 개별 메시지 파싱 실패.
            console.warn('Realtime event parse error', error)
          },
        })
      } catch (error) {
        if (cancelled || controller.signal.aborted) return
        console.warn('Realtime SSE disconnected, will retry.', error)
      }
      // 정상 종료(BE timeout) 또는 에러로 빠져나옴 — 토큰 유지되면 backoff 재연결.
      if (cancelled || controller.signal.aborted) return
      setConnectionStatus('reconnecting')
      reconnectTimerId = window.setTimeout(() => {
        connect()
      }, backoffMs)
      backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS)
    }

    void connect()

    return () => {
      cancelled = true
      clearReconnectTimer()
      controller.abort()
      reset()
    }
  }, [token, setConnectionStatus, applyEvent, reset])
}
