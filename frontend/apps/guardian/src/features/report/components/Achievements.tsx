import type { GameAchievement } from '../data/types'
import styles from './Sections.module.css'

type Props = {
  achievements: GameAchievement[]
}

function formatMinutes(min: number): string {
  if (min < 60) return `${min}분`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`
}

export function Achievements({ achievements }: Props) {
  return (
    <article className={styles.card} aria-label="게임별 성취">
      <header className={styles.cardHead}>
        <h3 className={styles.cardTitle}>게임별 성취</h3>
      </header>
      <div className={styles.achievementList}>
        {achievements.map(a => (
          <div
            key={a.gameId}
            className={`${styles.achievementCard} ${a.hasData ? '' : styles.achievementCardEmpty}`}
          >
            <div className={styles.achievementHead}>
              <span className={styles.achievementName}>{a.label}</span>
              {a.highlight && <span className={styles.achievementHighlight}>⭐ {a.highlight}</span>}
            </div>
            <span className={styles.achievementMinutes}>
              {a.minutes > 0 ? formatMinutes(a.minutes) : '0분'}
            </span>
            <div className={styles.achievementStats}>
              {a.hasData && a.stats.length > 0 ? (
                a.stats.map((s, i) => (
                  <span key={i} className={styles.achievementStat}>
                    {s.prefix}
                    {s.strong ? (
                      <span className={styles.achievementStatStrong}>{s.value}</span>
                    ) : (
                      s.value
                    )}
                  </span>
                ))
              ) : (
                <span className={styles.achievementEmptyText}>이번 주에 아직 안 했어요</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </article>
  )
}
