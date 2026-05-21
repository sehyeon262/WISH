import { useNavigate } from 'react-router-dom'
import { Area, AreaChart, ResponsiveContainer } from 'recharts'
import type { RomJointTrend } from '../data/types'
import styles from './Sections.module.css'

type Props = {
  trends: RomJointTrend[]
}

function deltaClass(delta: number): string {
  if (delta > 0) return styles.romDeltaUp
  if (delta === 0) return styles.romDeltaFlat
  return styles.romDeltaDown
}

function deltaLabel(delta: number, unit: string): string {
  if (delta === 0) return `유지 ${unit}`
  const sign = delta > 0 ? '+' : ''
  return `${sign}${delta}${unit}`
}

const TONE_COLORS: Record<RomJointTrend['tone'], { from: string; to: string }> = {
  lavender: { from: '#a892ff', to: '#7c5cff' },
  mint: { from: '#6ddec0', to: '#34c99c' },
  pink: { from: '#ffc1d4', to: '#ff8db1' },
  cyan: { from: '#a8e1ed', to: '#6ec9e0' },
}

export function RomTrend({ trends }: Props) {
  const navigate = useNavigate()

  // 측정 데이터 자체가 없을 때 — 가짜 수치 보여주는 대신 수집 중 안내.
  if (trends.length === 0) {
    return (
      <article className={styles.card} aria-label="ROM 추이">
        <header className={styles.cardHead}>
          <h3 className={styles.cardTitle}>가동 범위 추이</h3>
          <button type="button" className={styles.cardAction} onClick={() => navigate('/rom')}>
            측정 시작
          </button>
        </header>
        <p className={styles.romCollecting}>
          ROM 측정 데이터를 수집 중이에요. 자세 분석을 시작하면 여기에 변화가 나타나요.
        </p>
      </article>
    )
  }

  const biggestImprovement = trends.reduce<RomJointTrend | null>((best, t) => {
    if (!best || t.delta > best.delta) return t
    return best
  }, null)

  return (
    <article className={styles.card} aria-label="ROM 추이">
      <header className={styles.cardHead}>
        <h3 className={styles.cardTitle}>가동 범위 추이</h3>
        <button type="button" className={styles.cardAction} onClick={() => navigate('/rom')}>
          상세 보기
        </button>
      </header>

      <div className={styles.romList}>
        {trends.map((t, idx) => {
          const colors = TONE_COLORS[t.tone]
          const gradId = `rom-area-${idx}`
          const lineId = `rom-line-${idx}`
          return (
            <div key={t.joint} className={styles.romRow}>
              <div className={styles.romRowHead}>
                <div className={styles.romJoint}>
                  <span className={styles.romJointName}>{t.joint}</span>
                  <span className={styles.romJointValue}>
                    {t.current}
                    <span className={styles.romJointUnit}>{t.unit}</span>
                  </span>
                </div>
                <span className={`${styles.romDelta} ${deltaClass(t.delta)}`}>
                  {deltaLabel(t.delta, t.unit)}
                </span>
              </div>
              <div className={styles.romChart}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={t.trend} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
                    <defs>
                      <linearGradient id={lineId} x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor={colors.from} />
                        <stop offset="100%" stopColor={colors.to} />
                      </linearGradient>
                      <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={colors.from} stopOpacity={0.32} />
                        <stop offset="100%" stopColor={colors.from} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke={`url(#${lineId})`}
                      strokeWidth={2}
                      fill={`url(#${gradId})`}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )
        })}
      </div>

      {biggestImprovement && biggestImprovement.delta > 0 && (
        <div className={styles.romHighlight}>
          ✨ {biggestImprovement.joint} {biggestImprovement.delta}
          {biggestImprovement.unit} 개선 — 이번 주 가장 큰 변화예요
        </div>
      )}
    </article>
  )
}
