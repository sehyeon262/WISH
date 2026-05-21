import type { UsageCompare } from '../data/types'
import styles from './Sections.module.css'

type Props = {
  usage: UsageCompare
}

function formatMinutes(min: number): string {
  if (min < 60) return `${min}분`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`
}

export function UsageRanking({ usage }: Props) {
  const meIndex = usage.ranking.findIndex(r => r.isMe)
  const topFive = usage.ranking.slice(0, 5)
  const meInTop = topFive.some(r => r.isMe)

  const rankRows = [...topFive]
  if (!meInTop && meIndex >= 0) {
    rankRows.push(usage.ranking[meIndex])
  }

  const rankMax = Math.max(...usage.ranking.map(r => r.minutes), usage.othersAverageMinutes, 1)
  const averagePct = (usage.othersAverageMinutes / rankMax) * 100

  return (
    <article className={styles.card} aria-label="순위">
      <header className={styles.cardHead}>
        <h3 className={styles.cardTitle}>순위</h3>
      </header>
      <ol className={styles.rankList}>
        {rankRows.map((r, idx) => {
          const showGap = !meInTop && idx === topFive.length
          return (
            <li
              key={`${r.rank}-${r.name}`}
              className={`${styles.rankRow} ${r.isMe ? styles.rankRowMe : ''} ${showGap ? styles.rankRowGap : ''}`}
            >
              <span className={styles.rankNumber}>{r.rank}</span>
              <span className={styles.rankName}>
                {r.name}
                {r.isMe && <span className={styles.rankMeTag}>나</span>}
              </span>
              <div className={styles.rankBarTrack}>
                <div
                  className={`${styles.rankBarFill} ${r.isMe ? styles.rankBarFillMe : ''}`}
                  style={{ width: `${(r.minutes / rankMax) * 100}%` }}
                />
              </div>
              <span className={styles.rankValue}>{formatMinutes(r.minutes)}</span>
            </li>
          )
        })}
        <li className={`${styles.rankRow} ${styles.rankRowAverage}`}>
          <span className={styles.rankNumber} aria-hidden>
            ⌀
          </span>
          <span className={styles.rankName}>다른 친구들 평균</span>
          <div className={styles.rankBarTrack}>
            <div
              className={`${styles.rankBarFill} ${styles.rankBarFillAverage}`}
              style={{ width: `${averagePct}%` }}
            />
          </div>
          <span className={styles.rankValue}>{formatMinutes(usage.othersAverageMinutes)}</span>
        </li>
      </ol>
    </article>
  )
}
