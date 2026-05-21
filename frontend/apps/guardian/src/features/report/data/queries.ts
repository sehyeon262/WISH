import { useMemo } from 'react'
import type {
  Artwork,
  ArtworkPage,
  DailyUsageStats,
  ExerciseSessionDetail,
  FuelStatus,
  MusicResultDetail,
  MusicResultPage,
  TaekwondoSessionDetail,
  TaekwondoSessionPage,
  UsageAverages,
  UsageRankings,
} from '@wish/api-client'
import {
  useDailyUsageStats,
  useMyArtworks,
  usePatientExerciseSessions,
  useMyMusicResults,
  useMyTaekwondoSessions,
  useUsageAverages,
  useUsageRankings,
} from '@/features/activity/hooks'
import { useFuelStatus } from '@/features/fuel/hooks'
import { buildRomTrends, buildUsageRanking } from './mock'
import type {
  AchievementStat,
  GameAchievement,
  ParticipationDay,
  ReportData,
  ReportSummary,
  TimeBucket,
  TimeBucketId,
  UsageCompare,
  WeekRange,
} from './types'
import { shiftWeek, toISODate } from './week'

const DAY_MS = 24 * 60 * 60 * 1000

function intensityFromMinutes(min: number): 0 | 1 | 2 | 3 | 4 {
  if (min <= 0) return 0
  if (min < 20) return 1
  if (min < 40) return 2
  if (min < 60) return 3
  return 4
}

function inWeek(isoTs: string | null | undefined, week: WeekRange): boolean {
  if (!isoTs) return false
  const date = isoTs.slice(0, 10)
  return date >= week.start && date <= week.end
}

function contentSecondsOfDay(item: DailyUsageStats['items'][number]): number {
  return (item.art ?? 0) + (item.music ?? 0) + (item.taekwondo ?? 0) + (item.gymnastics ?? 0)
}

function buildParticipationFromDaily(
  daily: DailyUsageStats | undefined,
  week: WeekRange,
): ParticipationDay[] {
  const start = new Date(week.start)
  const map = new Map<string, number>()
  if (daily?.items) {
    for (const item of daily.items) {
      const minutes = Math.round(contentSecondsOfDay(item) / 60)
      map.set(item.date, minutes)
    }
  }
  return Array.from({ length: 7 }, (_, i) => {
    const date = toISODate(new Date(start.getTime() + i * DAY_MS))
    const minutes = map.get(date) ?? 0
    return { date, minutes, intensity: intensityFromMinutes(minutes) }
  })
}

function sumDailyContentMinutes(daily: DailyUsageStats | undefined): number {
  if (!daily?.items) return 0
  return daily.items.reduce((sum, item) => sum + Math.round(contentSecondsOfDay(item) / 60), 0)
}

function countWeekResults<T>(
  page: { content?: T[] } | undefined,
  pickDate: (item: T) => string | null | undefined,
  week: WeekRange,
): T[] {
  if (!page?.content) return []
  return page.content.filter(item => inWeek(pickDate(item), week))
}

function sumFuelEarnedThisWeek(fuel: FuelStatus | undefined, week: WeekRange): number {
  if (!fuel?.events) return 0
  return fuel.events
    .filter(e => inWeek(e.createdAt, week))
    .reduce((sum, e) => sum + (e.amount ?? 0), 0)
}

function buildSummary({
  daily,
  musicWeek,
  taekwondoWeek,
  exerciseWeek,
  fuelEarned,
}: {
  daily: DailyUsageStats | undefined
  musicWeek: MusicResultDetail[]
  taekwondoWeek: TaekwondoSessionDetail[]
  exerciseWeek: ExerciseSessionDetail[]
  fuelEarned: number
}): ReportSummary {
  const totalMinutes = sumDailyContentMinutes(daily)
  const participatedDays = (daily?.items ?? []).filter(item => contentSecondsOfDay(item) > 0).length
  const sessionCount = musicWeek.length + taekwondoWeek.length + exerciseWeek.length
  return {
    participatedDays,
    totalMinutes,
    sessionCount,
    fuelEarned,
    diff: { participatedDays: 0, totalMinutes: 0, sessionCount: 0, fuelEarned: 0 },
  }
}

function buildUsageCompare(
  averages: UsageAverages | undefined,
  rankings: UsageRankings | undefined,
  selfMinutes: number,
  selfName: string,
  selfPatientId: number | undefined,
): UsageCompare {
  // 컨텐츠 평균(art/music/taekwondo/gymnastics)만 합산 — LOGIN 은 로비/메뉴 포함이라 의미 부풀려짐
  const othersAverageSeconds = averages
    ? averages.contentAverages
        .filter(c => c.contentType !== 'LOGIN')
        .reduce((sum, c) => sum + (c.averageSeconds ?? 0), 0)
    : 0
  const othersAverageMinutes = Math.round(othersAverageSeconds / 60)

  // BE 가 전체 환자 닉네임 + 합산 시간 순위를 내려주면 그대로 사용. 응답 전에는 mock fallback.
  let ranking
  if (rankings) {
    ranking = rankings.rankings.map(r => ({
      rank: r.rank,
      name: r.nickname,
      minutes: Math.round(r.totalSeconds / 60),
      isMe: selfPatientId !== undefined && r.patientProfileId === selfPatientId,
    }))
  } else {
    ranking = buildUsageRanking(selfName, selfMinutes)
  }

  return {
    selfMinutes,
    othersAverageMinutes,
    ranking,
  }
}

function hourToBucket(hour: number): TimeBucketId {
  if (hour >= 6 && hour < 12) return 'morning'
  if (hour >= 12 && hour < 18) return 'day'
  if (hour >= 18 && hour < 21) return 'evening'
  return 'night'
}

function buildTimeBucketsFromSessions({
  musicWeek,
  taekwondoWeek,
  exerciseWeek,
  artworksWeek,
}: {
  musicWeek: MusicResultDetail[]
  taekwondoWeek: TaekwondoSessionDetail[]
  exerciseWeek: ExerciseSessionDetail[]
  artworksWeek: Artwork[]
}): { buckets: TimeBucket[]; topBucketId: TimeBucketId } {
  const minutes: Record<TimeBucketId, number> = {
    morning: 0,
    day: 0,
    evening: 0,
    night: 0,
  }
  const add = (iso: string, secondsOrMs: number, isMs = false) => {
    const hour = new Date(iso).getHours()
    const secs = isMs ? secondsOrMs / 1000 : secondsOrMs
    minutes[hourToBucket(hour)] += Math.round(secs / 60)
  }
  for (const m of musicWeek) add(m.playedAt, m.playedDurationMs ?? 0, true)
  for (const t of taekwondoWeek) add(t.createdAt, t.durationSec ?? 0)
  for (const e of exerciseWeek) add(e.createdAt, e.durationSec ?? 0)
  for (const a of artworksWeek) add(a.createdAt, a.playDurationSeconds ?? 0)

  const buckets: TimeBucket[] = [
    { id: 'morning', label: '아침', range: '6~12시', minutes: minutes.morning },
    { id: 'day', label: '낮', range: '12~18시', minutes: minutes.day },
    { id: 'evening', label: '저녁', range: '18~21시', minutes: minutes.evening },
    { id: 'night', label: '밤', range: '21~24시', minutes: minutes.night },
  ]
  const topBucketId = buckets.reduce((top, b) => (b.minutes > top.minutes ? b : top), buckets[0]).id
  return { buckets, topBucketId }
}

function sumDailyField(
  daily: DailyUsageStats | undefined,
  field: 'music' | 'taekwondo' | 'gymnastics' | 'art',
): number {
  if (!daily?.items) return 0
  return daily.items.reduce((sum, item) => sum + Math.round((item[field] ?? 0) / 60), 0)
}

function buildMusicAchievement(results: MusicResultDetail[], minutes: number): GameAchievement {
  if (results.length === 0) {
    return {
      gameId: 'music',
      label: '음악',
      emoji: '🎵',
      minutes,
      hasData: minutes > 0,
      stats: [],
      highlight: null,
    }
  }
  const avgAccuracy = Math.round(
    (results.reduce((s, r) => s + (r.accuracy ?? 0), 0) / results.length) * 100,
  )
  const best = results.reduce<MusicResultDetail>((b, r) => (r.score > b.score ? r : b), results[0])
  const hasNewBest = results.some(r => r.score === best.score)
  return {
    gameId: 'music',
    label: '음악',
    emoji: '🎵',
    minutes,
    hasData: true,
    stats: [
      { prefix: '평균 정확도 ', value: `${avgAccuracy}%`, strong: true },
      { value: `최고 점수 ${best.score.toLocaleString()}`, strong: true },
    ],
    highlight: hasNewBest && results.length >= 3 ? '신기록' : null,
  }
}

function buildTaekwondoAchievement(
  sessions: TaekwondoSessionDetail[],
  minutes: number,
): GameAchievement {
  if (sessions.length === 0) {
    return {
      gameId: 'taekwondo',
      label: '태권도',
      emoji: '🥋',
      minutes,
      hasData: minutes > 0,
      stats: [],
      highlight: null,
    }
  }
  const avgAccuracy = Math.round(
    (sessions.reduce((s, r) => s + (r.averageAccuracy ?? 0), 0) / sessions.length) * 100,
  )
  const bestSession = sessions.reduce(
    (b, s) => (s.averageAccuracy > b.averageAccuracy ? s : b),
    sessions[0],
  )
  return {
    gameId: 'taekwondo',
    label: '태권도',
    emoji: '🥋',
    minutes,
    hasData: true,
    stats: [
      { prefix: '평균 정확도 ', value: `${avgAccuracy}%`, strong: true },
      {
        value: `최고 정확도 ${Math.round(bestSession.averageAccuracy * 100)}%`,
        strong: true,
      },
    ],
    highlight: null,
  }
}

function buildExerciseAchievement(
  sessions: ExerciseSessionDetail[],
  minutes: number,
): GameAchievement {
  if (sessions.length === 0) {
    return {
      gameId: 'exercise',
      label: '체조',
      emoji: '🤸',
      minutes,
      hasData: minutes > 0,
      stats: [],
      highlight: null,
    }
  }
  const avgAccuracy = Math.round(
    (sessions.reduce((s, r) => s + (r.averageAccuracy ?? 0), 0) / sessions.length) * 100,
  )
  const bestSession = sessions.reduce(
    (b, s) => (s.averageAccuracy > b.averageAccuracy ? s : b),
    sessions[0],
  )
  return {
    gameId: 'exercise',
    label: '체조',
    emoji: '🤸',
    minutes,
    hasData: true,
    stats: [
      { prefix: '평균 정확도 ', value: `${avgAccuracy}%`, strong: true },
      {
        value: `최고 정확도 ${Math.round(bestSession.averageAccuracy * 100)}%`,
        strong: true,
      },
    ],
    highlight: null,
  }
}

function buildOneLiner(summary: ReportSummary, achievements: GameAchievement[]): string {
  // 데이터가 전혀 없을 때 → 활동 안 했다고 명시.
  if (summary.totalMinutes === 0 && summary.sessionCount === 0) {
    return '아직 이번 주는 함께한 기록이 없어요'
  }
  // 시간이 가장 길었던 활동을 그대로 노출 — 추측·과장 없는 사실 기반 한 줄.
  const topGame = achievements.reduce<GameAchievement | null>(
    (top, g) => (g.minutes > (top?.minutes ?? 0) ? g : top),
    null,
  )
  if (topGame && topGame.minutes > 0) {
    return `이번 주는 ${topGame.label} 시간이 가장 길었어요 ${topGame.emoji}`
  }
  // 게임 활동은 0인데 login(접속) 만 있는 경우 — 잠깐 들렀다고 표현.
  return '이번 주에는 잠깐 들러줬어요'
}

function buildArtAchievement(artworks: Artwork[], minutes: number): GameAchievement {
  if (artworks.length === 0) {
    return {
      gameId: 'art',
      label: '미술',
      emoji: '🎨',
      minutes,
      hasData: minutes > 0,
      stats: [],
      highlight: null,
    }
  }
  const totalSeconds = artworks.reduce((s, a) => s + (a.playDurationSeconds ?? 0), 0)
  const avgMinutes = Math.max(1, Math.round(totalSeconds / artworks.length / 60))
  const latest = artworks.reduce((b, a) => (a.createdAt > b.createdAt ? a : b), artworks[0])
  const latestTitle = latest.title?.trim()
  const stats: AchievementStat[] = [
    { value: `${artworks.length}개 작품 완성`, strong: true },
    { prefix: '작품당 평균 ', value: `${avgMinutes}분`, strong: true },
  ]
  if (latestTitle) {
    stats.push({ prefix: '최근 작품: ', value: latestTitle })
  }
  return {
    gameId: 'art',
    label: '미술',
    emoji: '🎨',
    minutes,
    hasData: true,
    stats,
    highlight: null,
  }
}

type UseReportDataOptions = {
  patientId: number | undefined
  patientName: string
  week: WeekRange
}

export function useReportData({ patientId, patientName, week }: UseReportDataOptions): {
  data: ReportData
  isLoading: boolean
  isError: boolean
} {
  const lastWeek = useMemo(() => shiftWeek(week, -1), [week])

  const dailyQuery = useDailyUsageStats(patientId, { from: week.start, to: week.end })
  const lastDailyQuery = useDailyUsageStats(patientId, {
    from: lastWeek.start,
    to: lastWeek.end,
  })
  const averagesQuery = useUsageAverages({ from: week.start, to: week.end })
  const rankingsQuery = useUsageRankings({ from: week.start, to: week.end })
  const musicQuery = useMyMusicResults({ size: 100 })
  const taekwondoQuery = useMyTaekwondoSessions(patientId, { size: 100 })
  const exerciseQuery = usePatientExerciseSessions(patientId, { size: 100 })
  const artworksQuery = useMyArtworks({ size: 100 })
  const fuelQuery = useFuelStatus()

  const data = useMemo<ReportData>(() => {
    const dailyData = dailyQuery.data as DailyUsageStats | undefined
    const lastDailyData = lastDailyQuery.data as DailyUsageStats | undefined
    const averagesData = averagesQuery.data as UsageAverages | undefined
    const rankingsData = rankingsQuery.data as UsageRankings | undefined
    const musicPage = musicQuery.data as MusicResultPage | undefined
    const taekwondoPage = taekwondoQuery.data as TaekwondoSessionPage | undefined
    const exerciseSessions = exerciseQuery.data as ExerciseSessionDetail[] | undefined
    const artworksPage = artworksQuery.data as ArtworkPage | undefined
    const fuelData = fuelQuery.data as FuelStatus | undefined

    const musicWeek = countWeekResults(musicPage, r => r.playedAt, week)
    const taekwondoWeek = countWeekResults(taekwondoPage, s => s.createdAt, week)
    const exerciseWeek = exerciseSessions
      ? exerciseSessions.filter(s => inWeek(s.createdAt, week))
      : []
    const artworksWeek = countWeekResults(artworksPage, a => a.createdAt, week)
    const fuelEarned = sumFuelEarnedThisWeek(fuelData, week)

    // 지난주 데이터 (변화량 계산용) — 세션은 동일 list 에서 필터, daily 만 추가 fetch
    const lastMusicWeek = countWeekResults(musicPage, r => r.playedAt, lastWeek)
    const lastTaekwondoWeek = countWeekResults(taekwondoPage, s => s.createdAt, lastWeek)
    const lastExerciseWeek = exerciseSessions
      ? exerciseSessions.filter(s => inWeek(s.createdAt, lastWeek))
      : []
    const lastFuelEarned = sumFuelEarnedThisWeek(fuelData, lastWeek)

    const participation = buildParticipationFromDaily(dailyData, week)
    const thisSummary = buildSummary({
      daily: dailyData,
      musicWeek,
      taekwondoWeek,
      exerciseWeek,
      fuelEarned,
    })
    const lastSummary = buildSummary({
      daily: lastDailyData,
      musicWeek: lastMusicWeek,
      taekwondoWeek: lastTaekwondoWeek,
      exerciseWeek: lastExerciseWeek,
      fuelEarned: lastFuelEarned,
    })
    const summary: ReportSummary = {
      ...thisSummary,
      diff: {
        participatedDays: thisSummary.participatedDays - lastSummary.participatedDays,
        totalMinutes: thisSummary.totalMinutes - lastSummary.totalMinutes,
        sessionCount: thisSummary.sessionCount - lastSummary.sessionCount,
        fuelEarned: thisSummary.fuelEarned - lastSummary.fuelEarned,
      },
    }

    const usage = buildUsageCompare(
      averagesData,
      rankingsData,
      summary.totalMinutes,
      patientName,
      patientId,
    )

    const { buckets: timeBuckets, topBucketId } = buildTimeBucketsFromSessions({
      musicWeek,
      taekwondoWeek,
      exerciseWeek,
      artworksWeek,
    })

    const achievements: GameAchievement[] = [
      buildMusicAchievement(musicWeek, sumDailyField(dailyData, 'music')),
      buildTaekwondoAchievement(taekwondoWeek, sumDailyField(dailyData, 'taekwondo')),
      buildExerciseAchievement(exerciseWeek, sumDailyField(dailyData, 'gymnastics')),
      buildArtAchievement(artworksWeek, sumDailyField(dailyData, 'art')),
    ]

    return {
      patientName,
      week,
      oneLiner: buildOneLiner(summary, achievements),
      summary,
      participation,
      // ROM 측정 데이터는 BE 미지원 — 데모용 하드코딩 mock 사용.
      romTrends: buildRomTrends(),
      usage,
      timeBuckets,
      topBucketId,
      achievements,
    }
  }, [
    week,
    lastWeek,
    patientName,
    patientId,
    dailyQuery.data,
    lastDailyQuery.data,
    averagesQuery.data,
    rankingsQuery.data,
    musicQuery.data,
    taekwondoQuery.data,
    exerciseQuery.data,
    artworksQuery.data,
    fuelQuery.data,
  ])

  return {
    data,
    isLoading:
      dailyQuery.isLoading ||
      averagesQuery.isLoading ||
      musicQuery.isLoading ||
      fuelQuery.isLoading,
    isError: dailyQuery.isError && averagesQuery.isError,
  }
}
