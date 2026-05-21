import type { ReportSummary } from '../data/types'
import styles from './Sections.module.css'

type Tone = 'primary' | 'mint' | 'pink' | 'yellow'

type MetricCardProps = {
  label: string
  value: string
  unit?: string
  diff: number
  diffUnit?: string
  tone: Tone
}

function diffClass(diff: number): string {
  if (diff > 0) return styles.metricDiffUp
  if (diff === 0) return styles.metricDiffFlat
  return styles.metricDiffDown
}

function diffLabel(diff: number, unit?: string): string {
  if (diff === 0) return '지난주와 같아요'
  const sign = diff > 0 ? '+' : ''
  return `${sign}${diff}${unit ?? ''}`
}

function MetricCard({ label, value, unit, diff, diffUnit, tone }: MetricCardProps) {
  return (
    <article className={styles.metricCard} data-tone={tone}>
      <span className={styles.metricLabel}>{label}</span>
      <span className={styles.metricValue}>
        {value}
        {unit && <span className={styles.metricValueUnit}>{unit}</span>}
      </span>
      <span className={`${styles.metricDiff} ${diffClass(diff)}`}>
        {diff > 0 ? '↑' : diff < 0 ? '↓' : '–'} {diffLabel(diff, diffUnit)}
      </span>
    </article>
  )
}

type Props = {
  summary: ReportSummary
}

function formatMinutes(min: number): { value: string; unit: string } {
  if (min < 60) return { value: String(min), unit: '분' }
  const h = Math.floor(min / 60)
  const m = min % 60
  return { value: m === 0 ? `${h}` : `${h}시간 ${m}`, unit: m === 0 ? '시간' : '분' }
}

export function MetricCards({ summary }: Props) {
  const time = formatMinutes(summary.totalMinutes)
  return (
    <div className={styles.metricGrid}>
      <MetricCard
        label="참여 일수"
        value={`${summary.participatedDays}`}
        unit={`/ 7일`}
        diff={summary.diff.participatedDays}
        diffUnit="일"
        tone="primary"
      />
      <MetricCard
        label="총 사용 시간"
        value={time.value}
        unit={time.unit}
        diff={summary.diff.totalMinutes}
        diffUnit="분"
        tone="mint"
      />
      <MetricCard
        label="게임 플레이"
        value={`${summary.sessionCount}`}
        unit="회"
        diff={summary.diff.sessionCount}
        diffUnit="회"
        tone="pink"
      />
      <MetricCard
        label="받은 에너지"
        value={summary.fuelEarned.toLocaleString()}
        unit="%"
        diff={summary.diff.fuelEarned}
        diffUnit="%"
        tone="yellow"
      />
    </div>
  )
}
