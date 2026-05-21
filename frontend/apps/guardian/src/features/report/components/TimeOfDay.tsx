import type { TimeBucket, TimeBucketId } from '../data/types'
import styles from './Sections.module.css'

type Props = {
  buckets: TimeBucket[]
  topBucketId: TimeBucketId
}

function bucketInsight(top: TimeBucket | undefined, buckets: TimeBucket[]): string {
  if (!top) return '이번 주는 활동 데이터가 부족해요'
  const night = buckets.find(b => b.id === 'night')
  if (night && night.minutes >= 30) {
    return `밤 늦은 시간 사용이 ${night.minutes}분 있었어요. 충분한 휴식도 함께해요 🌱`
  }
  const labelMap: Record<TimeBucketId, string> = {
    morning: '아침',
    day: '낮',
    evening: '저녁',
    night: '밤',
  }
  return `주로 ${labelMap[top.id]} ${top.range}에 함께했어요 🌙`
}

export function TimeOfDay({ buckets, topBucketId }: Props) {
  const top = buckets.find(b => b.id === topBucketId) ?? buckets[0]
  const maxValue = Math.max(...buckets.map(b => b.minutes), 1)

  return (
    <article className={styles.card} aria-label="시간대 분포">
      <header className={styles.cardHead}>
        <h3 className={styles.cardTitle}>언제 함께했나요</h3>
      </header>
      <div className={styles.bucketList}>
        {buckets.map(b => {
          const pct = (b.minutes / maxValue) * 100
          return (
            <div key={b.id} className={styles.bucketRow}>
              <div className={styles.bucketLabel}>
                <span className={styles.bucketLabelName}>{b.label}</span>
                <span className={styles.bucketLabelRange}>{b.range}</span>
              </div>
              <div className={styles.bucketTrack}>
                <div className={styles.bucketFill} data-id={b.id} style={{ width: `${pct}%` }} />
              </div>
              <span className={styles.bucketValue}>{b.minutes}분</span>
            </div>
          )
        })}
      </div>
      <div className={styles.bucketInsight}>{bucketInsight(top, buckets)}</div>
    </article>
  )
}
