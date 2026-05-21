import type { CSSProperties } from 'react'
import type { EmotionChoiceViewModel } from '../types'

type LighthouseChoiceButtonProps = {
  choice: EmotionChoiceViewModel
  selected: boolean
  disabled: boolean
  focused?: boolean
  secondary?: boolean
  onFocus?: () => void
  onClick: () => void
}

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
  boxShadow: '0 5px 0 rgba(43, 27, 16, 0.26), inset 0 0 0 2px rgba(247, 216, 148, 0.8)',
  cursor: 'pointer',
  imageRendering: 'pixelated',
  transition: 'background 140ms ease, color 140ms ease, opacity 140ms ease, transform 140ms ease',
}

const activeStyle: CSSProperties = {
  background: '#fff0c8',
  borderColor: '#5a3516',
  color: '#24180f',
  boxShadow: '0 5px 0 rgba(43, 27, 16, 0.28), inset 0 0 0 2px rgba(255, 255, 255, 0.95)',
}

const secondaryStyle: CSSProperties = {
  marginTop: 8,
  background: '#f7e3bd',
}

const innerLineStyle: CSSProperties = {
  position: 'absolute',
  inset: 7,
  border: '2px solid rgba(247, 216, 148, 0.82)',
  borderRadius: 4,
  pointerEvents: 'none',
}

const textStyle: CSSProperties = {
  minWidth: 0,
  textAlign: 'center',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

export function LighthouseChoiceButton({
  choice,
  selected,
  disabled,
  focused = false,
  secondary = false,
  onFocus,
  onClick,
}: LighthouseChoiceButtonProps) {
  const isActive = selected || focused

  return (
    <button
      type="button"
      disabled={disabled}
      style={{
        ...buttonStyle,
        ...(secondary ? secondaryStyle : null),
        ...(isActive ? activeStyle : null),
        opacity: disabled ? 0.65 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        outline: focused ? '3px solid rgba(255, 240, 180, 0.78)' : 'none',
        outlineOffset: focused ? 3 : 0,
      }}
      onClick={onClick}
      onPointerDown={event => {
        if (!disabled) {
          event.currentTarget.style.transform = 'translateY(2px)'
          event.currentTarget.style.boxShadow =
            '0 3px 0 rgba(43, 27, 16, 0.26), inset 0 0 0 2px rgba(255, 255, 255, 0.85)'
        }
      }}
      onPointerUp={event => {
        event.currentTarget.style.transform = 'translateY(0)'
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
        event.currentTarget.style.background = isActive
          ? '#fff0c8'
          : secondary
            ? '#f7e3bd'
            : '#fff3d4'
        event.currentTarget.style.borderColor = isActive ? '#5a3516' : '#7a5630'
        event.currentTarget.style.color = isActive ? '#24180f' : '#4b341f'
        event.currentTarget.style.boxShadow =
          '0 5px 0 rgba(43, 27, 16, 0.26), inset 0 0 0 2px rgba(247, 216, 148, 0.8)'
      }}
      onFocus={() => {
        if (!disabled) onFocus?.()
      }}
    >
      <span style={innerLineStyle} />
      <span style={textStyle}>{choice.text}</span>
    </button>
  )
}
