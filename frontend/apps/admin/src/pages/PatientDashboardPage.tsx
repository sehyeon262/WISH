import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getAdminPatientDashboard } from '@wish/api-client'
import type {
  AdminDashboardContentShare,
  AdminDashboardPatientStatus,
  AdminPatientHourlyHeatmap,
  GuardianNotificationType,
} from '@wish/api-client'
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { AdminShell } from '../shared/components/AdminShell'
import { NotifyGuardianDialog } from '../shared/components/NotifyGuardianDialog'

type RangeDays = 7 | 14 | 30

const RANGE_OPTIONS: Array<{ days: RangeDays; label: string }> = [
  { days: 7, label: '7일' },
  { days: 14, label: '14일' },
  { days: 30, label: '30일' },
]

const CONTENT_COLORS: Record<string, string> = {
  login: '#486581',
  art: '#0b7285',
  music: '#5f3dc4',
  taekwondo: '#2f855a',
  gymnastics: '#c92a2a',
  ART: '#0b7285',
  MUSIC: '#5f3dc4',
  TAEKWONDO: '#2f855a',
  GYMNASTICS: '#c92a2a',
}

const STATUS_VIEW: Record<AdminDashboardPatientStatus, { label: string; style: CSSProperties }> = {
  ACTIVE: {
    label: '활발',
    style: { color: '#0b7285', background: '#e6f6ff', borderColor: '#b3ecff' },
  },
  NORMAL: {
    label: '관찰',
    style: { color: '#5f3dc4', background: '#f3f0ff', borderColor: '#d0bfff' },
  },
  RISK: {
    label: '위험',
    style: { color: '#c92a2a', background: '#fff5f5', borderColor: '#ffc9c9' },
  },
}

const numberFormat = new Intl.NumberFormat('ko-KR')
const shortDateFormat = new Intl.DateTimeFormat('ko-KR', { month: '2-digit', day: '2-digit' })
const fullDateFormat = new Intl.DateTimeFormat('ko-KR', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

type NotifyTargetType = GuardianNotificationType

export function PatientDashboardPage() {
  const navigate = useNavigate()
  const params = useParams()
  const patientId = Number(params.patientId)
  const [rangeDays, setRangeDays] = useState<RangeDays>(7)
  const [notifyType, setNotifyType] = useState<NotifyTargetType | null>(null)
  const dateRange = useMemo(() => createDateRange(rangeDays), [rangeDays])

  const patientQuery = useQuery({
    queryKey: ['admin-patient-dashboard', patientId, dateRange.from, dateRange.to],
    queryFn: () => getAdminPatientDashboard(patientId, dateRange).then(response => response.data),
    enabled: Number.isFinite(patientId) && patientId > 0,
    refetchInterval: 60_000,
  })

  const dashboard = patientQuery.data
  const chartData = useMemo(
    () =>
      dashboard?.dailyUsage.map(day => ({
        date: formatShortDate(day.date),
        login: day.login,
        art: day.art,
        music: day.music,
        taekwondo: day.taekwondo,
        gymnastics: day.gymnastics,
      })) ?? [],
    [dashboard],
  )

  const actions = (
    <div style={styles.headerActions}>
      <button type="button" onClick={() => navigate('/dashboard')} style={styles.secondaryButton}>
        대시보드
      </button>
      {dashboard && (
        <button
          type="button"
          onClick={() => {
            const status = dashboard.summary.status
            const skewed = dashboard.summary.contentSkewed
            setNotifyType(status === 'RISK' ? 'RISK' : skewed ? 'CONTENT_SKEW' : 'CHECK_IN')
          }}
          style={
            dashboard.summary.status === 'RISK'
              ? styles.notifyButtonRisk
              : dashboard.summary.contentSkewed
                ? styles.notifyButtonWarn
                : styles.notifyButton
          }
        >
          보호자에게 안내
        </button>
      )}
      <div style={styles.segmented} role="group" aria-label="조회 기간">
        {RANGE_OPTIONS.map(option => (
          <button
            key={option.days}
            type="button"
            onClick={() => setRangeDays(option.days)}
            style={{
              ...styles.segmentButton,
              ...(rangeDays === option.days ? styles.segmentButtonActive : {}),
            }}
          >
            {option.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => void patientQuery.refetch()}
        style={styles.refreshButton}
        disabled={patientQuery.isFetching || !Number.isFinite(patientId)}
      >
        {patientQuery.isFetching ? '갱신 중' : '새로고침'}
      </button>
    </div>
  )

  return (
    <AdminShell
      title={dashboard ? `${dashboard.patient.patientName} 활동 상세` : '환자 활동 상세'}
      description="환자별 앱 사용시간, 콘텐츠 활동 비중, 위험 상태를 확인합니다."
      actions={actions}
    >
      {!Number.isFinite(patientId) && (
        <div style={styles.errorBox}>환자 ID가 올바르지 않습니다.</div>
      )}
      {patientQuery.isLoading && <div style={styles.loading}>환자 활동을 불러오는 중</div>}
      {patientQuery.isError && (
        <div style={styles.errorBox}>환자 활동 조회 실패: {extractMessage(patientQuery.error)}</div>
      )}

      {dashboard && (
        <NotifyGuardianDialog
          open={notifyType != null}
          patientId={dashboard.patient.patientId}
          patientName={dashboard.patient.patientName}
          guardianEmail={dashboard.patient.guardianEmail}
          type={notifyType ?? 'CHECK_IN'}
          defaultMessage={
            notifyType === 'RISK'
              ? `${dashboard.patient.patientName} 환자가 최근 활동이 줄어 위시 운영팀에서 안내드립니다. 짧은 활동이라도 함께 시작해 보시면 좋겠어요.`
              : notifyType === 'CONTENT_SKEW'
                ? `${dashboard.patient.patientName} 환자의 위시 활동이 한 콘텐츠에 집중되고 있어요. 다양한 활동을 함께 권유해 주시면 좋겠습니다.`
                : `${dashboard.patient.patientName} 환자의 최근 위시 활동을 확인해 주세요. 궁금한 점이 있으면 운영팀에 알려주세요.`
          }
          onClose={() => setNotifyType(null)}
        />
      )}

      {dashboard && (
        <div style={styles.dashboard}>
          <section style={styles.profilePanel}>
            <div style={styles.profileMain}>
              <div style={styles.avatar}>{dashboard.patient.patientName.slice(0, 1)}</div>
              <div>
                <h2 style={styles.profileName}>{dashboard.patient.patientName}</h2>
                <div style={styles.profileMeta}>
                  <span>{dashboard.patient.patientNickname}</span>
                  <span>{genderLabel(dashboard.patient.gender)}</span>
                  <span>{formatFullDate(dashboard.patient.birthDate)} 출생</span>
                </div>
              </div>
            </div>
            <div style={styles.profileSide}>
              <span style={styles.metaLabel}>보호자</span>
              <strong style={styles.guardianEmail}>{dashboard.patient.guardianEmail}</strong>
              <span style={styles.metaLabel}>
                등록일 {formatFullDate(dashboard.patient.createdAt)}
              </span>
            </div>
          </section>

          <section style={styles.kpiGrid}>
            <KpiCard
              label="상태"
              value={STATUS_VIEW[dashboard.summary.status].label}
              detail={`최근 ${dashboard.summary.riskInactiveDays}일 비활동 기준`}
              tone={dashboard.summary.status === 'RISK' ? 'risk' : 'normal'}
            />
            <KpiCard
              label="기간 앱 사용"
              value={formatDuration(dashboard.summary.periodSeconds)}
              detail={`일 평균 ${formatDuration(dashboard.summary.averageDailySeconds)}`}
            />
            <KpiCard
              label="오늘 앱 사용"
              value={formatDuration(dashboard.summary.todaySeconds)}
              detail={`조회 기간 ${formatDateRange(dashboard.from, dashboard.to)}`}
            />
            <KpiCard
              label="활동일"
              value={`${formatNumber(dashboard.summary.activeDays)}일`}
              detail={`마지막 활동 ${formatLastActiveDate(dashboard.summary.lastActiveDate)}`}
            />
            <KpiCard
              label="선호 콘텐츠"
              value={dashboard.summary.favoriteContent}
              detail={`콘텐츠 활동 ${formatDuration(dashboard.summary.contentSeconds)}`}
            />
            <KpiCard
              label="편중 여부"
              value={dashboard.summary.contentSkewed ? '주의' : '정상'}
              detail="단일 콘텐츠 80% 이상 여부"
              tone={dashboard.summary.contentSkewed ? 'risk' : 'normal'}
            />
          </section>

          <section style={styles.chartGrid}>
            <div style={styles.panelLarge}>
              <div style={styles.panelHeader}>
                <div>
                  <h2 style={styles.panelTitle}>일별 활동 추이</h2>
                  <p style={styles.panelDescription}>
                    앱 사용시간은 선으로, 콘텐츠별 활동 시간은 막대로 표시합니다.
                  </p>
                </div>
                <span style={styles.periodBadge}>
                  {formatDateRange(dashboard.from, dashboard.to)}
                </span>
              </div>
              <div style={styles.chartFrame}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={chartData}
                    margin={{ top: 8, right: 10, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid stroke="#edf2f7" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 12 }}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 12 }}
                      tickFormatter={value => formatCompactDuration(Number(value))}
                    />
                    <Tooltip
                      formatter={(value, name) => [
                        formatDuration(Number(value)),
                        usageMetricLabel(String(name)),
                      ]}
                    />
                    <Legend formatter={value => usageMetricLabel(String(value))} />
                    <Bar dataKey="art" stackId="content" fill={CONTENT_COLORS.art} />
                    <Bar dataKey="music" stackId="content" fill={CONTENT_COLORS.music} />
                    <Bar dataKey="taekwondo" stackId="content" fill={CONTENT_COLORS.taekwondo} />
                    <Bar dataKey="gymnastics" stackId="content" fill={CONTENT_COLORS.gymnastics} />
                    <Line
                      type="monotone"
                      dataKey="login"
                      stroke={CONTENT_COLORS.login}
                      strokeWidth={2}
                      dot={{ r: 2 }}
                      activeDot={{ r: 4 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div style={styles.panel}>
              <div style={styles.panelHeader}>
                <div>
                  <h2 style={styles.panelTitle}>콘텐츠 비중</h2>
                  <p style={styles.panelDescription}>조회 기간 내 콘텐츠 활동 분포입니다.</p>
                </div>
              </div>
              <ContentSharePanel shares={dashboard.contentShares} />
            </div>
          </section>

          <section style={styles.heatmapSection}>
            <div style={styles.panelHeader}>
              <div>
                <h2 style={styles.panelTitle}>요일×시간대 사용 패턴</h2>
                <p style={styles.panelDescription}>
                  접속 세션의 시작 시각 기준으로 누적합니다. 색이 진할수록 해당 시간대에 더 많이
                  사용했음을 뜻합니다.
                </p>
              </div>
            </div>
            <HourlyHeatmapPanel heatmap={dashboard.heatmap} />
          </section>

          <section style={styles.tableSection}>
            <div style={styles.panelHeader}>
              <div>
                <h2 style={styles.panelTitle}>일별 활동 기록</h2>
                <p style={styles.panelDescription}>
                  날짜별 앱 사용과 콘텐츠 활동 시간을 확인합니다.
                </p>
              </div>
            </div>
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>날짜</th>
                    <th style={styles.th}>앱 사용</th>
                    <th style={styles.th}>미술</th>
                    <th style={styles.th}>음악</th>
                    <th style={styles.th}>태권도</th>
                    <th style={styles.th}>체조</th>
                    <th style={styles.th}>활동</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.dailyUsage.map(day => (
                    <tr key={day.date}>
                      <td style={styles.dateCell}>{formatFullDate(day.date)}</td>
                      <td style={styles.td}>{formatDuration(day.login)}</td>
                      <td style={styles.td}>{formatDuration(day.art)}</td>
                      <td style={styles.td}>{formatDuration(day.music)}</td>
                      <td style={styles.td}>{formatDuration(day.taekwondo)}</td>
                      <td style={styles.td}>{formatDuration(day.gymnastics)}</td>
                      <td style={styles.td}>
                        <span
                          style={{
                            ...styles.activeBadge,
                            ...(day.active ? styles.activeBadgeOn : styles.activeBadgeOff),
                          }}
                        >
                          {day.active ? '있음' : '없음'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </AdminShell>
  )
}

function KpiCard({
  label,
  value,
  detail,
  tone = 'normal',
}: {
  label: string
  value: string
  detail: string
  tone?: 'normal' | 'risk'
}) {
  return (
    <article style={{ ...styles.kpiCard, ...(tone === 'risk' ? styles.kpiCardRisk : {}) }}>
      <span style={styles.kpiLabel}>{label}</span>
      <strong style={styles.kpiValue}>{value}</strong>
      <span style={styles.kpiDetail}>{detail}</span>
    </article>
  )
}

const WEEKDAY_LABELS = ['월', '화', '수', '목', '금', '토', '일']

function HourlyHeatmapPanel({ heatmap }: { heatmap: AdminPatientHourlyHeatmap }) {
  const grid = useMemo(() => {
    const matrix: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0))
    for (const cell of heatmap.cells) {
      if (cell.weekday < 1 || cell.weekday > 7) continue
      if (cell.hour < 0 || cell.hour > 23) continue
      matrix[cell.weekday - 1][cell.hour] = cell.totalSeconds
    }
    return matrix
  }, [heatmap])

  const max = heatmap.maxSeconds
  if (max <= 0) {
    return (
      <div style={styles.heatmapEmpty}>
        <strong style={styles.heatmapEmptyTitle}>아직 사용 패턴이 없습니다</strong>
        <span style={styles.heatmapEmptyHint}>
          기간 내 접속 세션이 누적되면 시간대별 사용 패턴이 채워집니다.
        </span>
      </div>
    )
  }

  return (
    <div style={styles.heatmapWrap}>
      <div style={styles.heatmapHeaderRow}>
        <div style={styles.heatmapWeekdayPlaceholder} />
        {Array.from({ length: 24 }, (_, hour) => (
          <div key={hour} style={styles.heatmapHourLabel}>
            {hour % 3 === 0 ? hour : ''}
          </div>
        ))}
      </div>
      {grid.map((row, weekdayIndex) => (
        <div key={weekdayIndex} style={styles.heatmapRow}>
          <div style={styles.heatmapWeekday}>{WEEKDAY_LABELS[weekdayIndex]}</div>
          {row.map((seconds, hour) => {
            const intensity = max > 0 ? Math.min(1, seconds / max) : 0
            return (
              <div
                key={hour}
                style={{
                  ...styles.heatmapCell,
                  background: intensityColor(intensity),
                }}
                title={`${WEEKDAY_LABELS[weekdayIndex]} ${hour}시 — ${formatDuration(seconds)}`}
              />
            )
          })}
        </div>
      ))}
      <div style={styles.heatmapLegend}>
        <span style={styles.heatmapLegendLabel}>적음</span>
        <div style={styles.heatmapLegendBar}>
          {Array.from({ length: 6 }, (_, idx) => (
            <span
              key={idx}
              style={{
                ...styles.heatmapLegendChip,
                background: intensityColor(idx / 5),
              }}
            />
          ))}
        </div>
        <span style={styles.heatmapLegendLabel}>많음</span>
        <span style={styles.heatmapLegendMax}>최대 {formatDuration(max)}</span>
      </div>
    </div>
  )
}

function intensityColor(intensity: number) {
  if (intensity <= 0) return '#f0f4f8'
  // #e6f6ff → #0b7285 보간. 두 색을 RGB 로 변환해 단순 선형 보간.
  const t = Math.max(0, Math.min(1, intensity))
  const start = { r: 0xe6, g: 0xf6, b: 0xff }
  const end = { r: 0x0b, g: 0x72, b: 0x85 }
  const r = Math.round(start.r + (end.r - start.r) * t)
  const g = Math.round(start.g + (end.g - start.g) * t)
  const b = Math.round(start.b + (end.b - start.b) * t)
  return `rgb(${r}, ${g}, ${b})`
}

function ContentSharePanel({ shares }: { shares: AdminDashboardContentShare[] }) {
  const totalSeconds = shares.reduce((sum, share) => sum + share.totalSeconds, 0)
  return (
    <div style={styles.contentShareLayout}>
      <div style={styles.pieFrame}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={shares}
              dataKey="totalSeconds"
              nameKey="label"
              innerRadius={54}
              outerRadius={82}
              paddingAngle={2}
            >
              {shares.map(share => (
                <Cell
                  key={share.contentType}
                  fill={CONTENT_COLORS[share.contentType] ?? '#486581'}
                />
              ))}
            </Pie>
            <Tooltip formatter={(value, name) => [formatDuration(Number(value)), String(name)]} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div style={styles.shareList}>
        {shares.map(share => (
          <div key={share.contentType} style={styles.shareRow}>
            <span
              style={{
                ...styles.shareSwatch,
                background: CONTENT_COLORS[share.contentType] ?? '#486581',
              }}
            />
            <span style={styles.shareLabel}>{share.label}</span>
            <strong style={styles.shareValue}>
              {totalSeconds > 0 ? `${share.percentage.toFixed(1)}%` : '0%'}
            </strong>
          </div>
        ))}
      </div>
    </div>
  )
}

function createDateRange(days: RangeDays) {
  const to = new Date()
  const from = new Date(to)
  from.setDate(to.getDate() - days + 1)
  return { from: toIsoDate(from), to: toIsoDate(to) }
}

function toIsoDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseIsoDate(value: string) {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number)
  return new Date(year, month - 1, day)
}

function formatShortDate(value: string) {
  return shortDateFormat.format(parseIsoDate(value))
}

function formatFullDate(value: string) {
  return fullDateFormat.format(parseIsoDate(value))
}

function formatDateRange(from: string, to: string) {
  return `${formatShortDate(from)} - ${formatShortDate(to)}`
}

function formatLastActiveDate(value: string | null) {
  if (!value) return '기록 없음'
  return formatFullDate(value)
}

function formatNumber(value: number) {
  return numberFormat.format(value)
}

function formatDuration(seconds: number) {
  if (seconds <= 0) return '0분'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0 && minutes > 0) return `${hours}시간 ${minutes}분`
  if (hours > 0) return `${hours}시간`
  if (minutes > 0) return `${minutes}분`
  return `${seconds}초`
}

function formatCompactDuration(seconds: number) {
  if (seconds >= 3600) return `${Math.round(seconds / 3600)}h`
  if (seconds >= 60) return `${Math.round(seconds / 60)}m`
  return `${seconds}s`
}

function usageMetricLabel(metric: string) {
  switch (metric) {
    case 'login':
      return '앱 사용'
    case 'art':
      return '미술'
    case 'music':
      return '음악'
    case 'taekwondo':
      return '태권도'
    case 'gymnastics':
      return '체조'
    default:
      return metric
  }
}

function genderLabel(gender: string) {
  if (gender === 'MALE') return '남'
  if (gender === 'FEMALE') return '여'
  if (gender === 'OTHER') return '기타'
  return gender
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
  dashboard: {
    display: 'flex',
    flexDirection: 'column',
    gap: 18,
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    flexWrap: 'wrap',
  },
  secondaryButton: {
    height: 36,
    padding: '0 12px',
    background: '#fff',
    color: '#334e68',
    border: '1px solid #bcccdc',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 700,
  },
  refreshButton: {
    height: 36,
    padding: '0 12px',
    background: '#0b7285',
    color: '#fff',
    border: '1px solid #0b7285',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 700,
  },
  notifyButton: {
    height: 36,
    padding: '0 12px',
    background: '#fff',
    color: '#0b7285',
    border: '1px solid #b3ecff',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 700,
  },
  notifyButtonWarn: {
    height: 36,
    padding: '0 12px',
    background: '#5f3dc4',
    color: '#fff',
    border: '1px solid #5f3dc4',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 700,
  },
  notifyButtonRisk: {
    height: 36,
    padding: '0 12px',
    background: '#c92a2a',
    color: '#fff',
    border: '1px solid #c92a2a',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 700,
  },
  heatmapSection: {
    padding: 18,
    background: '#fff',
    border: '1px solid #d9e2ec',
    borderRadius: 8,
  },
  heatmapWrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    overflowX: 'auto',
  },
  heatmapHeaderRow: {
    display: 'grid',
    gridTemplateColumns: '32px repeat(24, minmax(20px, 1fr))',
    gap: 2,
    alignItems: 'center',
  },
  heatmapWeekdayPlaceholder: {},
  heatmapHourLabel: {
    color: '#829ab1',
    fontSize: 10,
    textAlign: 'center',
  },
  heatmapRow: {
    display: 'grid',
    gridTemplateColumns: '32px repeat(24, minmax(20px, 1fr))',
    gap: 2,
    alignItems: 'center',
  },
  heatmapWeekday: {
    color: '#486581',
    fontSize: 12,
    fontWeight: 700,
    textAlign: 'right',
    paddingRight: 6,
  },
  heatmapCell: {
    height: 18,
    borderRadius: 3,
    border: '1px solid rgba(16, 42, 67, 0.04)',
  },
  heatmapEmpty: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    padding: '24px 0',
    color: '#829ab1',
    fontSize: 13,
    textAlign: 'center',
  },
  heatmapEmptyTitle: {
    color: '#486581',
    fontSize: 13,
    fontWeight: 700,
  },
  heatmapEmptyHint: {
    color: '#829ab1',
    fontSize: 12,
  },
  heatmapLegend: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    color: '#627d98',
    fontSize: 12,
  },
  heatmapLegendLabel: {
    color: '#829ab1',
    fontSize: 11,
  },
  heatmapLegendBar: {
    display: 'flex',
    gap: 2,
  },
  heatmapLegendChip: {
    width: 16,
    height: 12,
    borderRadius: 2,
    border: '1px solid rgba(16, 42, 67, 0.06)',
  },
  heatmapLegendMax: {
    marginLeft: 'auto',
    color: '#486581',
    fontSize: 11,
    fontWeight: 600,
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
    minWidth: 52,
    height: 30,
    padding: '0 10px',
    border: '1px solid transparent',
    borderRadius: 6,
    background: 'transparent',
    color: '#486581',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 600,
  },
  segmentButtonActive: {
    background: '#fff',
    borderColor: '#bcccdc',
    color: '#102a43',
  },
  profilePanel: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 16,
    flexWrap: 'wrap',
    padding: 18,
    background: '#fff',
    border: '1px solid #d9e2ec',
    borderRadius: 8,
  },
  profileMain: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
  },
  avatar: {
    width: 48,
    height: 48,
    display: 'grid',
    placeItems: 'center',
    borderRadius: 8,
    background: '#0b7285',
    color: '#fff',
    fontSize: 20,
    fontWeight: 800,
  },
  profileName: {
    margin: 0,
    color: '#102a43',
    fontSize: 20,
    letterSpacing: 0,
  },
  profileMeta: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
    marginTop: 6,
    color: '#627d98',
    fontSize: 13,
  },
  profileSide: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 4,
  },
  metaLabel: {
    color: '#829ab1',
    fontSize: 12,
  },
  guardianEmail: {
    color: '#102a43',
    fontSize: 14,
  },
  kpiGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
    gap: 12,
  },
  kpiCard: {
    minHeight: 126,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    padding: 16,
    background: '#fff',
    border: '1px solid #d9e2ec',
    borderRadius: 8,
  },
  kpiCardRisk: {
    borderColor: '#ffc9c9',
    background: '#fffafa',
  },
  kpiLabel: {
    color: '#627d98',
    fontSize: 12,
    fontWeight: 700,
  },
  kpiValue: {
    display: 'block',
    color: '#102a43',
    fontSize: 24,
    lineHeight: 1.2,
    letterSpacing: 0,
  },
  kpiDetail: {
    color: '#829ab1',
    fontSize: 12,
    lineHeight: 1.35,
  },
  chartGrid: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1.55fr) minmax(320px, 0.95fr)',
    gap: 18,
  },
  panel: {
    minWidth: 0,
    padding: 18,
    background: '#fff',
    border: '1px solid #d9e2ec',
    borderRadius: 8,
  },
  panelLarge: {
    minWidth: 0,
    padding: 18,
    background: '#fff',
    border: '1px solid #d9e2ec',
    borderRadius: 8,
  },
  panelHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 14,
  },
  panelTitle: {
    margin: 0,
    color: '#102a43',
    fontSize: 16,
    lineHeight: 1.3,
    letterSpacing: 0,
  },
  panelDescription: {
    margin: '4px 0 0',
    color: '#829ab1',
    fontSize: 12,
    lineHeight: 1.45,
  },
  periodBadge: {
    whiteSpace: 'nowrap',
    padding: '5px 8px',
    background: '#f0f4f8',
    border: '1px solid #d9e2ec',
    borderRadius: 6,
    color: '#486581',
    fontSize: 12,
    fontWeight: 700,
  },
  chartFrame: {
    width: '100%',
    height: 300,
  },
  contentShareLayout: {
    display: 'grid',
    gridTemplateColumns: 'minmax(180px, 1fr) minmax(150px, 0.8fr)',
    alignItems: 'center',
    gap: 12,
  },
  pieFrame: {
    width: '100%',
    height: 230,
  },
  shareList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 9,
  },
  shareRow: {
    display: 'grid',
    gridTemplateColumns: '14px minmax(0, 1fr) auto',
    alignItems: 'center',
    gap: 8,
    minHeight: 30,
  },
  shareSwatch: {
    width: 10,
    height: 10,
    borderRadius: 3,
  },
  shareLabel: {
    color: '#486581',
    fontSize: 13,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  shareValue: {
    color: '#102a43',
    fontSize: 13,
  },
  tableSection: {
    padding: 18,
    background: '#fff',
    border: '1px solid #d9e2ec',
    borderRadius: 8,
  },
  tableWrap: {
    overflowX: 'auto',
    border: '1px solid #d9e2ec',
    borderRadius: 8,
  },
  table: {
    width: '100%',
    minWidth: 880,
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
  dateCell: {
    padding: 12,
    borderBottom: '1px solid #edf2f7',
    color: '#102a43',
    fontSize: 13,
    fontWeight: 700,
    verticalAlign: 'middle',
  },
  activeBadge: {
    minWidth: 48,
    display: 'inline-flex',
    justifyContent: 'center',
    padding: '4px 8px',
    border: '1px solid transparent',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 800,
  },
  activeBadgeOn: {
    color: '#0b7285',
    background: '#e6f6ff',
    borderColor: '#b3ecff',
  },
  activeBadgeOff: {
    color: '#829ab1',
    background: '#f8fafc',
    borderColor: '#d9e2ec',
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
