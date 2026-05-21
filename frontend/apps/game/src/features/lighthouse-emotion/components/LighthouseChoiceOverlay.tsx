import { useEffect, useMemo, useState, type CSSProperties, type KeyboardEvent } from 'react'
import type { EmotionChoiceViewModel } from '../types'
import { LighthouseChoiceButton } from './LighthouseChoiceButton'

type LighthouseChoiceOverlayProps = {
  visible: boolean
  choices: EmotionChoiceViewModel[]
  secondaryAction: EmotionChoiceViewModel | null
  selectedChoiceIntentId: string | null
  disabled: boolean
  onSelect: (choice: EmotionChoiceViewModel) => void
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

const listStyle: CSSProperties = {
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  pointerEvents: 'auto',
}

export function LighthouseChoiceOverlay({
  visible,
  choices,
  secondaryAction,
  selectedChoiceIntentId,
  disabled,
  onSelect,
}: LighthouseChoiceOverlayProps) {
  const visibleChoices = useMemo(
    () => choices.filter(choice => choice.choiceIntentId !== 'rest_today').slice(0, 3),
    [choices],
  )
  const allChoices = useMemo(
    () =>
      secondaryAction?.choiceIntentId === 'rest_today'
        ? [...visibleChoices, secondaryAction]
        : visibleChoices,
    [secondaryAction, visibleChoices],
  )
  const [focusedIndex, setFocusedIndex] = useState(0)

  useEffect(() => {
    setFocusedIndex(0)
  }, [allChoices])

  if (!visible) return null

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled || allChoices.length === 0) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setFocusedIndex(index => (index + 1) % allChoices.length)
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setFocusedIndex(index => (index - 1 + allChoices.length) % allChoices.length)
      return
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onSelect(allChoices[focusedIndex])
    }
  }

  return (
    <div style={overlayStyle} aria-label="등대지기 선택지">
      <div style={listStyle} role="listbox" tabIndex={0} onKeyDown={handleKeyDown}>
        {visibleChoices.map((choice, index) => (
          <LighthouseChoiceButton
            key={choice.choiceIntentId}
            choice={choice}
            selected={selectedChoiceIntentId === choice.choiceIntentId}
            focused={index === focusedIndex}
            disabled={disabled}
            onFocus={() => setFocusedIndex(index)}
            onClick={() => onSelect(choice)}
          />
        ))}

        {secondaryAction?.choiceIntentId === 'rest_today' && (
          <LighthouseChoiceButton
            choice={secondaryAction}
            selected={selectedChoiceIntentId === secondaryAction.choiceIntentId}
            focused={focusedIndex === visibleChoices.length}
            disabled={disabled}
            secondary
            onFocus={() => setFocusedIndex(visibleChoices.length)}
            onClick={() => onSelect(secondaryAction)}
          />
        )}
      </div>
    </div>
  )
}
