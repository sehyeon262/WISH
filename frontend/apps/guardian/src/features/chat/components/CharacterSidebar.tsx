import type { CSSProperties } from 'react'
import type { ChatCharacter, EmotionTone } from '../data/mock'
import type { NpcDialogueStatus } from '../hooks'
import styles from './CharacterSidebar.module.css'

type Props = {
  characters: ChatCharacter[]
  selectedId: string
  onSelect: (id: string) => void
  statuses?: Record<string, NpcDialogueStatus>
}

const TONE_LABEL: Record<EmotionTone, string> = {
  calm: '안정',
  tired: '피로',
  worried: '걱정',
}

const TONE_CLASS: Record<EmotionTone, string> = {
  calm: styles.toneCalm,
  tired: styles.toneTired,
  worried: styles.toneWorried,
}

export function CharacterSidebar({ characters, selectedId, onSelect, statuses }: Props) {
  return (
    <div className={styles.card}>
      <h3 className={styles.title}>대화 기록</h3>
      <div className={styles.list}>
        {characters.map(c => {
          const isActive = c.id === selectedId
          const status = statuses?.[c.id]
          const tone = status?.tone ?? null
          const hasSession = !!status?.hasSession
          return (
            <button
              key={c.id}
              type="button"
              className={`${styles.item} ${isActive ? styles.itemActive : ''}`}
              onClick={() => onSelect(c.id)}
            >
              <span className={styles.avatar}>
                {c.avatarUrl ? (
                  <img
                    src={c.avatarUrl}
                    alt=""
                    className={styles.avatarImg}
                    style={
                      {
                        ...(c.thumbOffsetY ? { '--thumb-offset-y': c.thumbOffsetY } : {}),
                        ...(c.thumbScale ? { '--thumb-scale': c.thumbScale } : {}),
                      } as CSSProperties
                    }
                  />
                ) : null}
              </span>
              <span className={styles.meta}>
                <span className={styles.name}>{c.name}</span>
                {tone ? (
                  <span className={styles.statusRow}>
                    <span className={`${styles.tone} ${TONE_CLASS[tone]}`}>{TONE_LABEL[tone]}</span>
                    {status?.isLatest ? <span className={styles.recentBadge}>최근</span> : null}
                  </span>
                ) : hasSession ? (
                  <span className={styles.statusRow}>
                    <span className={`${styles.tone} ${styles.toneNeutral}`}>대화 있음</span>
                    {status?.isLatest ? <span className={styles.recentBadge}>최근</span> : null}
                  </span>
                ) : (
                  <span className={`${styles.tone} ${styles.toneNone}`}>대화 없음</span>
                )}
              </span>
              {isActive && <span className={styles.check}>✓</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
