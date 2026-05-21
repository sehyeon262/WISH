import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import logoUrl from '@/assets/logo.png'
import { NotificationPanel, NotificationPreview } from '@/features/notifications'
import { useAuthStore } from '@/shared/auth/store'
import { useNotificationStore } from '@/stores/notificationStore'
import { calcKoreanAge, useMyPatient } from '@/features/auth/hooks/useMyPatient'
import { PATIENT } from '../data/mock'
import {
  ActivityIcon,
  BellIcon,
  ChatIcon,
  ChevronDownIcon,
  ClipboardIcon,
  ExerciseIcon,
  FuelIcon,
  LiveIcon,
  LogoutIcon,
  type HomeIcon,
} from './icons'
import styles from './HeaderBar.module.css'

type TabId = 'exercise' | 'chat' | 'activity' | 'reports' | 'live' | 'fuel'

const TABS: ReadonlyArray<{ id: TabId; label: string; Icon: typeof HomeIcon; to?: string }> = [
  { id: 'exercise', label: '신체', Icon: ExerciseIcon, to: '/' },
  { id: 'chat', label: '감정', Icon: ChatIcon, to: '/chat' },
  { id: 'activity', label: '활동', Icon: ActivityIcon, to: '/activity' },
  { id: 'reports', label: '리포트', Icon: ClipboardIcon, to: '/reports' },
  { id: 'live', label: '실시간', Icon: LiveIcon, to: '/live' },
  { id: 'fuel', label: '에너지', Icon: FuelIcon, to: '/fuel' },
]

function activeTabFromPath(pathname: string): TabId {
  if (pathname.startsWith('/chat')) return 'chat'
  if (pathname.startsWith('/activity')) return 'activity'
  if (pathname.startsWith('/reports')) return 'reports'
  if (pathname.startsWith('/live')) return 'live'
  if (pathname.startsWith('/fuel')) return 'fuel'
  return 'exercise'
}

export function HeaderBar() {
  const location = useLocation()
  const active = activeTabFromPath(location.pathname)
  const [menuOpen, setMenuOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const profileRef = useRef<HTMLDivElement>(null)
  const notificationRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const clearAuth = useAuthStore(s => s.clear)
  const { data: patient } = useMyPatient()
  const itemCount = useNotificationStore(s => s.items.length)

  const displayName = patient?.nickname ?? patient?.name ?? ''
  const ageValue = patient?.birthDate ? calcKoreanAge(patient.birthDate) : null
  const displayMeta = patient ? (ageValue != null ? `아이 · ${ageValue}세` : '아이') : ''

  useEffect(() => {
    if (!menuOpen) return
    const handleClick = (event: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('click', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('click', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [menuOpen])

  useEffect(() => {
    if (!notificationsOpen) return
    const handleClick = (event: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setNotificationsOpen(false)
      }
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setNotificationsOpen(false)
    }
    document.addEventListener('click', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('click', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [notificationsOpen])

  const handleLogout = () => {
    setMenuOpen(false)
    clearAuth()
    navigate('/login', { replace: true })
  }

  const handleBellClick = useCallback(() => {
    setNotificationsOpen(prev => !prev)
  }, [])

  return (
    <header className={styles.header}>
      <Link to="/" className={styles.brand} aria-label="대시보드로 이동">
        <img src={logoUrl} alt="WISH" className={styles.brandLogo} />
      </Link>

      <nav className={styles.tabs}>
        {TABS.map(({ id, label, Icon, to }) => {
          const isActive = id === active
          return (
            <button
              key={id}
              type="button"
              className={`${styles.tab} ${isActive ? styles.tabActive : ''}`}
              onClick={() => {
                if (to) navigate(to)
              }}
            >
              <Icon className={styles.tabIcon} />
              {label}
            </button>
          )
        })}
      </nav>

      <div className={styles.right}>
        <div className={styles.notificationWrap} ref={notificationRef}>
          <button
            type="button"
            className={styles.iconBtn}
            aria-label={itemCount > 0 ? `알림 ${itemCount}개` : '알림'}
            aria-haspopup="dialog"
            aria-expanded={notificationsOpen}
            onClick={handleBellClick}
          >
            <BellIcon width={20} height={20} />
            {itemCount > 0 && !notificationsOpen ? (
              <span
                className={`${styles.bellCount} ${itemCount > 9 ? styles.bellCountWide : ''}`}
                aria-hidden
              >
                {itemCount > 9 ? '9+' : itemCount}
              </span>
            ) : null}
          </button>
          {notificationsOpen ? (
            <NotificationPanel onClose={() => setNotificationsOpen(false)} />
          ) : (
            <NotificationPreview />
          )}
        </div>
        <div className={styles.profileWrap} ref={profileRef}>
          <button
            type="button"
            className={styles.profile}
            onClick={() => setMenuOpen(open => !open)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <span className={styles.avatar}>
              <img src={PATIENT.avatarUrl} alt="" />
            </span>
            <span className={styles.profileText}>
              <span className={styles.profileName}>{displayName}</span>
              <span className={styles.profileMeta}>{displayMeta}</span>
            </span>
            <ChevronDownIcon className={`${styles.chev} ${menuOpen ? styles.chevOpen : ''}`} />
          </button>
          {menuOpen && (
            <div className={styles.menu} role="menu">
              <button
                type="button"
                className={styles.menuItem}
                role="menuitem"
                onClick={handleLogout}
              >
                <LogoutIcon className={styles.menuItemIcon} />
                로그아웃
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
