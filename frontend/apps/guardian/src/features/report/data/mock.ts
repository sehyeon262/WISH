import type {
  GameAchievement,
  ParticipationDay,
  ReportData,
  RomJointTrend,
  TimeBucket,
  UsageRankEntry,
  WeekRange,
} from './types'
import { buildWeekRange, toISODate } from './week'

const DAY_MS = 24 * 60 * 60 * 1000

function daysOfWeek(week: WeekRange): string[] {
  const start = new Date(week.start)
  return Array.from({ length: 7 }, (_, i) => toISODate(new Date(start.getTime() + i * DAY_MS)))
}

function buildParticipation(week: WeekRange, seed: number): ParticipationDay[] {
  const days = daysOfWeek(week)
  const pattern: Array<{ intensity: 0 | 1 | 2 | 3 | 4; minutes: number }> = [
    { intensity: 3, minutes: 38 },
    { intensity: 2, minutes: 22 },
    { intensity: 4, minutes: 52 },
    { intensity: 0, minutes: 0 },
    { intensity: 3, minutes: 41 },
    { intensity: 2, minutes: 28 },
    { intensity: 4, minutes: 44 },
  ]
  return days.map((date, i) => {
    const within = week.isCurrentWeek && i >= week.daysElapsed
    const base = pattern[(i + seed) % pattern.length]
    if (within) return { date, intensity: 0, minutes: 0 }
    return { date, intensity: base.intensity, minutes: base.minutes }
  })
}

export function buildRomTrends(): RomJointTrend[] {
  return [
    {
      joint: '어깨 외전',
      unit: '°',
      current: 142,
      delta: 12,
      tone: 'lavender',
      trend: [
        { weekLabel: '4주 전', value: 118 },
        { weekLabel: '3주 전', value: 124 },
        { weekLabel: '2주 전', value: 130 },
        { weekLabel: '지난주', value: 130 },
        { weekLabel: '이번 주', value: 142 },
      ],
    },
    {
      joint: '팔꿈치 굴곡',
      unit: '°',
      current: 128,
      delta: 4,
      tone: 'mint',
      trend: [
        { weekLabel: '4주 전', value: 116 },
        { weekLabel: '3주 전', value: 120 },
        { weekLabel: '2주 전', value: 122 },
        { weekLabel: '지난주', value: 124 },
        { weekLabel: '이번 주', value: 128 },
      ],
    },
    {
      joint: '무릎 굴곡',
      unit: '°',
      current: 134,
      delta: -2,
      tone: 'cyan',
      trend: [
        { weekLabel: '4주 전', value: 130 },
        { weekLabel: '3주 전', value: 132 },
        { weekLabel: '2주 전', value: 138 },
        { weekLabel: '지난주', value: 136 },
        { weekLabel: '이번 주', value: 134 },
      ],
    },
  ]
}

function buildTimeBuckets(): TimeBucket[] {
  return [
    { id: 'morning', label: '아침', range: '6~12시', minutes: 18 },
    { id: 'day', label: '낮', range: '12~18시', minutes: 42 },
    { id: 'evening', label: '저녁', range: '18~21시', minutes: 96 },
    { id: 'night', label: '밤', range: '21~24시', minutes: 12 },
  ]
}

// 실제 다른 환자 목록은 보호자 권한으로 조회 불가 (BE /patient-profiles 는 본인 소유만).
// BE 평균(약 30분)에 맞춰 8명 분포 평균이 ~38분이 되도록 스케일링한 mock.
// 향후 BE 가 leaderboard 엔드포인트 제공하면 실제 닉네임+분 으로 교체.
const PSEUDONYM_PEERS: ReadonlyArray<{ name: string; minutes: number }> = [
  { name: '별이', minutes: 90 },
  { name: '토끼', minutes: 65 },
  { name: '곰돌이', minutes: 50 },
  { name: '햇님', minutes: 38 },
  { name: '다람이', minutes: 28 },
  { name: '미미', minutes: 18 },
  { name: '뽀뽀', minutes: 10 },
  { name: '솜이', minutes: 4 },
]

export function buildUsageRanking(selfName: string, selfMinutes: number): UsageRankEntry[] {
  const entries: Array<Omit<UsageRankEntry, 'rank'>> = [
    ...PSEUDONYM_PEERS.map(p => ({ name: p.name, minutes: p.minutes, isMe: false })),
    { name: selfName, minutes: selfMinutes, isMe: true },
  ]
  entries.sort((a, b) => b.minutes - a.minutes)
  // 표준 경기 순위(1, 2, 2, 4 …) — 동률은 같은 rank, 그 다음은 건너뛴 rank.
  let previousMinutes = Number.NaN
  let previousRank = 0
  return entries.map((entry, i) => {
    const rank = entry.minutes === previousMinutes ? previousRank : i + 1
    previousMinutes = entry.minutes
    previousRank = rank
    return { ...entry, rank }
  })
}

function buildAchievements(): GameAchievement[] {
  return [
    {
      gameId: 'music',
      label: '음악',
      emoji: '🎵',
      minutes: 42,
      hasData: true,
      stats: [
        { prefix: '평균 정확도 ', value: '88%', strong: true },
        { value: '최고 점수 89,400', strong: true },
      ],
      highlight: '새 곡 잠금해제',
    },
    {
      gameId: 'taekwondo',
      label: '태권도',
      emoji: '🥋',
      minutes: 28,
      hasData: true,
      stats: [
        { prefix: '평균 정확도 ', value: '82%', strong: true },
        { value: '최고 정확도 91%', strong: true },
      ],
      highlight: null,
    },
    {
      gameId: 'exercise',
      label: '체조',
      emoji: '🤸',
      minutes: 36,
      hasData: true,
      stats: [
        { prefix: '평균 정확도 ', value: '91%', strong: true },
        { value: '최고 정확도 96%', strong: true },
      ],
      highlight: '신기록',
    },
    {
      gameId: 'art',
      label: '미술',
      emoji: '🎨',
      minutes: 18,
      hasData: true,
      stats: [
        { value: '3개 작품 완성', strong: true },
        { prefix: '작품당 평균 ', value: '6분', strong: true },
        { prefix: '최근 작품: ', value: '바다 풍경' },
      ],
      highlight: null,
    },
  ]
}

export function buildMockReport(week: WeekRange, patientName: string): ReportData {
  const participation = buildParticipation(week, 0)
  const totalMinutes = participation.reduce((sum, d) => sum + d.minutes, 0)
  const participatedDays = participation.filter(d => d.intensity > 0).length
  return {
    patientName,
    week,
    oneLiner: '이번 주, 어깨를 더 자유롭게 움직였어요 ✨',
    summary: {
      participatedDays,
      totalMinutes,
      sessionCount: 14,
      fuelEarned: 320,
      diff: {
        participatedDays: 2,
        totalMinutes: 15,
        sessionCount: 3,
        fuelEarned: 60,
      },
    },
    participation,
    romTrends: buildRomTrends(),
    usage: {
      selfMinutes: totalMinutes,
      othersAverageMinutes: 170,
      ranking: buildUsageRanking(patientName, totalMinutes),
    },
    timeBuckets: buildTimeBuckets(),
    topBucketId: 'evening',
    achievements: buildAchievements(),
  }
}

export function buildEmptyMockReport(week: WeekRange, patientName: string): ReportData {
  return {
    patientName,
    week,
    oneLiner: '아직 데이터를 모으고 있어요',
    summary: {
      participatedDays: 0,
      totalMinutes: 0,
      sessionCount: 0,
      fuelEarned: 0,
      diff: { participatedDays: 0, totalMinutes: 0, sessionCount: 0, fuelEarned: 0 },
    },
    participation: Array.from({ length: 7 }, (_, i) => {
      const start = new Date(week.start)
      const date = new Date(start.getTime() + i * DAY_MS)
      return { date: toISODate(date), intensity: 0 as const, minutes: 0 }
    }),
    romTrends: [],
    usage: {
      selfMinutes: 0,
      othersAverageMinutes: 170,
      ranking: buildUsageRanking(patientName, 0),
    },
    timeBuckets: buildTimeBuckets().map(b => ({ ...b, minutes: 0 })),
    topBucketId: 'evening',
    achievements: [],
  }
}

export const MOCK_CURRENT_WEEK = buildWeekRange()
