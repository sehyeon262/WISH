import { useEffect, useState } from 'react'
import { updatePatientProfile } from '@wish/api-client'
import { setCachedPatientNickname } from '../exerciseSessions/patientProfile'

const NICKNAME_MIN = 2
const NICKNAME_MAX = 30

type NicknameEditOverlayProps = {
  open: boolean
  patientProfileId: number | undefined
  currentNickname: string | null
  onSaved: (nickname: string) => void
  onCancel: () => void
}

const styles = {
  backdrop: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(20, 12, 4, 0.55)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    fontFamily:
      '"Pretendard Variable", Pretendard, "Noto Sans KR", -apple-system, BlinkMacSystemFont, sans-serif',
  },
  card: {
    width: 'min(420px, 92vw)',
    background: '#fffbf3',
    border: '3px solid #a8845a',
    borderRadius: 18,
    padding: '28px 26px 22px',
    boxShadow: '0 20px 50px rgba(20, 12, 4, 0.4)',
    color: '#3b332b',
  },
  title: {
    margin: 0,
    fontSize: 20,
    fontWeight: 700,
  },
  subtitle: {
    margin: '6px 0 18px',
    fontSize: 13,
    color: '#7b7063',
  },
  input: {
    width: '100%',
    boxSizing: 'border-box' as const,
    padding: '12px 14px',
    fontSize: 18,
    fontWeight: 600,
    border: '2px solid #e5d9c7',
    borderRadius: 12,
    background: '#fff',
    color: '#3b332b',
    fontFamily: 'inherit',
    outline: 'none',
  },
  notice: {
    marginTop: 12,
    padding: '10px 12px',
    background: '#f3eadc',
    borderRadius: 10,
    fontSize: 12.5,
    color: '#665743',
    lineHeight: 1.5,
  },
  errorText: {
    marginTop: 8,
    minHeight: 18,
    fontSize: 12.5,
    color: '#a85b4d',
  },
  buttons: {
    display: 'flex',
    gap: 12,
    marginTop: 16,
  },
  cancel: {
    flex: 1,
    padding: '11px 16px',
    background: 'transparent',
    color: '#665743',
    border: '2px solid #e0d5c4',
    borderRadius: 999,
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer' as const,
    fontFamily: 'inherit',
  },
  submit: {
    flex: 2,
    padding: '11px 16px',
    background: '#8b7a61',
    color: '#fff',
    border: 'none',
    borderRadius: 999,
    fontSize: 15,
    fontWeight: 700,
    cursor: 'pointer' as const,
    fontFamily: 'inherit',
  },
  submitDisabled: {
    background: '#c9bda9',
    cursor: 'not-allowed' as const,
  },
}

function validate(value: string): string | null {
  const trimmed = value.trim()
  if (trimmed.length < NICKNAME_MIN || trimmed.length > NICKNAME_MAX) {
    return `${NICKNAME_MIN}~${NICKNAME_MAX}자로 입력해줘`
  }
  return null
}

export function NicknameEditOverlay({
  open,
  patientProfileId,
  currentNickname,
  onSaved,
  onCancel,
}: NicknameEditOverlayProps) {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setValue(currentNickname ?? '')
      setError(null)
      setSubmitting(false)
    }
  }, [open, currentNickname])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onCancel, submitting])

  if (!open) return null

  const trimmed = value.trim()
  const isDirty = trimmed !== (currentNickname ?? '')
  const validationError = isDirty ? validate(value) : null
  const canSubmit = !!patientProfileId && isDirty && !validationError && !submitting

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit || !patientProfileId) return
    setSubmitting(true)
    setError(null)
    try {
      const response = await updatePatientProfile(patientProfileId, { nickname: trimmed })
      const saved = response.data.nickname
      setCachedPatientNickname(saved)
      onSaved(saved)
    } catch {
      setError('닉네임 변경에 실패했어. 잠시 후 다시 시도해줘.')
      setSubmitting(false)
    }
  }

  return (
    <div style={styles.backdrop} role="dialog" aria-modal="true">
      <form style={styles.card} onSubmit={handleSubmit}>
        <h2 style={styles.title}>닉네임 변경</h2>
        <p style={styles.subtitle}>게임 안에서 보일 이름을 적어줘</p>
        <input
          autoFocus
          type="text"
          value={value}
          maxLength={NICKNAME_MAX}
          style={styles.input}
          onChange={e => {
            setValue(e.target.value)
            if (error) setError(null)
          }}
          disabled={submitting}
          aria-label="닉네임"
          placeholder={`${NICKNAME_MIN}~${NICKNAME_MAX}자`}
        />
        <div style={styles.errorText}>{validationError ?? error ?? ''}</div>
        <p style={styles.notice}>
          닉네임은 마을·게임 안 친구들에게 보이는 이름이고, 예전에 만든 작품·사진의 작가 이름에도
          같이 적용돼.
        </p>
        <div style={styles.buttons}>
          <button type="button" style={styles.cancel} onClick={onCancel} disabled={submitting}>
            취소
          </button>
          <button
            type="submit"
            style={canSubmit ? styles.submit : { ...styles.submit, ...styles.submitDisabled }}
            disabled={!canSubmit}
          >
            {submitting ? '저장 중…' : '저장'}
          </button>
        </div>
      </form>
    </div>
  )
}
