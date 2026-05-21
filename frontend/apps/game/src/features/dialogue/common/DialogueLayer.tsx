import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import './dialogueCommon.css'

export interface DialogueChoiceView {
  choiceIntentId: string
  text: string
}

interface DialogueLayerProps<TChoice extends DialogueChoiceView> {
  isOpen: boolean
  displayName: string
  portraitSrc?: string
  visibleLines: string[]
  choices?: TChoice[]
  showChoices: boolean
  selectedChoiceId?: string | null
  loading?: boolean
  loadingText?: string
  footerAction?: ReactNode
  showFrame?: boolean
  onSelectChoice?: (choice: TChoice) => void
  onAdvance?: () => void
  onClose?: () => void
  onCancel?: () => void
}

export function DialogueLayer<TChoice extends DialogueChoiceView>({
  isOpen,
  displayName,
  portraitSrc,
  visibleLines,
  choices = [],
  showChoices,
  selectedChoiceId = null,
  loading = false,
  loadingText = '',
  footerAction,
  showFrame = true,
  onSelectChoice,
  onAdvance,
  onClose,
  onCancel,
}: DialogueLayerProps<TChoice>) {
  const [focusedIndex, setFocusedIndex] = useState(0)
  const visibleChoices = useMemo(() => (showChoices ? choices : []), [choices, showChoices])

  useEffect(() => {
    setFocusedIndex(0)
  }, [visibleChoices.length])

  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (showChoices && visibleChoices.length > 0) {
        if (event.key === 'ArrowUp') {
          event.preventDefault()
          event.stopPropagation()
          setFocusedIndex(prev => (prev - 1 + visibleChoices.length) % visibleChoices.length)
          return
        }

        if (event.key === 'ArrowDown') {
          event.preventDefault()
          event.stopPropagation()
          setFocusedIndex(prev => (prev + 1) % visibleChoices.length)
          return
        }

        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          event.stopPropagation()
          onSelectChoice?.(visibleChoices[focusedIndex])
          return
        }
      }

      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        if (showChoices) {
          onCancel?.()
          return
        }
        onAdvance?.()
        if (onAdvance) return
        onClose?.()
      }

      if ((event.key === 'Enter' || event.key === ' ') && !showChoices) {
        event.preventDefault()
        event.stopPropagation()
        onAdvance?.()
        if (footerAction && !onAdvance) onClose?.()
      }
    }

    window.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true })
  }, [
    focusedIndex,
    footerAction,
    isOpen,
    onAdvance,
    onCancel,
    onClose,
    onSelectChoice,
    showChoices,
    visibleChoices,
  ])

  if (!isOpen) return null

  return (
    <div className="dialogue-layer" aria-live="polite">
      <DialogueChoiceOverlay
        choices={visibleChoices}
        focusedIndex={focusedIndex}
        selectedChoiceId={selectedChoiceId}
        onSelectChoice={onSelectChoice}
      />

      {showFrame ? (
        <DialogueFrame
          displayName={displayName}
          portraitSrc={portraitSrc}
          visibleLines={visibleLines}
          loading={loading}
          loadingText={loadingText}
          footerAction={footerAction}
        />
      ) : null}
      {!showFrame && footerAction ? (
        <div className="dialogue-footer-floating">{footerAction}</div>
      ) : null}
      {!showChoices && onAdvance ? (
        <button
          type="button"
          className="dialogue-advance-hitarea"
          aria-label="대화 계속하기"
          onClick={onAdvance}
        />
      ) : null}
    </div>
  )
}

interface DialogueFrameProps {
  displayName: string
  portraitSrc?: string
  visibleLines: string[]
  loading: boolean
  loadingText: string
  footerAction?: ReactNode
}

function DialogueFrame({
  displayName,
  portraitSrc,
  visibleLines,
  loading,
  loadingText,
  footerAction,
}: DialogueFrameProps) {
  return (
    <section className="dialogue-frame">
      <DialoguePortrait displayName={displayName} portraitSrc={portraitSrc} />
      <div className="dialogue-main">
        <div className="dialogue-speaker-name">{displayName}</div>
        {loading ? (
          <DialogueLoadingIndicator text={loadingText} />
        ) : (
          <DialogueText lines={visibleLines} />
        )}
        {footerAction && <div className="dialogue-footer-action">{footerAction}</div>}
      </div>
    </section>
  )
}

function DialoguePortrait({
  displayName,
  portraitSrc,
}: {
  displayName: string
  portraitSrc?: string
}) {
  return (
    <div className="dialogue-portrait" aria-hidden="true">
      {portraitSrc ? <img src={portraitSrc} alt="" /> : <span>{displayName.slice(0, 1)}</span>}
    </div>
  )
}

function DialogueText({ lines }: { lines: string[] }) {
  const safeLines = lines.length > 0 ? lines : ['잠시 후 다시 말을 걸어줘.']

  return (
    <div className="dialogue-text">
      {safeLines.map((line, index) => (
        <p key={`${line}-${index}`}>{line}</p>
      ))}
    </div>
  )
}

function DialogueChoiceOverlay<TChoice extends DialogueChoiceView>({
  choices,
  focusedIndex,
  selectedChoiceId,
  onSelectChoice,
}: {
  choices: TChoice[]
  focusedIndex: number
  selectedChoiceId?: string | null
  onSelectChoice?: (choice: TChoice) => void
}) {
  if (choices.length === 0) return null

  return (
    <div className="dialogue-choice-overlay">
      <div className="dialogue-choice-list">
        {choices.map((choice, index) => (
          <button
            key={choice.choiceIntentId}
            type="button"
            aria-label={choice.text}
            className={[
              'dialogue-choice-button',
              index === focusedIndex ? 'focused' : '',
              selectedChoiceId === choice.choiceIntentId ? 'selected' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onMouseEnter={() => undefined}
            onClick={() => onSelectChoice?.(choice)}
          >
            <span className="dialogue-choice-marker" aria-hidden="true">
              {index + 1}
            </span>
            <span className="dialogue-choice-label">{choice.text}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function DialogueLoadingIndicator({ text }: { text: string }) {
  return (
    <div className="dialogue-loading">
      <span className="dialogue-loading-text">{text}</span>
      <span className="dialogue-loading-dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
    </div>
  )
}
