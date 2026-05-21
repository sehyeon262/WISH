import type { CSSProperties, ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../auth/store'

type Props = {
  title: string
  description?: string
  actions?: ReactNode
  children: ReactNode
}

export function AdminShell({ title, description, actions, children }: Props) {
  const navigate = useNavigate()
  const { email, clear } = useAuthStore()

  const onLogout = () => {
    clear()
    navigate('/login', { replace: true })
  }

  return (
    <div style={styles.shell}>
      <aside style={styles.sidebar}>
        <div style={styles.brand}>
          <span style={styles.brandMark}>W</span>
          <div>
            <strong style={styles.brandTitle}>WISH Admin</strong>
            <span style={styles.brandSub}>운영 콘솔</span>
          </div>
        </div>

        <nav style={styles.nav}>
          <NavLink to="/dashboard" style={({ isActive }) => navLinkStyle(isActive)}>
            대시보드
          </NavLink>
          <NavLink to="/users" style={({ isActive }) => navLinkStyle(isActive)}>
            유저 관리
          </NavLink>
          <NavLink to="/motions" style={({ isActive }) => navLinkStyle(isActive)}>
            모션 관리
          </NavLink>
          <NavLink to="/taekwondo-motions" style={({ isActive }) => navLinkStyle(isActive)}>
            태권도 관리
          </NavLink>
        </nav>
      </aside>

      <div style={styles.workspace}>
        <header style={styles.header}>
          <div style={styles.titleBlock}>
            <h1 style={styles.title}>{title}</h1>
            {description && <p style={styles.description}>{description}</p>}
          </div>
          <div style={styles.headerRight}>
            {actions}
            <span style={styles.userBadge}>{email}</span>
            <button onClick={onLogout} style={styles.logout}>
              로그아웃
            </button>
          </div>
        </header>
        <main style={styles.main}>{children}</main>
      </div>
    </div>
  )
}

function navLinkStyle(isActive: boolean): CSSProperties {
  return {
    display: 'block',
    padding: '10px 12px',
    borderRadius: 6,
    color: isActive ? '#102a43' : '#486581',
    background: isActive ? '#e6f6ff' : 'transparent',
    border: isActive ? '1px solid #b3ecff' : '1px solid transparent',
    textDecoration: 'none',
    fontSize: 14,
    fontWeight: isActive ? 700 : 500,
  }
}

const styles: Record<string, CSSProperties> = {
  shell: {
    minHeight: '100vh',
    display: 'flex',
    background: '#f4f7f9',
    color: '#102a43',
  },
  sidebar: {
    width: 220,
    flexShrink: 0,
    padding: 20,
    background: '#fff',
    borderRight: '1px solid #d9e2ec',
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 24,
  },
  brandMark: {
    width: 34,
    height: 34,
    display: 'grid',
    placeItems: 'center',
    borderRadius: 8,
    background: '#0b7285',
    color: '#fff',
    fontWeight: 800,
  },
  brandTitle: {
    display: 'block',
    fontSize: 15,
  },
  brandSub: {
    display: 'block',
    marginTop: 2,
    color: '#829ab1',
    fontSize: 12,
  },
  nav: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  workspace: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    minHeight: 72,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 16,
    padding: '16px 28px',
    background: '#fff',
    borderBottom: '1px solid #d9e2ec',
  },
  titleBlock: {
    minWidth: 0,
  },
  title: {
    margin: 0,
    fontSize: 22,
    lineHeight: 1.25,
    letterSpacing: 0,
  },
  description: {
    margin: '4px 0 0',
    color: '#627d98',
    fontSize: 13,
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
    flexWrap: 'wrap',
  },
  userBadge: {
    maxWidth: 220,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    padding: '7px 10px',
    background: '#f0f4f8',
    border: '1px solid #d9e2ec',
    borderRadius: 6,
    color: '#486581',
    fontSize: 13,
  },
  logout: {
    padding: '7px 11px',
    background: '#fff',
    color: '#334e68',
    border: '1px solid #bcccdc',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 13,
  },
  main: {
    width: '100%',
    maxWidth: 1180,
    margin: '0 auto',
    padding: 28,
  },
}
