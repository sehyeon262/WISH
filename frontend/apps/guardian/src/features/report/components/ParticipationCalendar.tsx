import type { ParticipationDay } from '../data/types'
import styles from './Sections.module.css'

const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일']

type Props = {
  days: ParticipationDay[]
}

export function ParticipationCalendar({ days }: Props) {
  const total = days.reduce((s, d) => s + d.minutes, 0)
  const participated = days.filter(d => d.intensity > 0).length
  return (
    <article className={styles.card} aria-label="참여 캘린더">
      <header className={styles.cardHead}>
        <h3 className={styles.cardTitle}>참여 캘린더</h3>
        <span style={{ fontSize: 11.5, color: 'var(--dash-color-text-muted)', fontWeight: 600 }}>
          이번 주 {participated}일 함께했어요
        </span>
      </header>
      <div className={styles.calendar} role="grid">
        {days.map((d, i) => (
          <div key={d.date} className={styles.calendarCell} role="gridcell">
            <div
              className={styles.calendarDot}
              data-intensity={d.intensity}
              title={`${d.date} · ${d.minutes}분`}
              aria-label={`${WEEKDAYS[i]}요일 ${d.minutes}분`}
            >
              {d.minutes > 0 ? d.minutes : ''}
            </div>
            <span className={styles.calendarDay}>{WEEKDAYS[i]}</span>
          </div>
        ))}
      </div>
      <div className={styles.calendarFooter}>
        <span>총 {total}분</span>
        <span className={styles.calendarLegend}>
          적음
          <span
            className={styles.calendarLegendSwatch}
            style={{ background: 'var(--report-color-grass-1)' }}
          />
          <span
            className={styles.calendarLegendSwatch}
            style={{ background: 'var(--report-color-grass-2)' }}
          />
          <span
            className={styles.calendarLegendSwatch}
            style={{ background: 'var(--report-color-grass-3)' }}
          />
          <span
            className={styles.calendarLegendSwatch}
            style={{ background: 'var(--report-color-grass-4)' }}
          />
          많음
        </span>
      </div>
    </article>
  )
}
