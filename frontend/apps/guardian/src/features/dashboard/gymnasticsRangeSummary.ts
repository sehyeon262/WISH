import type {
  ExerciseSessionDetail,
  ExerciseSessionMotionResult,
  ExerciseSessionSummary,
} from '@wish/api-client'

export type GymnasticsRangeStatus = 'new' | 'improved' | 'steady' | 'lower'

export type GymnasticsRangeSummaryItem = {
  motionResultId: number
  exerciseMotionId: number
  motionName: string
  routineOrder: number
  replayAvailable: boolean
  scoreAvailable: boolean
  currentPercent: number
  previousPercent: number | null
  deltaPercent: number | null
  completionRate: number
  completedCount: number
  targetCount: number
  progressLabel: string
  status: GymnasticsRangeStatus
}

export type GymnasticsRangeSummary = {
  sessionId: number
  exerciseType: string
  createdAt: string
  scoreAvailable: boolean
  averagePercent: number
  previousAveragePercent: number | null
  averageDeltaPercent: number | null
  improvedMotionCount: number
  decreasedMotionCount: number
  items: GymnasticsRangeSummaryItem[]
}

const TOP_TARGET_COUNT = 8
const DELTA_STEADY_THRESHOLD = 1

export function isGymnasticsSession(
  session: Pick<ExerciseSessionSummary, 'exerciseType'>,
): boolean {
  return session.exerciseType === 'TOP' || session.exerciseType === 'DANIEL'
}

function clampRate(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

function roundPercent(rate: number): number {
  return Math.round(clampRate(rate) * 100)
}

function average(values: number[]): number {
  if (values.length === 0) return 0
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
}

function normalizeCompletedCount(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, value)
}

function isSessionRecordOnly(exerciseType: string): boolean {
  return exerciseType === 'DANIEL'
}

function resolveTargetCount(exerciseType: string, motion: ExerciseSessionMotionResult): number {
  if (exerciseType === 'TOP') {
    return TOP_TARGET_COUNT
  }

  if (exerciseType === 'DANIEL') {
    return 0
  }

  return Math.max(1, Math.ceil(normalizeCompletedCount(motion.completedReps)))
}

function resolveRangeRate(exerciseType: string, motion: ExerciseSessionMotionResult): number {
  const targetCount = resolveTargetCount(exerciseType, motion)
  if (targetCount > 0) {
    // Guardian summary avoids noisy accuracy scores and uses completed reps for TOP motions.
    return clampRate(normalizeCompletedCount(motion.completedReps) / targetCount)
  }

  return clampRate(motion.accuracy)
}

function resolveProgressLabel(exerciseType: string, motion: ExerciseSessionMotionResult): string {
  if (exerciseType === 'DANIEL') {
    const durationSec = Math.max(0, Math.round(motion.durationSec))
    return durationSec > 0 ? `${durationSec}초 세션` : '10초 세션'
  }

  const completedCount = normalizeCompletedCount(motion.completedReps)
  const targetCount = resolveTargetCount(exerciseType, motion)
  return `${completedCount}/${targetCount}회`
}

function resolveStatus(deltaPercent: number | null): GymnasticsRangeStatus {
  if (deltaPercent === null) return 'new'
  if (deltaPercent > DELTA_STEADY_THRESHOLD) return 'improved'
  if (deltaPercent < -DELTA_STEADY_THRESHOLD) return 'lower'
  return 'steady'
}

export function buildGymnasticsRangeSummary(
  current: ExerciseSessionDetail,
  previous?: ExerciseSessionDetail | null,
): GymnasticsRangeSummary {
  const previousByMotionId = new Map(
    previous?.motions.map(motion => [motion.exerciseMotionId, motion]) ?? [],
  )

  const items = [...current.motions]
    .sort((a, b) => a.routineOrder - b.routineOrder)
    .map(motion => {
      const scoreAvailable = !isSessionRecordOnly(current.exerciseType)
      const currentPercent = scoreAvailable
        ? roundPercent(resolveRangeRate(current.exerciseType, motion))
        : 0
      const previousMotion = previousByMotionId.get(motion.exerciseMotionId)
      const previousPercent =
        scoreAvailable && previous && previousMotion
          ? roundPercent(resolveRangeRate(previous.exerciseType, previousMotion))
          : null
      const deltaPercent = previousPercent === null ? null : currentPercent - previousPercent
      const completedCount = normalizeCompletedCount(motion.completedReps)
      const targetCount = resolveTargetCount(current.exerciseType, motion)

      return {
        motionResultId: motion.id,
        exerciseMotionId: motion.exerciseMotionId,
        motionName: motion.motionName,
        routineOrder: motion.routineOrder,
        replayAvailable: motion.replayAvailable === true,
        scoreAvailable,
        currentPercent,
        previousPercent,
        deltaPercent,
        completionRate: clampRate(motion.accuracy),
        completedCount,
        targetCount,
        progressLabel: resolveProgressLabel(current.exerciseType, motion),
        status: resolveStatus(deltaPercent),
      }
    })

  const scoreItems = items.filter(item => item.scoreAvailable)
  const averagePercent = average(scoreItems.map(item => item.currentPercent))
  const previousValues = items
    .map(item => item.previousPercent)
    .filter((value): value is number => value !== null)
  const previousAveragePercent = previousValues.length > 0 ? average(previousValues) : null
  const averageDeltaPercent =
    previousAveragePercent === null ? null : averagePercent - previousAveragePercent

  return {
    sessionId: current.id,
    exerciseType: current.exerciseType,
    createdAt: current.createdAt,
    scoreAvailable: scoreItems.length > 0,
    averagePercent,
    previousAveragePercent,
    averageDeltaPercent,
    improvedMotionCount: items.filter(item => item.status === 'improved').length,
    decreasedMotionCount: items.filter(item => item.status === 'lower').length,
    items,
  }
}
