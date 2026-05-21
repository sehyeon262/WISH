import { useEffect, useState } from 'react'
import { useNotificationStore, type NotificationItem } from '@/stores/notificationStore'
import styles from './NotificationPreview.module.css'

type Props = {
  /** 패널이 열려 있으면 미리보기 숨김 — 같은 알림이 두 군데서 동시에 보이는 것 방지. */
  hidden?: boolean
}

const PREVIEW_VISIBLE_MS = 2_000
const PREVIEW_LEAVE_MS = 220

// 새 알림이 push 될 때 헤더 우측 아래에 잠깐 떴다가 2초 뒤 사라지는 미리보기 토스트.
// 패널을 열어둔 동안엔 hidden 으로 가려진다 (목록과 중복 노출 방지).
export function NotificationPreview({ hidden }: Props) {
  const [previewItem, setPreviewItem] = useState<NotificationItem | null>(null)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    // notificationStore 의 push 결과로 items[0] 의 id 가 바뀌면 새 알림 — 그때만 표시.
    let lastSeenId: number | null = useNotificationStore.getState().items[0]?.id ?? null
    return useNotificationStore.subscribe(state => {
      const head = state.items[0]
      if (!head) return
      if (head.id === lastSeenId) return
      lastSeenId = head.id
      setLeaving(false)
      setPreviewItem(head)
    })
  }, [])

  useEffect(() => {
    if (!previewItem) return
    if (hidden) {
      // 표시 중이었는데 패널이 열리면 즉시 정리.
      setPreviewItem(null)
      setLeaving(false)
      return
    }
    const leaveTimer = window.setTimeout(() => setLeaving(true), PREVIEW_VISIBLE_MS)
    const removeTimer = window.setTimeout(() => {
      setPreviewItem(null)
      setLeaving(false)
    }, PREVIEW_VISIBLE_MS + PREVIEW_LEAVE_MS)
    return () => {
      window.clearTimeout(leaveTimer)
      window.clearTimeout(removeTimer)
    }
  }, [previewItem, hidden])

  if (!previewItem || hidden) return null

  return (
    <div className={`${styles.preview} ${leaving ? styles.previewLeaving : ''}`} role="status">
      <p className={styles.title}>{previewItem.title}</p>
      {previewItem.description ? (
        <p className={styles.description}>{previewItem.description}</p>
      ) : null}
    </div>
  )
}
