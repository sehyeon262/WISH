import type { ReactNode } from 'react'
import styles from './DashboardLayout.module.css'

type Props = {
  header: ReactNode
  movementCard: ReactNode
  insightPanel: ReactNode
  bottomRow: ReactNode
}

export function DashboardLayout({ header, movementCard, insightPanel, bottomRow }: Props) {
  return (
    <div className={styles.shell}>
      <div className={styles.headerSlot}>{header}</div>
      <main className={styles.main}>
        <section className={styles.topGrid}>
          <div>{movementCard}</div>
          <div className={styles.rightStack}>{insightPanel}</div>
        </section>
        <section>{bottomRow}</section>
      </main>
    </div>
  )
}
