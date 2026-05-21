import type { ReactNode } from 'react'
import styles from './ActivityLayout.module.css'

type Props = {
  header: ReactNode
  sidebar: ReactNode
  main: ReactNode
}

/**
 * 활동 페이지 셸 — 헤더 / 좌측 사이드 / 메인 영역의 3-슬롯 레이아웃.
 * 사이드는 고정 너비, 메인은 가변. 모바일 등 좁은 뷰포트는 후속 PR 에서 처리.
 */
export function ActivityLayout({ header, sidebar, main }: Props) {
  return (
    <div className={styles.shell}>
      <div className={styles.headerSlot}>{header}</div>
      <div className={styles.body}>
        <aside className={styles.sidebar}>{sidebar}</aside>
        <main className={styles.main}>{main}</main>
      </div>
    </div>
  )
}
