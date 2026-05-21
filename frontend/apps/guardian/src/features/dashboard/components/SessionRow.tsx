import { useMyPatientId } from '@/features/auth/hooks/useMyPatientId'
import { useGymnasticsDashboardSummary } from '../hooks'
import { ChevronLeftIcon, ChevronRightIcon } from './icons'
import styles from './SessionRow.module.css'

function formatDurationSec(seconds: number): string {
  const safeSeconds = Math.max(0, Math.round(seconds))
  if (safeSeconds < 60) return `${safeSeconds}초`

  const minutes = Math.floor(safeSeconds / 60)
  const remainingSeconds = safeSeconds % 60
  if (remainingSeconds === 0) return `${minutes}분`
  return `${minutes}분 ${remainingSeconds}초`
}

export function SessionRow() {
  const { data: patientId } = useMyPatientId()
  const { data: summary, isError, isLoading } = useGymnasticsDashboardSummary(patientId, 7)
  const sessions = summary?.recentSessions ?? []
  const sessionsUnavailable = isError || summary?.sessionStatsAvailable === false

  return (
    <div className={styles.row}>
      <section className={styles.recent}>
        <span className={styles.recentTitle}>최근 체조 기록</span>
        <button type="button" className={styles.recentArrow} aria-label="이전 기록" disabled>
          <ChevronLeftIcon className={styles.recentArrowIcon} />
        </button>
        <div className={styles.recentList}>
          {sessionsUnavailable ? (
            <div className={styles.recentEmpty}>최근 체조 세션을 불러오지 못했습니다.</div>
          ) : sessions.length === 0 ? (
            <div className={styles.recentEmpty}>
              {isLoading ? '기록을 불러오는 중입니다.' : '최근 체조 세션이 없습니다.'}
            </div>
          ) : (
            sessions.map(session => (
              <article
                key={session.id}
                className={`${styles.session} ${session.isToday ? styles.sessionToday : ''}`}
              >
                <span className={styles.sessionLabel}>
                  <span
                    className={`${styles.sessionDate} ${
                      session.isToday ? styles.sessionTodayLabel : ''
                    }`}
                  >
                    {session.shortDate}
                  </span>
                  <span className={styles.sessionWeekday}>{session.weekday}</span>
                </span>
                <span className={styles.sessionMetric}>
                  <strong>{formatDurationSec(session.durationSec)}</strong>
                  <span>
                    {session.exerciseTypeLabel} · {session.completedMotionCount}개
                  </span>
                </span>
              </article>
            ))
          )}
        </div>
        <button type="button" className={styles.recentArrow} aria-label="다음 기록" disabled>
          <ChevronRightIcon className={styles.recentArrowIcon} />
        </button>
      </section>
    </div>
  )
}
