import { useCallback, useEffect, useRef, useState } from 'react'
import styles from './PttButton.module.css'

// LiveKit/getUserMedia 가 던지는 흔한 에러를 사용자 친화 메시지로 변환.
// 분류 안 되는 케이스는 generic 메시지 — devtools 콘솔의 원본 에러로 보강.
function toUserMessage(error: unknown): string {
  if (error instanceof DOMException) {
    switch (error.name) {
      case 'NotAllowedError':
        return '마이크 권한을 허용해 주세요'
      case 'NotFoundError':
      case 'OverconstrainedError':
        return '마이크 장치를 찾을 수 없어요'
      case 'NotReadableError':
        return '다른 앱이 마이크를 사용 중이에요'
      case 'SecurityError':
        return 'HTTPS 환경에서만 사용할 수 있어요'
    }
  }
  if (error instanceof Error && /timed out|pending|publi|permission/i.test(error.message)) {
    // BE 가 canPublish 권한을 아직 안 내려준 상태에서 publish 시도하거나
    // 직전 publish 가 끝나기 전에 다시 토글한 경우.
    return '잠시 후 다시 눌러주세요'
  }
  return '마이크를 켤 수 없어요'
}

function MicIcon({ className, muted }: { className?: string; muted?: boolean }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M6 11a6 6 0 0 0 12 0" />
      <line x1="12" y1="17" x2="12" y2="21" />
      <line x1="9" y1="21" x2="15" y2="21" />
      {muted ? <line x1="3" y1="3" x2="21" y2="21" /> : null}
    </svg>
  )
}

type Props = {
  /** 콘텐츠 진행 중일 때만 true — false 면 버튼이 disabled 로 노출되어 PTT 불가. */
  enabled: boolean
  /** LiveKit LocalParticipant.setMicrophoneEnabled 래퍼. 권한 거절 등 실패 시 throw. */
  setMicrophoneEnabled: (enabled: boolean) => Promise<void>
}

// Push-To-Talk 마이크 버튼.
// pointerdown 으로 마이크 enable, pointerup/leave/cancel 로 disable.
// 첫 enable 호출에서 LiveKit 이 트랙 publish + 브라우저 권한 다이얼로그를 띄움 — 사용자가
// 권한을 거절하면 error 상태로 전환되고 다음 시도까지 버튼이 disable 된다.
export function PttButton({ enabled, setMicrophoneEnabled }: Props) {
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pressedRef = useRef(false)
  // setMicrophoneEnabled 호출을 promise 체인으로 직렬화. 빠른 press→release→press 가
  // LiveKit 의 'pending publication promise timed out' race 를 만드는 걸 막는다.
  // catch(() => {}) 로 이전 작업의 에러가 다음 작업을 막지 않도록.
  const pendingRef = useRef<Promise<unknown>>(Promise.resolve())
  const queueMic = useCallback(
    (target: boolean) => {
      const next = pendingRef.current.catch(() => {}).then(() => setMicrophoneEnabled(target))
      pendingRef.current = next
      return next
    },
    [setMicrophoneEnabled],
  )

  useEffect(() => {
    if (!enabled && isSpeaking) {
      // 콘텐츠가 끝나는 등 외부 이유로 enabled 가 false 가 되면 즉시 mute.
      pressedRef.current = false
      void queueMic(false).catch(() => {})
      setIsSpeaking(false)
    }
  }, [enabled, isSpeaking, queueMic])

  // 언마운트 시 잔여 publish 방지.
  useEffect(
    () => () => {
      void queueMic(false).catch(() => {})
    },
    [queueMic],
  )

  const handleStart = useCallback(async () => {
    if (!enabled || pressedRef.current) return
    pressedRef.current = true
    setError(null)
    setIsSpeaking(true)
    try {
      await queueMic(true)
    } catch (e) {
      pressedRef.current = false
      setIsSpeaking(false)
      // 진단용 — devtools 에서 원인 분류 가능하도록 항상 콘솔에 남긴다.
      console.warn('[PTT] setMicrophoneEnabled failed', e)
      setError(toUserMessage(e))
      // 백그라운드에서 publish 가 늦게 성공했을 가능성 대비 — 다시 한 번 mute 큐잉.
      void queueMic(false).catch(() => {})
    }
  }, [enabled, queueMic])

  const handleStop = useCallback(async () => {
    if (!pressedRef.current) return
    pressedRef.current = false
    setIsSpeaking(false)
    try {
      await queueMic(false)
    } catch {
      // mute 실패는 사용자 알림 가치 낮음.
    }
  }, [queueMic])

  const tooltip = error
    ? error
    : !enabled
      ? '콘텐츠 진행 중일 때 사용할 수 있어요'
      : isSpeaking
        ? '말하는 중...'
        : '꾹 눌러서 말하세요'

  return (
    <button
      type="button"
      className={`${styles.button} ${isSpeaking ? styles.buttonActive : ''}`}
      disabled={!enabled}
      onPointerDown={event => {
        event.preventDefault()
        ;(event.target as HTMLElement).setPointerCapture?.(event.pointerId)
        void handleStart()
      }}
      onPointerUp={() => void handleStop()}
      onPointerLeave={() => void handleStop()}
      onPointerCancel={() => void handleStop()}
      aria-pressed={isSpeaking}
      aria-label={tooltip}
      data-tooltip={tooltip}
    >
      <MicIcon className={styles.icon} muted={!isSpeaking && !enabled} />
    </button>
  )
}
