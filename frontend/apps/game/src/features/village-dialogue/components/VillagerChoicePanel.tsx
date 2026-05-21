import type { CSSProperties } from 'react'
import type { VillagerChoice } from '../types'
import { VillagerChoiceButton } from './VillagerChoiceButton'

type VillagerChoicePanelProps = {
  choices: VillagerChoice[]
  disabled: boolean
  onSelect: (choice: VillagerChoice) => void
}

const panelStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexWrap: 'wrap',
  gap: 8,
  width: '100%',
  boxSizing: 'border-box',
  padding: '8px 10px 10px',
  border: '2px solid rgba(137, 94, 53, 0.7)',
  borderRadius: 14,
  background: 'rgba(248, 228, 188, 0.9)',
  boxShadow: '0 3px 0 rgba(83, 53, 27, 0.22), inset 0 0 0 2px rgba(255, 250, 235, 0.48)',
  backdropFilter: 'blur(1px)',
}

export function VillagerChoicePanel({ choices, disabled, onSelect }: VillagerChoicePanelProps) {
  return (
    <div style={panelStyle}>
      {choices.slice(0, 3).map(choice => (
        <VillagerChoiceButton
          key={choice.choiceIntentId}
          choice={choice}
          disabled={disabled}
          onSelect={onSelect}
        />
      ))}
    </div>
  )
}
