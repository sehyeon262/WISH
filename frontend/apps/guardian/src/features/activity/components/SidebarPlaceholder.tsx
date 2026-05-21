import { useMemo, type CSSProperties } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import gisungImg from '@/assets/gisung.png'
import rumiImg from '@/assets/rumi.png'
import seokjaeImg from '@/assets/seokjae.png'
import sungsuImg from '@/assets/sungsu.png'
import { useMyPatientId } from '@/features/auth/hooks/useMyPatientId'
import {
  useDailyUsageStats,
  useMyArtworks,
  useMyMusicResults,
  useMyTaekwondoSessions,
  usePatientExerciseSessions,
} from '@/features/activity/hooks'
import styles from './SidebarPlaceholder.module.css'

type ActivityStatus = 'done' | 'pending'
type ActivityItemId = 'music' | 'art' | 'taekwondo' | 'gymnastics'

type ActivityItem = {
  id: ActivityItemId
  name: string
  avatarUrl: string
  thumbScale?: string
  thumbOffsetY?: string
  to?: string
}

type LatestActivityCandidate = {
  id: ActivityItemId
  at: string | null | undefined
}

const STATUS_LABEL: Record<ActivityStatus, string> = {
  done: '완료',
  pending: '기록 없음',
}

const STATUS_CLASS: Record<ActivityStatus, string> = {
  done: 'statusDone',
  pending: 'statusNone',
}

const ACTIVITY_ITEMS: ActivityItem[] = [
  {
    id: 'music',
    name: '음악',
    avatarUrl: gisungImg,
    thumbScale: '1.5',
    thumbOffsetY: '-6%',
    to: '/activity',
  },
  {
    id: 'art',
    name: '미술',
    avatarUrl: rumiImg,
    thumbScale: '1.5',
    thumbOffsetY: '-8%',
    to: '/activity?tab=art',
  },
  {
    id: 'taekwondo',
    name: '태권도',
    avatarUrl: seokjaeImg,
    thumbScale: '1.5',
    thumbOffsetY: '-6%',
    to: '/activity?tab=taekwondo',
  },
  {
    id: 'gymnastics',
    name: '체조',
    avatarUrl: sungsuImg,
    thumbScale: '1.5',
    thumbOffsetY: '-6%',
    to: '/activity?tab=gymnastics',
  },
]

function todayIsoDate(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function resolveActiveItemId(searchParams: URLSearchParams): ActivityItemId {
  const tab = searchParams.get('tab')
  if (tab === 'art') return 'art'
  if (tab === 'taekwondo') return 'taekwondo'
  if (tab === 'gymnastics') return 'gymnastics'
  return 'music'
}

export function SidebarPlaceholder() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const activeItemId = resolveActiveItemId(searchParams)

  const { data: patientId } = useMyPatientId()
  const today = todayIsoDate()
  const { data: daily } = useDailyUsageStats(patientId ?? undefined, { from: today, to: today })
  const { data: musicPage } = useMyMusicResults({ size: 1 })
  const { data: artworkPage } = useMyArtworks({ size: 1 })
  const { data: taekwondoPage } = useMyTaekwondoSessions(patientId ?? undefined, { size: 1 })
  const { data: exerciseSessions } = usePatientExerciseSessions(patientId ?? undefined, { size: 1 })
  const todayItem = daily?.items?.find(item => item.date === today)

  const latestActivityId = useMemo(
    () =>
      pickLatestActivityId([
        { id: 'music', at: musicPage?.content?.[0]?.playedAt },
        { id: 'art', at: artworkPage?.content?.[0]?.createdAt },
        { id: 'taekwondo', at: taekwondoPage?.content?.[0]?.createdAt },
        { id: 'gymnastics', at: exerciseSessions?.[0]?.createdAt },
      ]),
    [artworkPage, exerciseSessions, musicPage, taekwondoPage],
  )

  return (
    <div className={styles.card}>
      <h3 className={styles.title}>오늘의 활동</h3>
      <div className={styles.list}>
        {ACTIVITY_ITEMS.map(item => {
          const isSelected = activeItemId === item.id
          const isClickable = item.to != null
          const seconds = todayItem ? (todayItem[item.id] ?? 0) : 0
          const status: ActivityStatus = seconds > 0 ? 'done' : 'pending'
          const isLatest = latestActivityId === item.id
          return (
            <button
              key={item.id}
              type="button"
              disabled={!isClickable}
              aria-current={isSelected ? 'page' : undefined}
              onClick={isClickable ? () => navigate(item.to!) : undefined}
              className={`${styles.item} ${isSelected ? styles.itemActive : ''}`}
            >
              <span className={styles.avatar} aria-hidden>
                <img
                  src={item.avatarUrl}
                  alt=""
                  className={styles.avatarImg}
                  style={
                    {
                      ...(item.thumbScale ? { '--thumb-scale': item.thumbScale } : {}),
                      ...(item.thumbOffsetY ? { '--thumb-offset-y': item.thumbOffsetY } : {}),
                    } as CSSProperties
                  }
                />
              </span>
              <span className={styles.meta}>
                <span className={styles.name}>{item.name}</span>
                <span className={styles.statusRow}>
                  <span className={`${styles.status} ${styles[STATUS_CLASS[status]]}`}>
                    {STATUS_LABEL[status]}
                  </span>
                  {isLatest ? <span className={styles.recentBadge}>최근</span> : null}
                </span>
              </span>
              {isSelected && <span className={styles.check}>✓</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function pickLatestActivityId(candidates: LatestActivityCandidate[]): ActivityItemId | null {
  let latestId: ActivityItemId | null = null
  let latestTime = 0

  for (const candidate of candidates) {
    const time = toTimeValue(candidate.at)
    if (time > latestTime) {
      latestId = candidate.id
      latestTime = time
    }
  }

  return latestId
}

function toTimeValue(value: string | null | undefined): number {
  if (!value) return 0
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? time : 0
}
