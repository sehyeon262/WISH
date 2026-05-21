import { useEffect } from 'react'
import type { CSSProperties, ReactNode } from 'react'

type Tone = 'default' | 'danger'

type Props = {
  open: boolean
  title: string
  description?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  tone?: Tone
  loading?: boolean
  onConfirm: () => void | Promise<void>
  onCancel: () => void
}

export function ConfirmModal({
  open,
  title,
  description,
  confirmLabel = '확인',
  cancelLabel = '취소',
  tone = 'default',
  loading = false,
  onConfirm,
  onCancel,
}: Props) {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !loading) onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, loading, onCancel])

  if (!open) return null

  return (
    <div style={styles.backdrop} role="presentation" onClick={loading ? undefined : onCancel}>
      <div
        style={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        onClick={event => event.stopPropagation()}
      >
        <h2 id="confirm-modal-title" style={styles.title}>
          {title}
        </h2>
        {description && <div style={styles.description}>{description}</div>}
        <div style={styles.actions}>
          <button type="button" onClick={onCancel} style={styles.cancel} disabled={loading}>
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => void onConfirm()}
            style={tone === 'danger' ? styles.confirmDanger : styles.confirm}
            disabled={loading}
          >
            {loading ? '처리 중' : confirmLabel}
          </button>
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
    maxWidth: 420,
    background: '#fff',
    border: '1px solid #d9e2ec',
    borderRadius: 10,
    boxShadow: '0 20px 50px rgba(16, 42, 67, 0.18)',
    padding: 22,
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  title: {
    margin: 0,
    color: '#102a43',
    fontSize: 16,
    lineHeight: 1.35,
    letterSpacing: 0,
  },
  description: {
    color: '#486581',
    fontSize: 13,
    lineHeight: 1.55,
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
  confirm: {
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
  confirmDanger: {
    height: 34,
    padding: '0 16px',
    background: '#c92a2a',
    color: '#fff',
    border: '1px solid #c92a2a',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 700,
  },
}
