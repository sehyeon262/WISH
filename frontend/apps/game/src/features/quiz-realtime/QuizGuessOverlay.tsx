import { useEffect, useRef, useState } from 'react'

/**
 * 그림 퀴즈 정답 입력 오버레이 (S14P31E103-820).
 *
 * <p>Phaser 자체 키 입력은 한글 IME (composition 이벤트) 처리가 안 돼서 영문/숫자만 들어간다. HTML {@code <input>} 으로
 * 우회 — {@code QuizJoinCodeOverlay} 와 동일 패턴.
 *
 * <p>입력 / 입력 버튼 / 나가기 버튼이 한 줄에 같이 있다. 나가기를 같이 두는 이유: Phaser canvas 의 나가기 버튼을
 * 누르려고 하면 input focus blur 와 Phaser POINTER_DOWN 이 첫 클릭에서 꼬임. HTML 안에 두면 그 충돌 없음.
 */

type QuizGuessOverlayProps = {
  open: boolean
  onSubmit: (text: string) => void
  onLeave: () => void
}

const MAX_LENGTH = 40

const styles = {
  wrapper: {
    position: 'fixed' as const,
    left: '50%',
    bottom: 32,
    transform: 'translateX(-50%)',
    zIndex: 1000,
    display: 'flex',
    gap: 10,
    alignItems: 'center',
    fontFamily:
      '"Pretendard Variable", Pretendard, "Noto Sans KR", -apple-system, BlinkMacSystemFont, sans-serif',
  },
  input: {
    width: 'min(420px, 60vw)',
    boxSizing: 'border-box' as const,
    padding: '14px 18px',
    fontSize: 18,
    fontWeight: 600,
    border: '2px solid #3b4864',
    borderRadius: 14,
    background: '#0f1626',
    color: '#ffffff',
    outline: 'none',
    fontFamily: 'inherit',
    boxShadow: '0 10px 30px rgba(0, 0, 0, 0.45)',
  },
  submit: {
    padding: '12px 22px',
    background: '#f4a64a',
    color: '#1a0e05',
    border: 'none',
    borderRadius: 999,
    fontSize: 16,
    fontWeight: 700,
    cursor: 'pointer' as const,
    boxShadow: '0 8px 22px rgba(0, 0, 0, 0.4)',
  },
  submitDisabled: {
    background: '#5a6473',
    color: '#cfd6e3',
    cursor: 'not-allowed' as const,
  },
  leave: {
    padding: '12px 18px',
    background: 'rgba(15, 22, 38, 0.85)',
    color: '#ffe9c2',
    border: '2px solid #91a5c4',
    borderRadius: 999,
    fontSize: 15,
    fontWeight: 700,
    cursor: 'pointer' as const,
    boxShadow: '0 8px 22px rgba(0, 0, 0, 0.4)',
    fontFamily: 'inherit',
  },
}

export function QuizGuessOverlay({ open, onSubmit, onLeave }: QuizGuessOverlayProps) {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      // 라운드 시작/재오픈 시 자동 포커스 + 잔여 텍스트 초기화. 사용자가 손가락으로 다른 곳 누르고 다시 와도 흐름이 깔끔.
      setValue('')
      const handle = window.setTimeout(() => inputRef.current?.focus(), 20)
      return () => window.clearTimeout(handle)
    }
    setValue('')
    return undefined
  }, [open])

  if (!open) return null

  const trimmed = value.trim()
  const canSubmit = trimmed.length > 0

  const submit = () => {
    if (!canSubmit) return
    onSubmit(trimmed)
    setValue('')
    // 다시 포커스 — 다음 추측 입력을 위해.
    inputRef.current?.focus()
  }

  return (
    <form
      style={styles.wrapper}
      onSubmit={e => {
        e.preventDefault()
        submit()
      }}
    >
      <input
        ref={inputRef}
        style={styles.input}
        maxLength={MAX_LENGTH}
        value={value}
        placeholder="정답을 입력하세요"
        onChange={e => setValue(e.target.value)}
        aria-label="정답 입력"
      />
      <button
        type="submit"
        style={canSubmit ? styles.submit : { ...styles.submit, ...styles.submitDisabled }}
        disabled={!canSubmit}
      >
        입력
      </button>
      <button type="button" style={styles.leave} onClick={onLeave} aria-label="방 나가기">
        나가기
      </button>
    </form>
  )
}
