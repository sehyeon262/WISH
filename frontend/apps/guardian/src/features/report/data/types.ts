export type ISODate = string

export type WeekRange = {
  start: ISODate
  end: ISODate
  isCurrentWeek: boolean
  daysElapsed: number
}

export type ReportSummary = {
  participatedDays: number
  totalMinutes: number
  sessionCount: number
  fuelEarned: number
  diff: {
    participatedDays: number
    totalMinutes: number
    sessionCount: number
    fuelEarned: number
  }
}

export type ParticipationDay = {
  date: ISODate
  intensity: 0 | 1 | 2 | 3 | 4
  minutes: number
}

export type RomTrendPoint = {
  weekLabel: string
  value: number
}

export type RomJointTrend = {
  joint: string
  unit: '°' | '%'
  current: number
  delta: number
  trend: RomTrendPoint[]
  tone: 'mint' | 'lavender' | 'pink' | 'cyan'
}

export type UsageRankEntry = {
  rank: number
  name: string
  minutes: number
  isMe: boolean
}

export type UsageCompare = {
  selfMinutes: number
  othersAverageMinutes: number
  ranking: UsageRankEntry[]
}

export type TimeBucketId = 'morning' | 'day' | 'evening' | 'night'

export type TimeBucket = {
  id: TimeBucketId
  label: string
  range: string
  minutes: number
}

export type GameId = 'music' | 'taekwondo' | 'exercise' | 'art'

export type AchievementStat = {
  prefix?: string
  value: string
  strong?: boolean
}

export type GameAchievement = {
  gameId: GameId
  label: string
  emoji: string
  minutes: number
  hasData: boolean
  stats: AchievementStat[]
  highlight: string | null
}

export type ReportData = {
  patientName: string
  week: WeekRange
  oneLiner: string
  summary: ReportSummary
  participation: ParticipationDay[]
  romTrends: RomJointTrend[]
  usage: UsageCompare
  timeBuckets: TimeBucket[]
  topBucketId: TimeBucketId
  achievements: GameAchievement[]
}
