import type { ReportData } from '../data/types'
import { formatWeekLabel } from '../data/week'
import styles from './Sections.module.css'

type Props = {
  data: ReportData
}

export function ReportHero({ data }: Props) {
  const periodLabel = `${formatWeekLabel(data.week)} · ${data.patientName}`
  return (
    <article className={styles.hero} aria-label="주간 리포트 헤더">
      <div className={styles.heroBody}>
        <div className={styles.heroMeta}>
          <span className={styles.heroPeriod}>{periodLabel}</span>
          {data.week.isCurrentWeek && (
            <span className={styles.heroBadge} aria-label="진행 중">
              {data.week.daysElapsed}일째 진행 중
            </span>
          )}
        </div>
        <p className={styles.heroOneLiner}>{data.oneLiner}</p>
      </div>
      <span className={styles.heroSpark} aria-hidden>
        ✨
      </span>
    </article>
  )
}
