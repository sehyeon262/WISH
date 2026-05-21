import { useEffect, useState, type CSSProperties } from 'react'
import { DialogueLayer } from '../../dialogue/common/DialogueLayer'
import { resolvePatientProfileIdOrFetch } from '../../exerciseSessions/patientProfile'
import { getNpcIdentity } from '../../npcIdentity'
import {
  LIGHTHOUSE_LOADING_LINE,
  LIGHTHOUSE_OPENING_SAFE_LINES,
  LIGHTHOUSE_OPENING_WELCOME_LINES,
  getLighthouseDemoTranscript,
  useLighthouseEmotionSession,
} from '../useLighthouseEmotionSession'
import type { LighthouseDialogueStatus } from '../types'
import { LighthouseSttOverlay } from './LighthouseSttOverlay'

type LighthouseEmotionControllerProps = {
  patientProfileId: number
  isOpen: boolean
  onClose: () => void
  onTextChange?: (text: string) => void
}

const LIGHTHOUSE_IDENTITY = getNpcIdentity('lighthouse_keeper')
const SAFE_EMPTY_LINE = '괜찮아. 천천히 말해도 된단다.'
const SAFE_FINAL_LINE = '오늘은 여기까지 해도 괜찮아.'

// STT 오버레이 (bottom: clamp(300px, 32vh, 360px)) 와 화면 하단 다이얼로그 박스 사이 빈 영역에 종료 버튼을 띄운다.
// 박스 상단과 겹치지 않도록 박스 위쪽 여유를 충분히 확보하고, STT 오버레이 하단과는 살짝 떨어지도록 조정.
const finishButtonAnchorStyle: CSSProperties = {
  position: 'fixed',
  left: '50%',
  bottom: 'clamp(255px, 26vh, 305px)',
  transform: 'translateX(-50%)',
  zIndex: 41,
  pointerEvents: 'none',
}

const finishButtonStyle: CSSProperties = {
  minHeight: 56,
  padding: '12px 32px',
  borderRadius: 28,
  border: '3px solid #7a5630',
  background: 'rgba(255, 246, 217, 0.96)',
  color: '#4b341f',
  fontSize: 18,
  fontWeight: 700,
  cursor: 'pointer',
  boxShadow: '0 5px 0 rgba(43, 27, 16, 0.26), inset 0 0 0 2px rgba(247, 216, 148, 0.8)',
  fontFamily: '"Pretendard", "Noto Sans KR", "Malgun Gothic", sans-serif',
  letterSpacing: 0.4,
  pointerEvents: 'auto',
}

function isLoadingStatus(status: LighthouseDialogueStatus) {
  return status === 'submitting_chat'
}

function getVisibleLines({
  status,
  currentQuestionText,
  npcResponseLines,
  closingLines,
}: {
  status: LighthouseDialogueStatus
  currentQuestionText: string
  npcResponseLines: string[]
  closingLines: string[]
}) {
  if (status === 'opening_welcome') {
    return LIGHTHOUSE_OPENING_WELCOME_LINES
  }

  if (status === 'opening_safe_line') {
    return LIGHTHOUSE_OPENING_SAFE_LINES
  }

  if (status === 'showing_response') {
    return npcResponseLines.length > 0 ? npcResponseLines : [SAFE_EMPTY_LINE]
  }

  if (status === 'submitting_chat') {
    return [LIGHTHOUSE_LOADING_LINE]
  }

  if (status === 'waiting_final_close' || status === 'finished') {
    return closingLines.length > 0 ? closingLines : [SAFE_FINAL_LINE]
  }

  return currentQuestionText ? [currentQuestionText] : []
}

export function LighthouseEmotionController({
  patientProfileId,
  isOpen,
  onClose,
  onTextChange,
}: LighthouseEmotionControllerProps) {
  const [resolvedPatientProfileId, setResolvedPatientProfileId] = useState<number | undefined>()
  const effectivePatientProfileId =
    Number.isInteger(patientProfileId) && patientProfileId > 0
      ? patientProfileId
      : resolvedPatientProfileId
  const hasValidPatientProfileId =
    Number.isInteger(effectivePatientProfileId) && (effectivePatientProfileId ?? 0) > 0
  const { state, start, advance, submitSttInput, finish, cancel, close, reset } =
    useLighthouseEmotionSession({
      patientProfileId: effectivePatientProfileId ?? 0,
      onFinished: onClose,
    })

  useEffect(() => {
    if (!isOpen) {
      setResolvedPatientProfileId(undefined)
      return
    }

    if (hasValidPatientProfileId) return

    let cancelled = false

    void resolvePatientProfileIdOrFetch().then(id => {
      if (cancelled) return
      setResolvedPatientProfileId(id)
    })

    return () => {
      cancelled = true
    }
  }, [hasValidPatientProfileId, isOpen])

  useEffect(() => {
    if (!isOpen) {
      reset()
      return
    }

    if (state.status === 'idle' && hasValidPatientProfileId) {
      void start()
    }
  }, [hasValidPatientProfileId, isOpen, reset, start, state.status])

  const loading = isLoadingStatus(state.status)
  const visibleLines = getVisibleLines({
    status: state.status,
    currentQuestionText: state.currentQuestionText,
    npcResponseLines: state.npcResponseLines,
    closingLines: state.closingLines,
  })

  useEffect(() => {
    if (!isOpen) return
    if (!hasValidPatientProfileId && state.status === 'idle') return
    const text = visibleLines.join('\n')
    if (!text) return
    onTextChange?.(text)
  }, [hasValidPatientProfileId, isOpen, onTextChange, state.status, visibleLines])

  if (!isOpen) return null

  const isAwaitingUserSpeech =
    state.status === 'entry_question' || state.status === 'showing_response'
  const canAdvance =
    state.status === 'opening_welcome' ||
    state.status === 'opening_safe_line' ||
    state.status === 'waiting_final_close'
  const showFinishButton = isAwaitingUserSpeech && !loading
  // 대화 진행 중에는 ESC 등으로 닫히지 않도록 close/cancel 핸들러를 차단한다.
  // 유일한 종료 경로는 "오늘은 여기까지 대화할래요!" 버튼 → finish('COMPLETED') → BE finish 호출 →
  // status='waiting_final_close' 진입. 그 이후엔 다시 dismiss 가능.
  const isInActiveChat = isAwaitingUserSpeech || loading

  const handleSttSubmit = (transcript: string) => {
    void submitSttInput(transcript)
  }

  const handleFinishClick = () => {
    void finish('COMPLETED')
  }

  return (
    <>
      <DialogueLayer
        isOpen={isOpen}
        displayName={LIGHTHOUSE_IDENTITY.displayName}
        visibleLines={visibleLines}
        choices={[]}
        showChoices={false}
        loading={loading}
        loadingText={LIGHTHOUSE_LOADING_LINE}
        footerAction={null}
        showFrame={false}
        onAdvance={canAdvance ? advance : undefined}
        onClose={isInActiveChat ? undefined : close}
        onCancel={isInActiveChat ? undefined : cancel}
      />
      <LighthouseSttOverlay
        visible={isAwaitingUserSpeech && !loading}
        disabled={loading}
        onSubmit={handleSttSubmit}
        scriptedTranscript={getLighthouseDemoTranscript(state.stepCount)}
      />
      {showFinishButton ? (
        <div style={finishButtonAnchorStyle}>
          <button
            type="button"
            style={finishButtonStyle}
            onClick={handleFinishClick}
            aria-label="영철과의 대화를 오늘은 여기까지 끝내기"
          >
            오늘은 여기까지 대화할래요!
          </button>
        </div>
      ) : null}
    </>
  )
}
