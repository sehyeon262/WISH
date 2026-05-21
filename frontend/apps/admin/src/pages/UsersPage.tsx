import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { changeUserRole, listUsers } from '@wish/api-client'
import type { AdminUserResponse, UserRole } from '@wish/api-client'
import { AdminShell } from '../shared/components/AdminShell'
import { ConfirmModal } from '../shared/components/ConfirmModal'
import { useAuthStore } from '../shared/auth/store'

type RoleFilter = 'ALL' | UserRole

const ROLE_FILTERS: RoleFilter[] = ['ALL', 'USER', 'ADMIN']

function isRoleFilter(value: string | null): value is RoleFilter {
  return value === 'ALL' || value === 'USER' || value === 'ADMIN'
}

type PendingRoleChange = {
  user: AdminUserResponse
  nextRole: UserRole
}

export function UsersPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const currentEmail = useAuthStore(state => state.email)
  const [searchParams, setSearchParams] = useSearchParams()
  const [keyword, setKeyword] = useState(() => searchParams.get('q') ?? '')
  const [roleFilter, setRoleFilter] = useState<RoleFilter>(() => {
    const role = searchParams.get('role')
    return isRoleFilter(role) ? role : 'ALL'
  })
  const [pendingChange, setPendingChange] = useState<PendingRoleChange | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    const next = new URLSearchParams(searchParams)
    const trimmed = keyword.trim()
    if (trimmed) {
      next.set('q', trimmed)
    } else {
      next.delete('q')
    }
    if (roleFilter !== 'ALL') {
      next.set('role', roleFilter)
    } else {
      next.delete('role')
    }
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true })
    }
  }, [keyword, roleFilter, searchParams, setSearchParams])

  const usersQuery = useQuery({
    queryKey: ['users'],
    queryFn: () => listUsers().then(response => response.data),
  })

  const roleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: number; role: UserRole }) =>
      changeUserRole(userId, role),
    onSuccess: () => {
      setPendingChange(null)
      setActionError(null)
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
    onError: (err: unknown) => {
      const res =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response
          : null
      setActionError(res?.data?.message ?? '권한 변경 실패')
    },
  })

  const users = useMemo(() => usersQuery.data ?? [], [usersQuery.data])
  const adminTotal = useMemo(() => users.filter(user => user.role === 'ADMIN').length, [users])
  const filteredUsers = useMemo(
    () =>
      users.filter(user => {
        const normalizedKeyword = keyword.trim().toLowerCase()
        const matchesKeyword =
          !normalizedKeyword ||
          user.email.toLowerCase().includes(normalizedKeyword) ||
          user.nickname.toLowerCase().includes(normalizedKeyword)
        const matchesRole = roleFilter === 'ALL' || (user.role ?? 'USER') === roleFilter
        return matchesKeyword && matchesRole
      }),
    [keyword, roleFilter, users],
  )

  return (
    <AdminShell title="유저 관리" description="계정, 환자 프로필, 관리자 권한 상태를 확인합니다.">
      <section style={styles.panel}>
        <div style={styles.toolbar}>
          <label style={styles.searchLabel}>
            검색
            <input
              value={keyword}
              onChange={event => setKeyword(event.target.value)}
              placeholder="이메일 또는 닉네임"
              style={styles.searchInput}
            />
          </label>

          <div style={styles.segmented} role="group" aria-label="권한 필터">
            {ROLE_FILTERS.map(role => (
              <button
                key={role}
                type="button"
                onClick={() => setRoleFilter(role)}
                style={{
                  ...styles.segmentButton,
                  ...(roleFilter === role ? styles.segmentButtonActive : {}),
                }}
              >
                {roleLabel(role)}
              </button>
            ))}
          </div>
        </div>

        <div style={styles.summary}>
          <span style={styles.summaryItem}>전체 {users.length}명</span>
          <span style={styles.summaryItem}>관리자 {adminTotal}명</span>
          <span style={styles.summaryItem}>표시 {filteredUsers.length}명</span>
        </div>
      </section>

      {usersQuery.isLoading && <div style={styles.loading}>불러오는 중</div>}
      {usersQuery.isError && (
        <div style={styles.errorBox}>유저 목록 조회 실패: {extractMessage(usersQuery.error)}</div>
      )}
      {actionError && <div style={styles.errorBox}>{actionError}</div>}

      {usersQuery.data && (
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>ID</th>
                <th style={styles.th}>이메일</th>
                <th style={styles.th}>닉네임</th>
                <th style={styles.th}>환자 프로필</th>
                <th style={styles.th}>권한</th>
                <th style={styles.th}>가입일</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={6} style={styles.emptyRow}>
                    <div style={styles.emptyTitle}>조건에 맞는 유저가 없습니다</div>
                    <div style={styles.emptyHint}>
                      검색어를 비우거나 권한 필터를 <strong>전체</strong>로 바꿔 보세요.
                    </div>
                  </td>
                </tr>
              )}
              {filteredUsers.map(user => {
                const role = user.role ?? 'USER'
                const isSelf = currentEmail != null && currentEmail === user.email
                const lastAdmin = role === 'ADMIN' && adminTotal <= 1
                const disabledReason = isSelf
                  ? '본인 권한은 변경할 수 없습니다'
                  : lastAdmin
                    ? '마지막 관리자 계정은 강등할 수 없습니다'
                    : null
                return (
                  <tr key={user.id}>
                    <td style={styles.td}>{user.id}</td>
                    <td style={styles.emailCell}>{user.email}</td>
                    <td style={styles.td}>{user.nickname}</td>
                    <td style={styles.td}>
                      <PatientProfileCell
                        user={user}
                        onOpen={patientProfileId =>
                          navigate(`/dashboard/patients/${patientProfileId}`)
                        }
                      />
                    </td>
                    <td style={styles.td}>
                      <select
                        value={role}
                        title={disabledReason ?? '권한 변경'}
                        aria-label={`${user.email} 권한 변경`}
                        onChange={event => {
                          const nextRole = event.target.value as UserRole
                          if (nextRole === role) return
                          setActionError(null)
                          setPendingChange({ user, nextRole })
                        }}
                        disabled={disabledReason != null || roleMutation.isPending}
                        style={{
                          ...styles.roleSelect,
                          ...(role === 'ADMIN' ? styles.roleSelectAdmin : styles.roleSelectUser),
                          ...(disabledReason != null || roleMutation.isPending
                            ? styles.roleSelectDisabled
                            : {}),
                        }}
                      >
                        <option value="USER">일반</option>
                        <option value="ADMIN">관리자</option>
                      </select>
                      {disabledReason && <span style={styles.roleHint}>{disabledReason}</span>}
                    </td>
                    <td style={styles.td}>{formatDate(user.createdAt)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmModal
        open={pendingChange != null}
        title={
          pendingChange?.nextRole === 'ADMIN'
            ? '관리자 권한을 부여할까요?'
            : '관리자 권한을 해제할까요?'
        }
        description={
          pendingChange && (
            <span>
              <strong>{pendingChange.user.email}</strong> 사용자를{' '}
              <strong>{roleLabel(pendingChange.nextRole)}</strong> 권한으로 변경합니다.
              {pendingChange.nextRole === 'ADMIN' && ' 운영 콘솔의 모든 기능에 접근할 수 있습니다.'}
              {pendingChange.nextRole === 'USER' && ' 운영 콘솔에서 더 이상 로그인할 수 없습니다.'}
            </span>
          )
        }
        confirmLabel={pendingChange?.nextRole === 'ADMIN' ? '승격' : '해제'}
        tone={pendingChange?.nextRole === 'USER' ? 'danger' : 'default'}
        loading={roleMutation.isPending}
        onConfirm={() => {
          if (!pendingChange) return
          roleMutation.mutate({
            userId: pendingChange.user.id,
            role: pendingChange.nextRole,
          })
        }}
        onCancel={() => {
          if (roleMutation.isPending) return
          setPendingChange(null)
        }}
      />
    </AdminShell>
  )
}

function roleLabel(role: RoleFilter) {
  if (role === 'ALL') return '전체'
  if (role === 'ADMIN') return '관리자'
  return '일반'
}

function PatientProfileCell({
  user,
  onOpen,
}: {
  user: AdminUserResponse
  onOpen: (patientProfileId: number) => void
}) {
  if (user.patientProfileId == null) {
    return <span style={styles.emptyProfile}>등록 없음</span>
  }
  return (
    <button
      type="button"
      onClick={() => onOpen(user.patientProfileId as number)}
      style={styles.profileButton}
    >
      <strong style={styles.profileName}>{user.patientName ?? '환자 상세'}</strong>
      {user.patientNickname && <span style={styles.profileNickname}>{user.patientNickname}</span>}
    </button>
  )
}

function formatDate(value?: string) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function extractMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'response' in error) {
    const res = (error as { response?: { data?: { message?: string; code?: string } } }).response
    if (res?.data?.message) return res.data.message
    if (res?.data?.code) return res.data.code
  }
  if (error instanceof Error) return error.message
  return '알 수 없는 오류'
}

const styles: Record<string, CSSProperties> = {
  panel: {
    padding: 18,
    marginBottom: 16,
    background: '#fff',
    border: '1px solid #d9e2ec',
    borderRadius: 8,
  },
  toolbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: 16,
    flexWrap: 'wrap',
  },
  searchLabel: {
    minWidth: 260,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    color: '#486581',
    fontSize: 13,
  },
  searchInput: {
    width: '100%',
    padding: '8px 10px',
    border: '1px solid #bcccdc',
    borderRadius: 6,
    fontSize: 14,
  },
  segmented: {
    display: 'inline-flex',
    padding: 3,
    background: '#f0f4f8',
    border: '1px solid #d9e2ec',
    borderRadius: 8,
    gap: 2,
  },
  segmentButton: {
    minWidth: 70,
    padding: '7px 10px',
    border: '1px solid transparent',
    borderRadius: 6,
    background: 'transparent',
    color: '#486581',
    cursor: 'pointer',
    fontSize: 13,
  },
  segmentButtonActive: {
    background: '#fff',
    borderColor: '#bcccdc',
    color: '#102a43',
    fontWeight: 700,
  },
  summary: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    marginTop: 14,
  },
  summaryItem: {
    padding: '5px 8px',
    background: '#f0f4f8',
    border: '1px solid #d9e2ec',
    borderRadius: 6,
    color: '#486581',
    fontSize: 12,
  },
  tableWrap: {
    overflowX: 'auto',
    background: '#fff',
    border: '1px solid #d9e2ec',
    borderRadius: 8,
  },
  table: {
    width: '100%',
    minWidth: 840,
    borderCollapse: 'separate',
    borderSpacing: 0,
  },
  th: {
    padding: '11px 12px',
    textAlign: 'left',
    fontSize: 12,
    color: '#486581',
    background: '#f8fafc',
    borderBottom: '1px solid #d9e2ec',
  },
  td: {
    padding: 12,
    borderBottom: '1px solid #edf2f7',
    color: '#334e68',
    fontSize: 13,
    verticalAlign: 'middle',
  },
  emailCell: {
    padding: 12,
    borderBottom: '1px solid #edf2f7',
    color: '#102a43',
    fontSize: 13,
    fontWeight: 700,
    verticalAlign: 'middle',
  },
  profileButton: {
    maxWidth: 190,
    minWidth: 104,
    display: 'inline-flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 2,
    padding: '6px 9px',
    background: '#fff',
    color: '#0b7285',
    border: '1px solid #b3ecff',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 12,
    textAlign: 'left',
  },
  profileName: {
    maxWidth: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    color: '#0b7285',
    fontSize: 12,
  },
  profileNickname: {
    maxWidth: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    color: '#486581',
    fontSize: 11,
  },
  emptyProfile: {
    display: 'inline-flex',
    padding: '5px 8px',
    background: '#f8fafc',
    border: '1px solid #d9e2ec',
    borderRadius: 6,
    color: '#829ab1',
    fontSize: 12,
    fontWeight: 600,
  },
  roleSelect: {
    minWidth: 88,
    height: 32,
    padding: '0 28px 0 10px',
    borderRadius: 6,
    border: '1px solid transparent',
    background: '#fff',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 700,
  },
  roleSelectAdmin: {
    color: '#0b7285',
    background: '#e6f6ff',
    borderColor: '#b3ecff',
  },
  roleSelectUser: {
    color: '#5f3dc4',
    background: '#f3f0ff',
    borderColor: '#d0bfff',
  },
  roleSelectDisabled: {
    opacity: 0.55,
    cursor: 'not-allowed',
  },
  roleHint: {
    display: 'block',
    marginTop: 4,
    color: '#829ab1',
    fontSize: 11,
    lineHeight: 1.35,
  },
  emptyRow: {
    padding: '36px 16px',
    textAlign: 'center',
    color: '#829ab1',
    fontSize: 13,
  },
  emptyTitle: {
    color: '#486581',
    fontSize: 14,
    fontWeight: 700,
    marginBottom: 4,
  },
  emptyHint: {
    color: '#829ab1',
    fontSize: 12,
    lineHeight: 1.6,
  },
  loading: {
    padding: 20,
    background: '#fff',
    border: '1px solid #d9e2ec',
    borderRadius: 8,
    color: '#486581',
  },
  errorBox: {
    padding: 12,
    marginBottom: 12,
    background: '#fff5f5',
    color: '#c92a2a',
    border: '1px solid #ffc9c9',
    borderRadius: 8,
    fontSize: 13,
  },
}
