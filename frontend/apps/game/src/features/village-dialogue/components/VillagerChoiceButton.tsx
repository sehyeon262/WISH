import type { CSSProperties } from 'react'
import type { VillagerChoice } from '../types'

type VillagerChoiceButtonProps = {
  choice: VillagerChoice
  disabled: boolean
  focused?: boolean
  selected?: boolean
  onFocus?: () => void
  onSelect: (choice: VillagerChoice) => void
}

const normalShadow = '0 5px 0 rgba(43, 27, 16, 0.26), inset 0 0 0 2px rgba(247, 216, 148, 0.8)'
const pressedShadow = '0 3px 0 rgba(43, 27, 16, 0.26), inset 0 0 0 2px rgba(255, 255, 255, 0.85)'

const buttonStyle: CSSProperties = {
  position: 'relative',
  width: '100%',
  height: 58,
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  padding: '0 34px',
  boxSizing: 'border-box',
  border: '4px solid #7a5630',
  borderRadius: 8,
  background: '#fff3d4',
  color: '#4b341f',
  fontFamily: '"Pretendard", "Noto Sans KR", "Malgun Gothic", sans-serif',
  fontSize: 'clamp(21px, 1.35vw, 26px)',
  fontWeight: 800,
  letterSpacing: 0,
  lineHeight: 1,
  wordBreak: 'keep-all',
  textAlign: 'center',
  boxShadow: normalShadow,
  cursor: 'pointer',
  imageRendering: 'pixelated',
  transition: 'background 140ms ease, color 140ms ease, opacity 140ms ease, transform 140ms ease',
}

const activeButtonStyle: CSSProperties = {
  background: '#fff0c8',
  borderColor: '#5a3516',
  color: '#24180f',
  boxShadow: '0 5px 0 rgba(43, 27, 16, 0.28), inset 0 0 0 2px rgba(255, 255, 255, 0.95)',
}

const pressedButtonStyle: CSSProperties = {
  transform: 'translateY(2px)',
  boxShadow: pressedShadow,
}

const textStyle: CSSProperties = {
  minWidth: 0,
  textAlign: 'center',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

const innerLineStyle: CSSProperties = {
  position: 'absolute',
  inset: 7,
  border: '2px solid rgba(247, 216, 148, 0.82)',
  borderRadius: 4,
  pointerEvents: 'none',
}

export function VillagerChoiceButton({
  choice,
  disabled,
  focused = false,
  selected = false,
  onFocus,
  onSelect,
}: VillagerChoiceButtonProps) {
  const isActive = focused || selected

  return (
    <button
      type="button"
      disabled={disabled}
      style={{
        ...buttonStyle,
        ...(isActive ? activeButtonStyle : null),
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        outline: focused ? '3px solid rgba(255, 240, 180, 0.78)' : 'none',
        outlineOffset: focused ? 3 : 0,
      }}
      onClick={() => onSelect(choice)}
      onPointerDown={event => {
        if (!disabled) Object.assign(event.currentTarget.style, pressedButtonStyle)
      }}
      onPointerUp={event => {
        event.currentTarget.style.transform = 'translateY(0)'
        event.currentTarget.style.boxShadow = isActive
          ? '0 5px 0 rgba(43, 27, 16, 0.28), inset 0 0 0 2px rgba(255, 255, 255, 0.95)'
          : normalShadow
      }}
      onPointerEnter={event => {
        if (!disabled) {
          onFocus?.()
          event.currentTarget.style.background = '#fff0c8'
          event.currentTarget.style.borderColor = '#5a3516'
          event.currentTarget.style.color = '#24180f'
        }
      }}
      onPointerLeave={event => {
        event.currentTarget.style.transform = 'translateY(0)'
        event.currentTarget.style.background = isActive ? '#fff0c8' : '#fff3d4'
        event.currentTarget.style.borderColor = isActive ? '#5a3516' : '#7a5630'
        event.currentTarget.style.color = isActive ? '#24180f' : '#4b341f'
        event.currentTarget.style.boxShadow = isActive
          ? '0 5px 0 rgba(43, 27, 16, 0.28), inset 0 0 0 2px rgba(255, 255, 255, 0.95)'
          : normalShadow
      }}
      onFocus={event => {
        if (!disabled) {
          onFocus?.()
          event.currentTarget.style.background = '#fff0c8'
          event.currentTarget.style.borderColor = '#5a3516'
          event.currentTarget.style.color = '#24180f'
        }
      }}
      onBlur={event => {
        event.currentTarget.style.background = isActive ? '#fff0c8' : '#fff3d4'
        event.currentTarget.style.borderColor = isActive ? '#5a3516' : '#7a5630'
        event.currentTarget.style.color = isActive ? '#24180f' : '#4b341f'
      }}
    >
      <span style={innerLineStyle} />
      <span style={textStyle}>{choice.text}</span>
    </button>
  )
}
