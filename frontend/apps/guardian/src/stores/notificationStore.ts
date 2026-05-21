import { create } from 'zustand'

export type NotificationKind =
  | 'GAME_STARTED'
  | 'GAME_ENDED'
  | 'CONTENT_STARTED'
  | 'CONTENT_ENDED'
  | 'DIALOGUE_EMOTION_UPDATED'

export type NotificationItem = {
  id: number
  kind: NotificationKind
  title: string
  description?: string
  /** epoch ms — 알림 패널의 정렬/상대시간 표시용. */
  createdAt: number
  /** 클릭 시 이동할 라우트(있을 때만). 예: GAME_STARTED → '/live'. */
  href?: string
}

type NotificationState = {
  items: NotificationItem[]
  /** 마지막으로 패널을 열어본 이후 새로 들어온 알림 수. 0 이면 bellDot 안 보임. */
  unreadCount: number
  push: (item: Omit<NotificationItem, 'id' | 'createdAt'>) => void
  dismiss: (id: number) => void
  /** 패널이 열릴 때 호출 — 새 알림 카운트만 0 으로 리셋. 항목 자체는 클릭으로 개별 dismiss. */
  markAllRead: () => void
  /** 보호자 로그아웃 등 — 전체 비움. */
  clear: () => void
}

let nextId = 1

// 알림은 30 개까지만 보관 (오래된 것부터 잘림). 패널 UX 와 메모리 모두 보호.
const MAX_ITEMS = 30

export const useNotificationStore = create<NotificationState>(set => ({
  items: [],
  unreadCount: 0,
  push: item =>
    set(state => {
      const newItem: NotificationItem = { ...item, id: nextId++, createdAt: Date.now() }
      const items = [newItem, ...state.items].slice(0, MAX_ITEMS)
      return { items, unreadCount: state.unreadCount + 1 }
    }),
  dismiss: id =>
    set(state => ({
      items: state.items.filter(item => item.id !== id),
    })),
  markAllRead: () => set({ unreadCount: 0 }),
  clear: () => set({ items: [], unreadCount: 0 }),
}))
