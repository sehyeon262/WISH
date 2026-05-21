import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { useMutation } from '@tanstack/react-query'
import { notifyGuardian } from '@wish/api-client'
import type { GuardianNotificationType } from '@wish/api-client'

type Props = {
  open: boolean
  patientId: number | null
  patientName?: string
  guardianEmail?: string
  type: GuardianNotificationType
  defaultMessage: string
  onClose: () => void
  onSent?: (sentAt: string) => void
}

const TYPE_LABEL: Record<GuardianNotificationType, string> = {
  RISK: '이탈 위험 안내',
  CONTENT_SKEW: '콘텐츠 다양화 권유',
  CHECK_IN: '일반 안내',
}

export function NotifyGuardianDialog({
  open,
  patientId,
  patientName,
  guardianEmail,
  type,
  defaultMessage,
  onClose,
  onSent,
}: Props) {
  const [message, setMessage] = useState(defaultMessage)
  const [resultAt, setResultAt] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setMessage(defaultMessage)
      setResultAt(null)
      setError(null)
    }
  }, [open, defaultMessage])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !mutation.isPending) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onClose])

  const mutation = useMutation({
    mutationFn: () => {
      if (patientId == null) throw new Error('patientId is required')
      return notifyGuardian({ patientId, type, message: message.trim() })
    },
    onSuccess: response => {
      setResultAt(response.data.sentAt)
      onSent?.(response.data.sentAt)
    },
    onError: (err: unknown) => {
      const res =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response
          : null
      setError(res?.data?.message ?? '발송 실패')
    },
  })

  if (!open) return null

  const trimmed = message.trim()
  const canSubmit =
    patientId != null && trimmed.length > 0 && trimmed.length <= 500 && !mutation.isPending

  return (
    <div style={styles.backdrop} onClick={mutation.isPending ? undefined : onClose}>
      <div style={styles.modal} role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
        <div style={styles.headerRow}>
          <h2 style={styles.title}>보호자 안내 메시지</h2>
          <span style={styles.typeBadge}>{TYPE_LABEL[type]}</span>
        </div>
        {(patientName || guardianEmail) && (
          <div style={styles.meta}>
            {patientName && (
              <span>
                대상 환자 <strong>{patientName}</strong>
              </span>
            )}
            {guardianEmail && (
              <span>
                보호자 <strong>{guardianEmail}</strong>
              </span>
            )}
          </div>
        )}
        <label style={styles.label}>
          메시지
          <textarea
            value={message}
            onChange={event => setMessage(event.target.value)}
            rows={5}
            style={styles.textarea}
            disabled={mutation.isPending || resultAt !== null}
            maxLength={500}
          />
          <span style={styles.counter}>{message.length} / 500</span>
        </label>
        {error && <div style={styles.errorBox}>{error}</div>}
        {resultAt && (
          <div style={styles.successBox}>
            전송 요청을 접수했습니다. ({new Date(resultAt).toLocaleString('ko-KR')})
            <span style={styles.successHint}>
              MVP 단계에서는 실제 채널 발송 없이 운영 로그로 기록됩니다.
            </span>
          </div>
        )}
        <div style={styles.actions}>
          <button
            type="button"
            onClick={onClose}
            style={styles.cancel}
            disabled={mutation.isPending}
          >
            {resultAt ? '닫기' : '취소'}
          </button>
          {!resultAt && (
            <button
              type="button"
              onClick={() => mutation.mutate()}
              style={styles.submit}
              disabled={!canSubmit}
            >
              {mutation.isPending ? '발송 중' : '발송'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(16, 42, 67, 0.45)',
    display: 'grid',
    placeItems: 'center',
    zIndex: 1000,
    padding: 16,
  },
  modal: {
    width: '100%',
    maxWidth: 480,
    background: '#fff',
    border: '1px solid #d9e2ec',
    borderRadius: 10,
    boxShadow: '0 20px 50px rgba(16, 42, 67, 0.18)',
    padding: 22,
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  headerRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  title: {
    margin: 0,
    color: '#102a43',
    fontSize: 16,
    letterSpacing: 0,
  },
  typeBadge: {
    padding: '4px 8px',
    background: '#e6f6ff',
    border: '1px solid #b3ecff',
    borderRadius: 6,
    color: '#0b7285',
    fontSize: 12,
    fontWeight: 700,
  },
  meta: {
    display: 'flex',
    gap: 12,
    flexWrap: 'wrap',
    color: '#486581',
    fontSize: 12,
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    color: '#486581',
    fontSize: 13,
    fontWeight: 600,
  },
  textarea: {
    padding: 10,
    fontSize: 13,
    color: '#102a43',
    background: '#fff',
    border: '1px solid #bcccdc',
    borderRadius: 6,
    resize: 'vertical',
    minHeight: 96,
    fontFamily: 'inherit',
  },
  counter: {
    alignSelf: 'flex-end',
    color: '#829ab1',
    fontSize: 11,
    fontWeight: 500,
  },
  errorBox: {
    padding: 10,
    background: '#fff5f5',
    color: '#c92a2a',
    border: '1px solid #ffc9c9',
    borderRadius: 6,
    fontSize: 13,
  },
  successBox: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: 10,
    background: '#e6fcf5',
    color: '#0b7285',
    border: '1px solid #99e9d3',
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 600,
  },
  successHint: {
    color: '#486581',
    fontSize: 12,
    fontWeight: 400,
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 8,
  },
  cancel: {
    height: 34,
    padding: '0 14px',
    background: '#fff',
    color: '#334e68',
    border: '1px solid #bcccdc',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
  },
  submit: {
    height: 34,
    padding: '0 16px',
    background: '#0b7285',
    color: '#fff',
    border: '1px solid #0b7285',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 700,
  },
}
