import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import { useMyPatientId } from '@/features/auth/hooks/useMyPatientId'
import { useRomMovementAnalysis } from '@/features/rom/hooks'
import {
  ROM_BALANCE_ATTENTION_DEG,
  ROM_CAPTURE_WARN_PERCENT,
  type RomJointDetail,
} from '@/features/rom/data/model'
import { useGymnasticsDashboardSummary } from '../hooks'
import { ChevronDownIcon, InfoIcon } from './icons'
import styles from './InsightCards.module.css'

const TREND_RANGE_OPTIONS = [
  { id: 7, label: '최근 7일' },
  { id: 14, label: '최근 14일' },
  { id: 30, label: '최근 30일' },
] as const

type TrendRangeId = (typeof TREND_RANGE_OPTIONS)[number]['id']

function CardTitle({ children, tip }: { children: React.ReactNode; tip?: string }) {
  return (
    <h3 className={styles.cardTitle}>
      {children}
      <span className={styles.infoTip} tabIndex={0} role="button" aria-label="설명 보기">
        <InfoIcon className={styles.cardTitleIcon} />
        {tip && (
          <span className={styles.tooltip} role="tooltip">
            {tip}
          </span>
        )}
      </span>
    </h3>
  )
}

function formatDurationSec(seconds: number): string {
  const safeSeconds = Math.max(0, Math.round(seconds))
  if (safeSeconds < 60) return `${safeSeconds}초`

  const minutes = Math.floor(safeSeconds / 60)
  const remainingSeconds = safeSeconds % 60
  if (minutes < 60) {
    return remainingSeconds === 0 ? `${minutes}분` : `${minutes}분 ${remainingSeconds}초`
  }

  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return remainingMinutes === 0 ? `${hours}시간` : `${hours}시간 ${remainingMinutes}분`
}

function buildMinuteDomain(values: number[]): { domain: [number, number]; ticks: number[] } {
  const max = Math.max(0, ...values)
  const upper = max <= 0 ? 10 : Math.max(5, Math.ceil((max * 1.2) / 5) * 5)
  const step = upper / 4
  const ticks = [0, 1, 2, 3, 4].map(index => Math.round(step * index))
  return { domain: [0, upper], ticks }
}

export function OverallScoreCard() {
  const { data: patientId } = useMyPatientId()
  const { data: summary, isError, isLoading } = useGymnasticsDashboardSummary(patientId, 7)
  const todaySeconds = summary?.todayGymSeconds ?? 0
  const completedMotionCount = summary?.todayCompletedMotionCount ?? 0
  const latestSession = summary?.latestSession ?? null
  const usageUnavailable = isError || summary?.usageStatsAvailable === false
  const sessionsUnavailable = isError || summary?.sessionStatsAvailable === false

  const title = isError
    ? '체조 기록을 불러오지 못했어요'
    : latestSession
      ? `${latestSession.exerciseTypeLabel} ${latestSession.completedMotionCount}개 동작 완료`
      : todaySeconds > 0
        ? '오늘 체조 활동이 기록됐어요'
        : '오늘 체조 기록이 없어요'
  const subtitle = isError
    ? '네트워크 상태를 확인한 뒤 다시 시도해 주세요.'
    : sessionsUnavailable
      ? '세션 기록을 불러오지 못해 사용 시간만 표시합니다.'
      : latestSession
        ? `최근 세션 ${formatDurationSec(latestSession.durationSec)} · ${latestSession.shortDate}`
        : isLoading
          ? '기록을 확인하는 중입니다.'
          : '체조방에서 활동하면 이 영역에 실제 기록이 표시됩니다.'

  return (
    <article className={styles.card}>
      <header className={styles.cardHead}>
        <CardTitle tip="사용량 통계와 체조 세션 기록을 기준으로 오늘의 체조 활동을 보여줍니다. 정확도 점수처럼 신뢰도가 낮은 값은 제외했습니다.">
          오늘 체조 활동
        </CardTitle>
      </header>
      <div className={styles.scoreBody}>
        <div className={styles.timeMetric}>
          <strong>
            {isLoading ? '...' : usageUnavailable ? '--' : formatDurationSec(todaySeconds)}
          </strong>
          <span>오늘 사용 시간</span>
        </div>
        <div className={styles.scoreCopy}>
          <span className={styles.scoreTitle}>{title}</span>
          <span className={styles.scoreSubtitle}>{subtitle}</span>
        </div>
        <div className={styles.scoreStats} aria-label="오늘 체조 요약">
          <span>
            <strong>{sessionsUnavailable ? '-' : completedMotionCount}</strong>
            완료 동작
          </span>
          <span>
            <strong>{sessionsUnavailable ? '-' : (summary?.todaySessionCount ?? 0)}</strong>
            세션
          </span>
        </div>
      </div>
    </article>
  )
}

export function TrendChartCard() {
  const { data: patientId } = useMyPatientId()
  const [rangeId, setRangeId] = useState<TrendRangeId>(7)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const { data: summary, isError, isLoading } = useGymnasticsDashboardSummary(patientId, rangeId)

  useEffect(() => {
    if (!menuOpen) return
    const onClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('click', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('click', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  const currentRange = TREND_RANGE_OPTIONS.find(option => option.id === rangeId)
  const data = summary?.trend ?? []
  const { domain, ticks } = buildMinuteDomain(data.map(point => point.minutes))
  const usageUnavailable = isError || summary?.usageStatsAvailable === false

  return (
    <article className={`${styles.card} ${styles.cardFlex}`}>
      <header className={styles.cardHead}>
        <CardTitle tip="일별 체조 사용 시간을 분 단위로 보여줍니다. 세션 점수가 아니라 실제 활동 시간 기준입니다.">
          최근 체조 시간
        </CardTitle>
        <div className={styles.rangeWrap} ref={menuRef}>
          <button
            type="button"
            className={styles.cardAction}
            onClick={() => setMenuOpen(open => !open)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            {currentRange?.label ?? '최근 7일'}
            <ChevronDownIcon
              className={`${styles.cardActionChev} ${menuOpen ? styles.cardActionChevOpen : ''}`}
            />
          </button>
          {menuOpen && (
            <div className={styles.rangeMenu} role="menu">
              {TREND_RANGE_OPTIONS.map(option => (
                <button
                  key={option.id}
                  type="button"
                  role="menuitem"
                  className={`${styles.rangeItem} ${option.id === rangeId ? styles.rangeItemActive : ''}`}
                  onClick={() => {
                    setRangeId(option.id)
                    setMenuOpen(false)
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>
      <div className={styles.trendBody}>
        {usageUnavailable ? (
          <div className={styles.trendEmpty}>체조 시간 기록을 불러오지 못했습니다.</div>
        ) : data.length === 0 ? (
          <div className={styles.trendEmpty}>
            {isLoading ? '기록을 불러오는 중입니다.' : '표시할 체조 기록이 없습니다.'}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 4 }}>
              <defs>
                <linearGradient id="gymnastics-time-line" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#6ddec0" />
                  <stop offset="100%" stopColor="#7c5cff" />
                </linearGradient>
                <linearGradient id="gymnastics-time-area" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#7c5cff" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="#7c5cff" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#ECE9F5" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10.5, fill: '#b6b4c8' }}
                tickLine={false}
                axisLine={false}
                padding={{ left: 8, right: 8 }}
                interval={data.length > 12 ? Math.ceil(data.length / 6) - 1 : 0}
              />
              <YAxis
                ticks={ticks}
                domain={domain}
                tick={{ fontSize: 10.5, fill: '#b6b4c8' }}
                tickLine={false}
                axisLine={false}
                width={28}
              />
              <Area
                type="linear"
                dataKey="minutes"
                stroke="url(#gymnastics-time-line)"
                strokeWidth={2.5}
                fill="url(#gymnastics-time-area)"
                dot={(props: {
                  cx?: number
                  cy?: number
                  index?: number
                  key?: string | number
                }) => {
                  const { cx = 0, cy = 0, index = 0, key } = props
                  const isLast = index === data.length - 1
                  const showDot = data.length <= 14 || isLast
                  if (!showDot) {
                    return (
                      <circle key={key ?? `gymnastics-time-dot-${index}`} cx={cx} cy={cy} r={0} />
                    )
                  }
                  return (
                    <circle
                      key={key ?? `gymnastics-time-dot-${index}`}
                      cx={cx}
                      cy={cy}
                      r={isLast ? 5.5 : 3}
                      fill={isLast ? '#7c5cff' : '#fff'}
                      stroke={isLast ? '#fff' : '#7c5cff'}
                      strokeWidth={isLast ? 2.5 : 2}
                    />
                  )
                }}
                activeDot={{ r: 6, fill: '#7c5cff', stroke: '#fff', strokeWidth: 2.5 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
      <div className={styles.trendSummary}>
        <span>
          {usageUnavailable
            ? '사용 시간 확인 필요'
            : `총 ${formatDurationSec(summary?.periodGymSeconds ?? 0)}`}
        </span>
        <span>{usageUnavailable ? '-' : (summary?.activeDays ?? 0)}일 참여</span>
      </div>
    </article>
  )
}

const ROM_TONE_CLASSES = [
  styles.romCellMint,
  styles.romCellLavender,
  styles.romCellPink,
  styles.romCellCyan,
] as const

function formatRomDegrees(value: number | null | undefined): string {
  if (typeof value !== 'number') return '확인 중'
  return `${value.toFixed(1)}도`
}

function romGap(joint: RomJointDetail): number | null {
  const { leftRangeDeg, rightRangeDeg } = joint
  if (typeof leftRangeDeg !== 'number' || typeof rightRangeDeg !== 'number') return null
  return Math.abs(leftRangeDeg - rightRangeDeg)
}

function isBelowCaptureThreshold(value: number | null | undefined): boolean {
  return typeof value === 'number' && value < ROM_CAPTURE_WARN_PERCENT
}

function resolveRomStatus(joint: RomJointDetail): { label: string; className: string } {
  if (!joint.analysisAvailable) {
    return { label: '기록 부족', className: styles.romStatusMuted }
  }
  if (
    isBelowCaptureThreshold(joint.confidencePercent) ||
    isBelowCaptureThreshold(joint.coveragePercent)
  ) {
    return { label: '촬영 확인', className: styles.romStatusWarn }
  }
  const gap = romGap(joint)
  if (gap !== null && gap >= ROM_BALANCE_ATTENTION_DEG) {
    return { label: '좌우 차이', className: styles.romStatusAttention }
  }
  return { label: '안정적', className: styles.romStatusGood }
}

export function ROMSummaryCard() {
  const navigate = useNavigate()
  const { data: patientId } = useMyPatientId()
  const { data: movementAnalysis, isError, isLoading } = useRomMovementAnalysis(patientId)
  const items = movementAnalysis?.joints.slice(0, 4) ?? []
  const emptyMessage = isError
    ? '움직임 분석을 불러오지 못했습니다.'
    : isLoading
      ? '움직임 기록을 불러오는 중입니다.'
      : '최근 체조 세션에서 관절이 화면에 잡히면 표시됩니다.'

  return (
    <article className={styles.card}>
      <header className={styles.cardHead}>
        <CardTitle tip="최근 체조 세션에서 관절이 실제로 움직인 각도입니다. 100점 만점 점수가 아니라 최대 각도와 최소 각도의 차이입니다.">
          운동 중 움직임 범위
        </CardTitle>
        <button type="button" className={styles.cardAction} onClick={() => navigate('/rom')}>
          상세 보기
        </button>
      </header>
      {items.length === 0 ? (
        <div className={styles.romEmpty}>{emptyMessage}</div>
      ) : (
        <div className={styles.romGrid}>
          {items.map((joint, index) => {
            const tone = ROM_TONE_CLASSES[index % ROM_TONE_CLASSES.length]
            const status = resolveRomStatus(joint)
            return (
              <div key={joint.id} className={`${styles.romCell} ${tone}`}>
                <span className={styles.romJoint}>{joint.name}</span>
                <span className={styles.romPercent}>{formatRomDegrees(joint.currentRangeDeg)}</span>
                <span className={styles.romSubMetric}>
                  좌우 차이 {formatRomDegrees(romGap(joint))}
                </span>
                <span className={`${styles.romRating} ${status.className}`}>{status.label}</span>
              </div>
            )
          })}
        </div>
      )}
    </article>
  )
}
