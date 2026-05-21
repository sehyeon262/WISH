import { describe, expect, it } from 'vitest'
import type { ExerciseSessionDetail } from '@wish/api-client'
import { buildGymnasticsRangeSummary, isGymnasticsSession } from './gymnasticsRangeSummary'

function session(
  overrides: Partial<ExerciseSessionDetail> = {},
  motions: ExerciseSessionDetail['motions'] = [],
): ExerciseSessionDetail {
  return {
    id: 1,
    patientProfileId: 10,
    exerciseType: 'TOP',
    durationSec: 60,
    averageAccuracy: 0.5,
    completedMotionCount: motions.length,
    createdAt: '2026-05-10T10:00:00Z',
    motions,
    ...overrides,
  }
}

function motion(
  exerciseMotionId: number,
  completedReps: number,
  accuracy = completedReps / 8,
): ExerciseSessionDetail['motions'][number] {
  return {
    id: exerciseMotionId,
    exerciseMotionId,
    motionName: `동작 ${exerciseMotionId}`,
    routineOrder: exerciseMotionId,
    durationSec: 10,
    accuracy,
    completedReps,
    feedback: '운동 완료',
    createdAt: '2026-05-10T10:00:00Z',
  }
}

describe('gymnasticsRangeSummary', () => {
  it('최근 세션과 이전 세션의 동작별 변화량을 계산한다', () => {
    const current = session({}, [motion(1, 8), motion(2, 6), motion(3, 2)])
    const previous = session({ id: 0, createdAt: '2026-05-09T10:00:00Z' }, [
      motion(1, 6),
      motion(2, 6),
      motion(3, 4),
    ])

    const summary = buildGymnasticsRangeSummary(current, previous)

    expect(summary.averagePercent).toBe(67)
    expect(summary.previousAveragePercent).toBe(67)
    expect(summary.averageDeltaPercent).toBe(0)
    expect(summary.improvedMotionCount).toBe(1)
    expect(summary.decreasedMotionCount).toBe(1)
    expect(summary.items.map(item => item.status)).toEqual(['improved', 'steady', 'lower'])
  })

  it('이전 세션이 없으면 신규 기록으로 표시한다', () => {
    const summary = buildGymnasticsRangeSummary(session({}, [motion(1, 4)]))

    expect(summary.previousAveragePercent).toBeNull()
    expect(summary.averageDeltaPercent).toBeNull()
    expect(summary.items[0]).toMatchObject({
      currentPercent: 50,
      previousPercent: null,
      deltaPercent: null,
      status: 'new',
    })
  })

  it('다니엘 세션은 완료율 점수가 아니라 세션 기록으로 요약한다', () => {
    const current = session({ exerciseType: 'DANIEL' }, [motion(6, 1, 0.2), motion(7, 0, 0)])

    const summary = buildGymnasticsRangeSummary(current)

    expect(summary.scoreAvailable).toBe(false)
    expect(summary.averagePercent).toBe(0)
    expect(summary.previousAveragePercent).toBeNull()
    expect(summary.averageDeltaPercent).toBeNull()
    expect(summary.items[0]).toMatchObject({
      scoreAvailable: false,
      currentPercent: 0,
      previousPercent: null,
      deltaPercent: null,
      completedCount: 1,
      targetCount: 0,
      progressLabel: '10초 세션',
    })
    expect(summary.items[1]).toMatchObject({
      scoreAvailable: false,
      currentPercent: 0,
      previousPercent: null,
      deltaPercent: null,
      completedCount: 0,
      targetCount: 0,
      progressLabel: '10초 세션',
    })
  })

  it('체조 세션만 필터링 대상으로 본다', () => {
    expect(isGymnasticsSession({ exerciseType: 'TOP' })).toBe(true)
    expect(isGymnasticsSession({ exerciseType: 'DANIEL' })).toBe(true)
    expect(isGymnasticsSession({ exerciseType: 'MUSIC' })).toBe(false)
  })
})
