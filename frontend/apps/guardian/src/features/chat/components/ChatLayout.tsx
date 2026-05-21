import type { ReactNode } from 'react'
import styles from './ChatLayout.module.css'

type Props = {
  header: ReactNode
  sidebar: ReactNode
  main: ReactNode
  rightPanel: ReactNode
}

export function ChatLayout({ header, sidebar, main, rightPanel }: Props) {
  return (
    <div className={styles.shell}>
      <div className={styles.headerSlot}>{header}</div>
      <main className={styles.main}>
        <aside>{sidebar}</aside>
        <section>{main}</section>
        <aside>{rightPanel}</aside>
      </main>
    </div>
  )
}
