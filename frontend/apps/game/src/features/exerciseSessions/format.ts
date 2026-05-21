import type {
  ExerciseSessionDetail,
  ExerciseSessionMotionResult,
  ExerciseSessionSummary,
} from '@wish/api-client'

export type ExerciseSessionReportSummary = {
  totalSessionCount: number
  totalDurationSec: number
  averageCompletionRate: number | null
  totalCompletedMotionCount: number
  latestSessionAt: string | null
  exerciseTypeCounts: Record<string, number>
}

export function formatDurationSec(durationSec: number) {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return '0\uCD08'
  const totalSeconds = Math.floor(durationSec)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes <= 0) return `${seconds}\uCD08`
  return seconds > 0 ? `${minutes}\uBD84 ${seconds}\uCD08` : `${minutes}\uBD84`
}

export function formatCompletionRate(value: number | null | undefined) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '-'
  const percent = value <= 1 ? value * 100 : value
  return `${Math.round(percent)}%`
}

export const formatAccuracy = formatCompletionRate

export function formatExerciseType(type: string) {
  const labels: Record<string, string> = {
    TOP: '\uC0C1\uCCB4',
    BOTTOM: '\uD558\uCCB4',
    FULL_BODY: '\uC804\uC2E0',
    DANIEL: '\uB2E4\uB2C8\uC5D8',
  }

  return labels[type] ?? type
}

export function formatDateTime(createdAt: string | null | undefined) {
  if (!createdAt) return '-'
  const date = new Date(createdAt)
  if (Number.isNaN(date.getTime())) return '-'
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
    .format(date)
    .replace(/\s/g, '')
}

export function sortExerciseSessionMotions(
  motions: ExerciseSessionDetail['motions'],
): ExerciseSessionMotionResult[] {
  return [...motions].sort((a, b) => {
    if (a.routineOrder !== b.routineOrder) {
      return a.routineOrder - b.routineOrder
    }

    return a.id - b.id
  })
}

export function buildExerciseSessionReportSummary(
  sessions: ExerciseSessionSummary[],
): ExerciseSessionReportSummary {
  if (!sessions.length) {
    return {
      totalSessionCount: 0,
      totalDurationSec: 0,
      averageCompletionRate: null,
      totalCompletedMotionCount: 0,
      latestSessionAt: null,
      exerciseTypeCounts: {},
    }
  }

  const totalDurationSec = sessions.reduce((sum, session) => sum + (session.durationSec ?? 0), 0)
  const totalCompletedMotionCount = sessions.reduce(
    (sum, session) => sum + (session.completedMotionCount ?? 0),
    0,
  )
  const completionRateValues = sessions
    .map(session => session.averageAccuracy)
    .filter((value): value is number => typeof value === 'number' && !Number.isNaN(value))
  const averageCompletionRate =
    completionRateValues.length > 0
      ? completionRateValues.reduce((sum, value) => sum + value, 0) / completionRateValues.length
      : null
  const latestSessionAt =
    [...sessions].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )[0]?.createdAt ?? null
  const exerciseTypeCounts = sessions.reduce<Record<string, number>>((acc, session) => {
    const type = session.exerciseType ?? 'UNKNOWN'
    acc[type] = (acc[type] ?? 0) + 1
    return acc
  }, {})

  return {
    totalSessionCount: sessions.length,
    totalDurationSec,
    averageCompletionRate,
    totalCompletedMotionCount,
    latestSessionAt,
    exerciseTypeCounts,
  }
}
