import styles from './Sections.module.css'

export function EmptyState() {
  return (
    <article className={styles.emptyCard} aria-label="데이터 없음">
      <span className={styles.emptyEmoji} aria-hidden>
        🌱
      </span>
      <span className={styles.emptyTitle}>아직 데이터를 모으는 중이에요</span>
      <p className={styles.emptyBody}>
        조금만 더 함께해주세요. 활동 기록이 쌓이면 이번 주 이야기를 보여드릴게요.
      </p>
    </article>
  )
}
