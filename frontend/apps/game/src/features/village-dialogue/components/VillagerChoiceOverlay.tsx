import { useEffect, useMemo, useState, type CSSProperties, type KeyboardEvent } from 'react'
import type { VillagerChoice } from '../types'
import { VillagerChoiceButton } from './VillagerChoiceButton'

type VillagerChoiceOverlayProps = {
  choices: VillagerChoice[]
  disabled: boolean
  selectedChoiceId: string | null
  onSelect: (choice: VillagerChoice) => void
  onCancel: () => void
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

export function VillagerChoiceOverlay({
  choices,
  disabled,
  selectedChoiceId,
  onSelect,
  onCancel,
}: VillagerChoiceOverlayProps) {
  const visibleChoices = useMemo(() => choices.slice(0, 3), [choices])
  const [focusedIndex, setFocusedIndex] = useState(0)

  useEffect(() => {
    setFocusedIndex(0)
  }, [visibleChoices])

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled || visibleChoices.length === 0) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setFocusedIndex(index => (index + 1) % visibleChoices.length)
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setFocusedIndex(index => (index - 1 + visibleChoices.length) % visibleChoices.length)
      return
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onSelect(visibleChoices[focusedIndex])
      return
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      onCancel()
    }
  }

  return (
    <div style={overlayStyle} aria-label="대화 선택지">
      <div style={listStyle} role="listbox" tabIndex={0} onKeyDown={handleKeyDown}>
        {visibleChoices.map((choice, index) => (
          <VillagerChoiceButton
            key={choice.choiceIntentId}
            choice={choice}
            disabled={disabled}
            focused={index === focusedIndex}
            selected={choice.choiceIntentId === selectedChoiceId}
            onFocus={() => setFocusedIndex(index)}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  )
}
