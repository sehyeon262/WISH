import type { UsageCompare } from '../data/types'
import styles from './Sections.module.css'

type Props = {
  usage: UsageCompare
  daysElapsed: number
}

function formatMinutes(min: number): string {
  if (min < 60) return `${min}분`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`
}

function frameMessage(self: number, others: number): string {
  const diff = self - others
  if (diff > 10) {
    return `다른 친구들보다 ${formatMinutes(Math.abs(diff))} 더 함께했어요 ✨`
  }
  if (diff < -10) {
    return `다른 친구들보다 조금 적었어요. 다음 주엔 함께 도전해볼까요?`
  }
  return `다른 친구들과 비슷한 시간을 보내고 있어요`
}

export function UsageHero({ usage, daysElapsed }: Props) {
  const dailyAvg = daysElapsed > 0 ? Math.round(usage.selfMinutes / daysElapsed) : 0
  const myRank = usage.ranking.findIndex(r => r.isMe) + 1

  return (
    <article className={styles.card} aria-label="사용 시간">
      <header className={styles.usageTopRow}>
        <h3 className={styles.cardTitle}>사용 시간</h3>
        {myRank > 0 && (
          <span className={styles.rankBadge}>
            <strong>{myRank}</strong>위 / {usage.ranking.length}명
          </span>
        )}
      </header>
      <div className={styles.usageStatRow}>
        <div className={styles.usageHeadline}>
          <span className={styles.usageBigValue}>{formatMinutes(usage.selfMinutes)}</span>
          <span className={styles.usageBigSub}>하루 평균 {formatMinutes(dailyAvg)}</span>
        </div>
        <div className={styles.usageFrame}>
          {frameMessage(usage.selfMinutes, usage.othersAverageMinutes)}
        </div>
      </div>
    </article>
  )
}
