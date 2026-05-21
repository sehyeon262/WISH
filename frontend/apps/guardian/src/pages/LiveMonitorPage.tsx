import { useCallback, useEffect, useState } from 'react'
import { getActiveLiveSession, subscribeWatching } from '@wish/api-client'
import { HeaderBar } from '@/features/dashboard/components/HeaderBar'
import { LiveKitViewer } from '@/features/realtime'
import { useRealtimeStore } from '@/stores/realtimeStore'
import '@/features/dashboard/tokens.css'
import styles from './LiveMonitorPage.module.css'

type WatchingStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'hidden' | 'error'
type SnapshotStatus = 'checking' | 'ready' | 'error'

const WATCHING_RETRY_DELAY_MS = 1_000

export function LiveMonitorPage() {
  const activeSession = useRealtimeStore(state => state.activeSession)
  const hydrateActiveSession = useRealtimeStore(state => state.hydrateActiveSession)
  const activeSessionId = activeSession?.loginSessionId ?? null
  const [connectionRequested, setConnectionRequested] = useState(false)
  const [watchingOpened, setWatchingOpened] = useState(false)
  const [watchingStatus, setWatchingStatus] = useState<WatchingStatus>('idle')
  const [snapshotStatus, setSnapshotStatus] = useState<SnapshotStatus>('checking')
  const [pageVisible, setPageVisible] = useState(() => document.visibilityState === 'visible')

  useEffect(() => {
    const handleVisibilityChange = () => {
      const visible = document.visibilityState === 'visible'
      setPageVisible(visible)
      if (!visible) {
        setConnectionRequested(false)
        setWatchingOpened(false)
        setWatchingStatus('hidden')
        return
      }
      setWatchingStatus(status => (status === 'hidden' ? 'idle' : status))
    }

    handleVisibilityChange()
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  useEffect(() => {
    if (!pageVisible) {
      setSnapshotStatus('ready')
      return
    }

    const controller = new AbortController()
    let cancelled = false
    const expectedSessionVersion = useRealtimeStore.getState().sessionVersion
    setSnapshotStatus('checking')

    const hydrateSnapshot = async () => {
      try {
        const snapshot = await getActiveLiveSession({ signal: controller.signal })
        if (cancelled) return
        hydrateActiveSession(snapshot, expectedSessionVersion)
        setSnapshotStatus('ready')
      } catch (error) {
        if (cancelled || controller.signal.aborted) return
        console.warn('Active live session snapshot failed', error)
        setSnapshotStatus('error')
      }
    }

    void hydrateSnapshot()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [hydrateActiveSession, pageVisible])

  useEffect(() => {
    setConnectionRequested(false)
    setWatchingOpened(false)
    setWatchingStatus(pageVisible ? 'idle' : 'hidden')
  }, [activeSessionId, pageVisible])

  const handleStart = useCallback(() => {
    if (activeSessionId === null || !pageVisible) return
    setWatchingOpened(false)
    setWatchingStatus('connecting')
    setConnectionRequested(true)
  }, [activeSessionId, pageVisible])

  const handleStop = useCallback(() => {
    setConnectionRequested(false)
    setWatchingOpened(false)
    setWatchingStatus(pageVisible ? 'idle' : 'hidden')
  }, [pageVisible])

  const shouldOpenWatching = activeSessionId !== null && connectionRequested && pageVisible

  useEffect(() => {
    if (activeSessionId === null || !shouldOpenWatching) return

    let cancelled = false
    let openedOnce = false
    let reconnectTimerId: number | null = null
    let currentController: AbortController | null = null

    const waitBeforeRetry = () =>
      new Promise<void>(resolve => {
        reconnectTimerId = window.setTimeout(resolve, WATCHING_RETRY_DELAY_MS)
      })

    const connectWatching = async () => {
      while (!cancelled) {
        const controller = new AbortController()
        currentController = controller
        setWatchingStatus(openedOnce ? 'reconnecting' : 'connecting')

        try {
          await subscribeWatching(activeSessionId, {
            signal: controller.signal,
            onOpen: () => {
              if (cancelled) return
              openedOnce = true
              setWatchingOpened(true)
              setWatchingStatus('connected')
            },
            onError: error => {
              if (!controller.signal.aborted) {
                console.warn('Watching SSE stream failed', error)
              }
            },
          })
        } catch (error) {
          if (controller.signal.aborted || cancelled) break
          console.warn('Watching SSE disconnected, will retry.', error)
          setWatchingStatus('error')
        } finally {
          if (currentController === controller) currentController = null
        }

        if (cancelled || controller.signal.aborted) break
        setWatchingStatus('reconnecting')
        await waitBeforeRetry()
      }
    }

    void connectWatching()

    return () => {
      cancelled = true
      if (reconnectTimerId !== null) window.clearTimeout(reconnectTimerId)
      currentController?.abort()
    }
  }, [activeSessionId, shouldOpenWatching])

  const viewerEnabled = shouldOpenWatching && watchingOpened && activeSession !== null

  return (
    <div className={styles.shell}>
      <div className={styles.headerSlot}>
        <HeaderBar />
      </div>
      <div className={styles.body}>
        {activeSession ? (
          <div className={styles.liveStack}>
            <section className={styles.controlPanel}>
              <div className={styles.controlCopy}>
                <p className={styles.eyebrow}>실시간 모니터링</p>
                <h1 className={styles.title}>{activeSession.patientName} 실시간 보기</h1>
                <p className={styles.subtitle}>{watchingDescription(watchingStatus)}</p>
              </div>
              <div className={styles.controlActions}>
                {connectionRequested ? (
                  <button
                    type="button"
                    className={`${styles.controlButton} ${styles.stopButton}`}
                    onClick={handleStop}
                  >
                    연결 종료
                  </button>
                ) : (
                  <button
                    type="button"
                    className={styles.controlButton}
                    onClick={handleStart}
                    disabled={!pageVisible}
                  >
                    실시간 연결 시작
                  </button>
                )}
                <span
                  className={`${styles.statusBadge} ${
                    watchingStatus === 'connected' ? styles.statusBadgeLive : ''
                  }`}
                >
                  {watchingStatusLabel(watchingStatus)}
                </span>
              </div>
            </section>

            {viewerEnabled ? (
              <LiveKitViewer activeSession={activeSession} />
            ) : (
              <section className={styles.liveEmptyState}>
                <div className={styles.liveEmptyIcon} aria-hidden="true">
                  {connectionRequested ? '···' : 'LIVE'}
                </div>
                <div>
                  <h2 className={styles.title}>
                    {connectionRequested
                      ? '아이 화면을 연결하고 있습니다.'
                      : '실시간 연결을 시작하면 아이 화면이 여기에 표시됩니다.'}
                  </h2>
                  <p className={styles.subtitle}>
                    {connectionRequested
                      ? '연결이 준비되는 동안 이 화면을 열어두세요.'
                      : '위의 시작 버튼을 누를 때만 아이 화면 연결을 요청합니다.'}
                  </p>
                </div>
              </section>
            )}
          </div>
        ) : snapshotStatus === 'checking' ? (
          <section className={styles.placeholder}>
            <h1 className={styles.title}>진행 중인 게임을 확인하고 있습니다.</h1>
            <p className={styles.subtitle}>잠시 후 실시간 연결 상태가 표시됩니다.</p>
          </section>
        ) : (
          <section className={styles.placeholder}>
            <h1 className={styles.title}>진행 중인 게임이 없습니다.</h1>
            <p className={styles.subtitle}>
              아이가 게임을 시작하면 이 화면에서 실시간 연결을 시작할 수 있습니다.
            </p>
          </section>
        )}
      </div>
    </div>
  )
}

function watchingStatusLabel(status: WatchingStatus): string {
  switch (status) {
    case 'idle':
      return '대기 중'
    case 'connecting':
      return '연결 중'
    case 'connected':
      return '연결됨'
    case 'reconnecting':
      return '재연결 중'
    case 'hidden':
      return '탭 비활성'
    case 'error':
      return '재시도 중'
  }
}

function watchingDescription(status: WatchingStatus): string {
  switch (status) {
    case 'connected':
      return '보호자 연결이 활성화되어 아이 화면을 불러오고 있습니다.'
    case 'connecting':
      return '아이 화면 연결을 요청하고 있습니다.'
    case 'reconnecting':
    case 'error':
      return '연결 상태를 다시 확인하고 있습니다.'
    case 'hidden':
      return '탭이 숨겨지면 실시간 연결은 자동으로 종료됩니다.'
    case 'idle':
      return '버튼을 누르면 실시간 보기 연결을 시작합니다.'
  }
}
