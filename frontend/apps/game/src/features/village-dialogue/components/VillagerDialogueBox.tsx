import type { CSSProperties, ReactNode } from 'react'
import { assetPath } from '@/game/assets/assetPath'

type VillagerDialogueBoxProps = {
  npcName: string
  text: string
  children?: ReactNode
  onClose: () => void
}

const backdropStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 40,
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'center',
  padding: '0 20px max(18px, 2vh)',
  background: 'rgba(16, 22, 24, 0.08)',
  pointerEvents: 'auto',
}

const boxStyle: CSSProperties = {
  position: 'relative',
  width: 'min(920px, calc(100vw - 32px))',
  aspectRatio: '1720 / 620',
  backgroundImage: `url("${assetPath('images/village/ui/dialogframe.png')}")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'center',
  backgroundSize: '100% 100%',
  filter: 'drop-shadow(0 18px 24px rgba(45, 31, 19, 0.22))',
  fontFamily: '"Pretendard", "Noto Sans KR", "Malgun Gothic", sans-serif',
}

const headerStyle: CSSProperties = {
  position: 'absolute',
  top: '13%',
  left: '25%',
  width: '25%',
  height: '13%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  pointerEvents: 'none',
}

const nameStyle: CSSProperties = {
  margin: 0,
  color: '#4a2b17',
  fontSize: 'clamp(18px, 2.6vw, 34px)',
  fontWeight: 900,
  lineHeight: 1.2,
  letterSpacing: 0,
  whiteSpace: 'nowrap',
}

const closeStyle: CSSProperties = {
  position: 'absolute',
  top: '10%',
  right: '7%',
  width: 'clamp(32px, 4vw, 46px)',
  height: 'clamp(32px, 4vw, 46px)',
  border: '2px solid rgba(93, 55, 29, 0.55)',
  borderRadius: 8,
  background: 'rgba(255, 248, 232, 0.78)',
  color: '#4a2b17',
  fontSize: 'clamp(20px, 3vw, 28px)',
  fontWeight: 900,
  cursor: 'pointer',
  zIndex: 2,
}

const textStyle: CSSProperties = {
  position: 'absolute',
  left: '30.8%',
  top: '43%',
  width: '61%',
  minHeight: '22%',
  margin: 0,
  color: '#2d2117',
  fontSize: 'clamp(19px, 2.7vw, 34px)',
  fontWeight: 800,
  lineHeight: 1.35,
  letterSpacing: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
  wordBreak: 'keep-all',
}

const contentStyle: CSSProperties = {
  position: 'absolute',
  left: '29.5%',
  right: '7.5%',
  bottom: '9%',
}

export function VillagerDialogueBox({
  npcName,
  text,
  children,
  onClose,
}: VillagerDialogueBoxProps) {
  return (
    <div style={backdropStyle} role="dialog" aria-modal="true" aria-labelledby="villager-name">
      <section style={boxStyle}>
        <header style={headerStyle}>
          <h2 id="villager-name" style={nameStyle}>
            {npcName}
          </h2>
        </header>
        <button type="button" aria-label="닫기" style={closeStyle} onClick={onClose}>
          ×
        </button>
        <p style={textStyle}>{text}</p>
        <div style={contentStyle}>{children}</div>
      </section>
    </div>
  )
}
