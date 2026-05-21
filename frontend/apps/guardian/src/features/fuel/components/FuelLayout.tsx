import type { ReactNode } from 'react'
import styles from './FuelLayout.module.css'

type Props = {
  header: ReactNode
  leftCard: ReactNode
  rightStack: ReactNode
}

export function FuelLayout({ header, leftCard, rightStack }: Props) {
  return (
    <div className={styles.shell}>
      <div className={styles.headerSlot}>{header}</div>
      <main className={styles.main}>
        <div>{leftCard}</div>
        <div className={styles.rightStack}>{rightStack}</div>
      </main>
    </div>
  )
}
