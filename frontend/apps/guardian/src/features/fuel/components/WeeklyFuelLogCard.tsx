import type { FuelEvent } from '@wish/api-client'
import { fuelLabelByAmount } from '../data/mock'
import { StarIcon } from './icons'
import styles from './WeeklyFuelLogCard.module.css'

const MAX_BAR_AMOUNT = 25
const WEEK_WINDOW_DAYS = 7

type Props = {
  events: ReadonlyArray<FuelEvent>
}

function todayKstStartMs(): number {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
  return new Date(`${today}T00:00:00+09:00`).getTime()
}

function shortDateKst(iso: string): string {
  const kst = new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
  const [, mm, dd] = kst.split('-')
  return `${parseInt(mm, 10)}/${parseInt(dd, 10)}`
}

export function WeeklyFuelLogCard({ events }: Props) {
  // BE 는 평생 이벤트 전체를 newest-first 로 내려주니, 최근 7일치만 잘라서 노출.
  const cutoffMs = todayKstStartMs() - (WEEK_WINDOW_DAYS - 1) * 24 * 60 * 60 * 1000
  const weekly = events.filter(e => new Date(e.createdAt).getTime() >= cutoffMs)

  return (
    <section className={styles.card}>
      <header className={styles.header}>
        <span className={styles.title}>이번 주 에너지 기록</span>
      </header>

      {weekly.length === 0 ? (
        <div className={styles.empty}>이번 주에 보낸 에너지가 없어요</div>
      ) : (
        <ul className={styles.list}>
          {weekly.map(event => {
            const { label, starColor } = fuelLabelByAmount(event.amount)
            const fillWidth = `${Math.min(100, (event.amount / MAX_BAR_AMOUNT) * 100)}%`
            return (
              <li key={event.id} className={styles.row}>
                <span className={styles.rowDate}>{shortDateKst(event.createdAt)}</span>
                <span className={styles.rowStar}>
                  <StarIcon color={starColor} width={20} height={20} />
                </span>
                <span className={styles.rowLabel}>{label}</span>
                <span className={styles.rowMeta}>
                  <span className={styles.rowBar}>
                    <span
                      className={styles.rowBarFill}
                      style={{ width: fillWidth, background: starColor }}
                    />
                  </span>
                  <span className={styles.rowAmount}>+{event.amount}%</span>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
