import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useNotificationStore, type NotificationItem } from '@/stores/notificationStore'
import styles from './NotificationPanel.module.css'

type Props = {
  onClose: () => void
}

// 헤더 종 아이콘 클릭으로 열리는 알림 패널.
// 클릭 시 closeOnSelect — 항목 클릭하면 dismiss + (href 있으면 navigate) + 패널 닫음.
// 패널 자체의 외부 클릭/escape 닫기는 호출자(HeaderBar) 가 관리한다.
export function NotificationPanel({ onClose }: Props) {
  const items = useNotificationStore(state => state.items)
  const dismiss = useNotificationStore(state => state.dismiss)
  const clear = useNotificationStore(state => state.clear)
  const navigate = useNavigate()

  const handleItemClick = useCallback(
    (item: NotificationItem) => {
      dismiss(item.id)
      if (item.href) navigate(item.href)
      onClose()
    },
    [dismiss, navigate, onClose],
  )

  return (
    <div className={styles.panel} role="dialog" aria-label="알림">
      <div className={styles.header}>
        <h3 className={styles.headerTitle}>알림</h3>
        {items.length > 0 ? (
          <button
            type="button"
            className={styles.clearAll}
            onClick={event => {
              event.stopPropagation()
              clear()
            }}
          >
            모두 지우기
          </button>
        ) : null}
      </div>
      {items.length === 0 ? (
        <p className={styles.empty}>새 알림이 없어요</p>
      ) : (
        <ul className={styles.list}>
          {items.map(item => (
            <li
              key={item.id}
              className={`${styles.item} ${item.kind === 'GAME_STARTED' ? styles.itemLive : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => handleItemClick(item)}
              onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  handleItemClick(item)
                }
              }}
            >
              <div className={styles.itemMain}>
                <p className={styles.itemTitle}>{item.title}</p>
                {item.description ? (
                  <p className={styles.itemDescription}>{item.description}</p>
                ) : null}
                <p className={styles.itemTime}>{formatRelative(item.createdAt)}</p>
              </div>
              <button
                type="button"
                className={styles.dismiss}
                aria-label="알림 삭제"
                onClick={event => {
                  event.stopPropagation()
                  dismiss(item.id)
                }}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function formatRelative(epochMs: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - epochMs) / 1000))
  if (diffSec < 60) return '방금'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}분 전`
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return `${diffHour}시간 전`
  const diffDay = Math.floor(diffHour / 24)
  return `${diffDay}일 전`
}
