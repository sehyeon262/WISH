import { useEffect, useRef } from 'react'
import { heartbeatLoginSession, startLoginSession } from '@wish/api-client'
import { useLoginSessionStore } from '../../stores/loginSessionStore'

const HEARTBEAT_INTERVAL_MS = 30_000
const ACCESS_TOKEN_STORAGE_KEY = 'wish_access_token'

function fireEnd(sessionId: number, token: string | null) {
  const baseUrl = import.meta.env.VITE_API_BASE_URL ?? '/api/v1'
  try {
    void fetch(`${baseUrl}/login-sessions/${sessionId}/end`, {
      method: 'PATCH',
      keepalive: true,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
  } catch {
    // best-effort — 실패해도 BE 가 5분 후 자동 마감
  }
}

export function useLoginSession(patientProfileId: number | undefined) {
  const sessionIdRef = useRef<number | null>(null)
  const tokenRef = useRef<string | null>(null)
  const intervalIdRef = useRef<number | null>(null)

  useEffect(() => {
    if (!patientProfileId) return

    let cancelled = false

    const stopHeartbeat = () => {
      if (intervalIdRef.current !== null) {
        window.clearInterval(intervalIdRef.current)
        intervalIdRef.current = null
      }
    }

    const sendHeartbeat = () => {
      const sessionId = sessionIdRef.current
      if (sessionId === null) return
      const currentToken = localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY)
      if (tokenRef.current !== currentToken) {
        stopHeartbeat()
        fireEnd(sessionId, tokenRef.current)
        sessionIdRef.current = null
        tokenRef.current = null
        useLoginSessionStore.getState().clearSession()
        return
      }
      heartbeatLoginSession(sessionId).catch(() => {
        // 한 번 실패해도 다음 주기에 자동 재시도
      })
    }

    const startHeartbeat = () => {
      stopHeartbeat()
      intervalIdRef.current = window.setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS)
    }

    const handleVisibilityChange = () => {
      if (sessionIdRef.current === null) return
      if (document.visibilityState === 'hidden') {
        stopHeartbeat()
      } else {
        sendHeartbeat()
        startHeartbeat()
      }
    }

    const handlePageHide = () => {
      const sessionId = sessionIdRef.current
      if (sessionId === null) return
      stopHeartbeat()
      fireEnd(sessionId, tokenRef.current)
      sessionIdRef.current = null
      useLoginSessionStore.getState().clearSession()
    }

    void startLoginSession({ patientProfileId })
      .then(response => {
        if (cancelled) return
        sessionIdRef.current = response.data.id
        tokenRef.current = localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY)
        useLoginSessionStore.getState().setSession(response.data.id, patientProfileId)
        if (document.visibilityState !== 'hidden') {
          startHeartbeat()
        }
      })
      .catch(error => {
        console.warn('Failed to start login session.', error)
      })

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('pagehide', handlePageHide)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('pagehide', handlePageHide)
      stopHeartbeat()
      const sessionId = sessionIdRef.current
      const token = tokenRef.current
      sessionIdRef.current = null
      tokenRef.current = null
      useLoginSessionStore.getState().clearSession()
      if (sessionId !== null) {
        fireEnd(sessionId, token)
      }
    }
  }, [patientProfileId])
}
