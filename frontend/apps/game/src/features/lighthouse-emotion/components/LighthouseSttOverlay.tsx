import { useEffect, useState, type CSSProperties } from 'react'
import { transcribeLighthouseAudio } from '../lighthouseEmotionClient'
import { useWhisperRecorder } from '../useWhisperRecorder'

type LighthouseSttOverlayProps = {
  visible: boolean
  disabled: boolean
  onSubmit: (transcript: string) => void
  scriptedTranscript?: string
}

const overlayStyle: CSSProperties = {
  position: 'fixed',
  left: '50%',
  bottom: 'clamp(300px, 32vh, 360px)',
  zIndex: 40,
  width: 'min(720px, 60vw)',
  transform: 'translateX(-50%)',
  pointerEvents: 'none',
}

const panelStyle: CSSProperties = {
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 14,
  padding: 18,
  borderRadius: 12,
  border: '4px solid #7a5630',
  background: 'rgba(255, 243, 212, 0.96)',
  boxShadow: '0 6px 0 rgba(43, 27, 16, 0.26), inset 0 0 0 2px rgba(247, 216, 148, 0.8)',
  pointerEvents: 'auto',
}

const micButtonBase: CSSProperties = {
  width: 92,
  height: 92,
  borderRadius: '50%',
  border: '4px solid #7a5630',
  background: '#fff3d4',
  color: '#4b341f',
  fontSize: 40,
  fontWeight: 800,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  boxShadow: '0 5px 0 rgba(43, 27, 16, 0.26), inset 0 0 0 2px rgba(247, 216, 148, 0.8)',
  transition: 'transform 140ms ease, background 140ms ease, color 140ms ease',
}

const micButtonListening: CSSProperties = {
  background: '#ffb4a2',
  borderColor: '#7a2f1f',
  color: '#7a2f1f',
}

const statusTextStyle: CSSProperties = {
  fontFamily: '"Pretendard", "Noto Sans KR", "Malgun Gothic", sans-serif',
  fontSize: 'clamp(16px, 1.05vw, 20px)',
  fontWeight: 700,
  color: '#4b341f',
  textAlign: 'center',
  minHeight: 24,
}

const hintBoxStyle: CSSProperties = {
  width: '100%',
  minHeight: 48,
  padding: '10px 14px',
  borderRadius: 8,
  border: '2px dashed rgba(122, 86, 48, 0.55)',
  background: 'rgba(255, 255, 255, 0.55)',
  fontFamily: '"Pretendard", "Noto Sans KR", "Malgun Gothic", sans-serif',
  fontSize: 'clamp(16px, 1.05vw, 20px)',
  color: '#3a2814',
  whiteSpace: 'pre-wrap',
  textAlign: 'center',
}

const errorTextStyle: CSSProperties = {
  fontFamily: '"Pretendard", "Noto Sans KR", "Malgun Gothic", sans-serif',
  fontSize: 14,
  color: '#9a2f1f',
  textAlign: 'center',
}

const sendButtonStyle: CSSProperties = {
  minHeight: 44,
  padding: '10px 28px',
  borderRadius: 22,
  border: '3px solid #7a5630',
  background: '#fff3d4',
  color: '#4b341f',
  fontSize: 16,
  fontWeight: 700,
  cursor: 'pointer',
  boxShadow: '0 4px 0 rgba(43, 27, 16, 0.26), inset 0 0 0 2px rgba(247, 216, 148, 0.8)',
  fontFamily: '"Pretendard", "Noto Sans KR", "Malgun Gothic", sans-serif',
  letterSpacing: 0.3,
}

const transcriptTextStyle: CSSProperties = {
  fontWeight: 700,
  color: '#2b1b10',
}

export function LighthouseSttOverlay({
  visible,
  disabled,
  onSubmit,
  scriptedTranscript,
}: LighthouseSttOverlayProps) {
  const [transcript, setTranscript] = useState<string>('')
  const { supported, status, errorMessage, start, stop, reset } = useWhisperRecorder({
    transcribe: audio => Promise.resolve(scriptedTranscript ?? transcribeLighthouseAudio(audio)),
    onFinalResult: text => {
      setTranscript(text)
    },
  })

  useEffect(() => {
    if (!visible) {
      setTranscript('')
      reset()
    }
  }, [reset, visible])

  if (!visible) return null

  const isRecording = status === 'recording'
  const isTranscribing = status === 'transcribing'
  const hasTranscript = transcript.length > 0 && status === 'idle'
  const buttonDisabled = disabled || !supported || status === 'denied' || isTranscribing

  const statusLine = !supported
    ? '여기서는 마이크로 말하기를 쓸 수 없어요.'
    : status === 'denied'
      ? '마이크를 쓸 수 있게 허락해 주세요.'
      : isTranscribing
        ? '하고 싶은 말을 글자로 바꾸고 있어요...'
        : isRecording
          ? '듣고 있어요. 다 말한 다음에 다시 마이크를 눌러줘!'
          : hasTranscript
            ? '이렇게 말한 것 같아. 맞으면 보내고, 아니면 마이크를 다시 눌러줘!'
            : '마이크 그림을 누르고 말해봐!'

  const hintNode = isRecording ? (
    '천천히 말해도 괜찮아.'
  ) : isTranscribing ? (
    '잠시만 기다려줘.'
  ) : hasTranscript ? (
    <span style={transcriptTextStyle}>{transcript}</span>
  ) : (
    '마이크를 누르고 말한 다음, 다시 누르면 영철 할아버지에게 전해져요.'
  )

  const handleClick = () => {
    if (buttonDisabled) return
    if (isRecording) {
      stop()
      return
    }
    setTranscript('')
    void start()
  }

  const handleSubmit = () => {
    if (!hasTranscript) return
    const text = transcript
    setTranscript('')
    reset()
    onSubmit(text)
  }

  return (
    <div style={overlayStyle} role="group" aria-label="말하기">
      <div style={panelStyle}>
        <button
          type="button"
          disabled={buttonDisabled}
          aria-pressed={isRecording}
          aria-label={isRecording ? '말하기 멈추기' : '말하기 시작하기'}
          style={{
            ...micButtonBase,
            ...(isRecording ? micButtonListening : null),
            opacity: buttonDisabled ? 0.55 : 1,
            cursor: buttonDisabled ? 'not-allowed' : 'pointer',
          }}
          onClick={handleClick}
        >
          {isRecording ? '■' : '🎤'}
        </button>
        <div style={statusTextStyle} aria-live="polite">
          {statusLine}
        </div>
        <div style={hintBoxStyle} aria-live="polite">
          {hintNode}
        </div>
        {hasTranscript ? (
          <button
            type="button"
            style={sendButtonStyle}
            onClick={handleSubmit}
            aria-label="말한 내용을 영철에게 보내기"
          >
            이대로 보낼래!
          </button>
        ) : null}
        {errorMessage ? <div style={errorTextStyle}>{errorMessage}</div> : null}
      </div>
    </div>
  )
}
