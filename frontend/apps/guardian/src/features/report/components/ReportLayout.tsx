import type { ReactNode } from 'react'
import styles from './ReportLayout.module.css'

type Props = {
  header: ReactNode
  content: ReactNode
}

export function ReportLayout({ header, content }: Props) {
  return (
    <div className={styles.shell}>
      <div className={styles.headerSlot}>{header}</div>
      <main className={styles.main}>
        <section className={styles.stack}>{content}</section>
      </main>
    </div>
  )
}
