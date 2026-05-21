import type { WeeklyReportAiSummary } from '@wish/api-client'
import styles from './AiInsightCard.module.css'

type Props = {
  data: WeeklyReportAiSummary | undefined
  isLoading: boolean
  isError: boolean
}

export function AiInsightCard({ data, isLoading, isError }: Props) {
  // 로딩 중에는 skeleton — 카드 영역 자체는 유지해서 레이아웃 점핑 방지.
  if (isLoading) {
    return (
      <article className={styles.card} aria-label="AI 인사이트 (로딩 중)" aria-busy="true">
        <div className={styles.head}>
          <span className={styles.badge}>
            <span className={styles.badgeSpark} aria-hidden>
              ✨
            </span>
            AI 인사이트
          </span>
        </div>
        <div className={styles.summary}>
          <div className={styles.skeletonRow} />
          <div className={styles.skeletonRow} />
          <div className={styles.skeletonRowShort} />
        </div>
      </article>
    )
  }

  // useQuery 실패(서버 자체 미응답/네트워크 오류) — 카드를 통째로 숨겨서 리포트는 항상 노출.
  // 서버까지 닿았지만 AI 실패한 경우는 isFallback=true 응답으로 내려와 정상 렌더링 경로를 탄다.
  if (isError || !data) {
    return null
  }

  return (
    <article className={styles.card} aria-label="AI 인사이트">
      <div className={styles.head}>
        <span className={styles.badge}>
          <span className={styles.badgeSpark} aria-hidden>
            ✨
          </span>
          AI 인사이트
        </span>
      </div>

      <div className={styles.summary}>
        {data.summary.map((line, idx) => (
          <p key={idx} className={styles.summaryLine}>
            {line}
          </p>
        ))}
      </div>

      {(data.activityObservations.length > 0 || data.emotionObservations.length > 0) && (
        <div className={styles.observations}>
          {data.activityObservations.length > 0 && (
            <section className={styles.obsGroup} aria-label="활동 관찰">
              <span className={styles.obsTitle}>활동에서</span>
              <ul className={styles.obsList}>
                {data.activityObservations.map((obs, idx) => (
                  <li key={idx} className={styles.obsItem}>
                    {obs}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {data.emotionObservations.length > 0 && (
            <section className={styles.obsGroup} aria-label="정서 관찰">
              <span className={styles.obsTitle}>대화에서</span>
              <ul className={styles.obsList}>
                {data.emotionObservations.map((obs, idx) => (
                  <li key={idx} className={styles.obsItem}>
                    {obs}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {data.connection && <p className={styles.connection}>{data.connection}</p>}

      {data.suggestion && (
        <div className={styles.suggestion}>
          <span className={styles.suggestionEmoji} aria-hidden>
            💡
          </span>
          <p className={styles.suggestionText}>{data.suggestion}</p>
        </div>
      )}
    </article>
  )
}
