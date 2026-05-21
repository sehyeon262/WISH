import styles from './ActivityEmptyState.module.css'

export type ActivityEmptyVariant = 'empty' | 'loading' | 'error'

type Props = {
  variant?: ActivityEmptyVariant
  icon: string
  title: string
  description?: string
}

export function ActivityEmptyState({ variant = 'empty', icon, title, description }: Props) {
  return (
    <section className={`${styles.empty} ${styles[variant] ?? ''}`}>
      <span aria-hidden className={`${styles.sparkle} ${styles.sparkleA}`}>
        ✦
      </span>
      <span aria-hidden className={`${styles.sparkle} ${styles.sparkleB}`}>
        ✧
      </span>
      <span aria-hidden className={`${styles.sparkle} ${styles.sparkleC}`}>
        ✦
      </span>
      <span aria-hidden className={`${styles.sparkle} ${styles.sparkleD}`}>
        ✧
      </span>
      <div className={styles.iconWrap}>
        <span aria-hidden className={styles.icon}>
          {icon}
        </span>
      </div>
      <h3 className={styles.title}>{title}</h3>
      {description && <p className={styles.description}>{description}</p>}
    </section>
  )
}
