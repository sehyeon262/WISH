import faceUrl from '@/assets/face.png'
import top1Url from '@/assets/top1.png'
import top2Url from '@/assets/top2.png'
import top3Url from '@/assets/top3.png'
import top4Url from '@/assets/top4.png'
import top5Url from '@/assets/top5.png'

export type Movement = {
  id: string
  name: string
  score: number
  thumbnail: string
}

export type Session = {
  id: string
  date: string
  weekday: string
  shortDate: string
  score: number
  isToday?: boolean
}

export type RangeOfMotion = {
  joint: string
  percent: number
  rating: '좋음' | '우수' | '보완 필요'
  tone: 'mint' | 'lavender' | 'pink' | 'cyan'
}

export type TrendPoint = {
  date: string
  score: number
}

export type SessionView = 'current' | 'previous'

export const PATIENT = {
  name: '김댕동',
  age: 8,
  avatarUrl: faceUrl,
}

export const MOVEMENTS: Movement[] = [
  { id: 'march', name: '제자리 걷기', score: 92, thumbnail: top1Url },
  { id: 'side-step', name: '사이드 스텝', score: 84, thumbnail: top2Url },
  { id: 'torso-cross', name: '몸통 가로 지르기', score: 78, thumbnail: top3Url },
  { id: 'face-cross', name: '얼굴 가로 지르기', score: 81, thumbnail: top4Url },
  { id: 'sit-stand', name: '앉았다 일어서기', score: 88, thumbnail: top5Url },
]

/** 세션 이력 — 오늘 기준으로 거꾸로 며칠 전인지 + 점수 (오래된 순 → 최신 순) */
const SESSION_HISTORY: ReadonlyArray<{ daysAgo: number; score: number }> = (() => {
  // 최근 6회는 RecentSessions 행과 동일하게 고정 표시
  const recent = [
    { daysAgo: 14, score: 65 },
    { daysAgo: 10, score: 72 },
    { daysAgo: 7, score: 78 },
    { daysAgo: 4, score: 75 },
    { daysAgo: 2, score: 83 },
    { daysAgo: 0, score: 87 },
  ]
  // 더 긴 범위(최근 12·30회) 표시용 과거 세션 — 약 2일 간격
  const older: { daysAgo: number; score: number }[] = []
  for (let i = 0; i < 24; i++) {
    const daysAgo = 16 + i * 2 // 16, 18, ..., 62
    const progress = (23 - i) / 23 // 최신에 가까울수록 1
    const base = 50 + progress * 14 // 50 → 64
    const noise = ((i * 7) % 9) - 4
    older.push({
      daysAgo,
      score: Math.max(40, Math.min(72, Math.round(base + noise))),
    })
  }
  return [...older.reverse(), ...recent]
})()

const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'] as const

function dateMinusDays(days: number): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - days)
  return d
}

function shortDateLabel(d: Date): string {
  return `${d.getMonth() + 1}월 ${d.getDate()}일`
}

function isoDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export const RECENT_SESSIONS: Session[] = SESSION_HISTORY.slice(-6).map((h, i) => {
  const d = dateMinusDays(h.daysAgo)
  const isToday = h.daysAgo === 0
  return {
    id: `s${i + 1}`,
    date: isoDate(d),
    weekday: isToday ? '오늘' : WEEKDAY_KO[d.getDay()],
    shortDate: shortDateLabel(d),
    score: h.score,
    isToday,
  }
})

export const TREND: TrendPoint[] = SESSION_HISTORY.map(h => ({
  date: shortDateLabel(dateMinusDays(h.daysAgo)),
  score: h.score,
}))

export type TrendRangeId = 6 | 12 | 30
export const TREND_RANGE_OPTIONS: ReadonlyArray<{ id: TrendRangeId; label: string }> = [
  { id: 6, label: '최근 6회' },
  { id: 12, label: '최근 12회' },
  { id: 30, label: '최근 30회' },
]

export const RANGE_OF_MOTION: RangeOfMotion[] = [
  { joint: '어깨', percent: 92, rating: '좋음', tone: 'mint' },
  { joint: '엉덩이', percent: 88, rating: '좋음', tone: 'lavender' },
  { joint: '무릎', percent: 84, rating: '좋음', tone: 'pink' },
  { joint: '발목', percent: 90, rating: '우수', tone: 'cyan' },
]

const latest = SESSION_HISTORY[SESSION_HISTORY.length - 1]
const previous = SESSION_HISTORY[SESSION_HISTORY.length - 2]
export const OVERALL_SCORE = {
  current: latest.score,
  delta: latest.score - previous.score,
  title: '아주 잘했어요!',
  subtitle: '지난 번보다\n더 잘하고 있어요.',
}
