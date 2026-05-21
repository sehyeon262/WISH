import { describe, expect, it } from 'vitest'
import {
  buildExerciseSessionReportSummary,
  formatCompletionRate,
  formatDateTime,
  formatDurationSec,
  formatExerciseType,
  sortExerciseSessionMotions,
} from './format'
import type { ExerciseSessionDetail, ExerciseSessionSummary } from '@wish/api-client'

const sessions: ExerciseSessionSummary[] = [
  {
    id: 1,
    patientProfileId: 1,
    exerciseType: 'TOP',
    durationSec: 200,
    averageAccuracy: 0.8,
    completedMotionCount: 12,
    createdAt: '2026-05-06T01:36:20.863Z',
  },
  {
    id: 2,
    patientProfileId: 1,
    exerciseType: 'DANIEL',
    durationSec: 100,
    averageAccuracy: 90,
    completedMotionCount: 8,
    createdAt: '2026-05-07T01:36:20.863Z',
  },
]

describe('exercise session formatters', () => {
  it('formats duration seconds as Korean minutes and seconds', () => {
    expect(formatDurationSec(200)).toBe('3\uBD84 20\uCD08')
    expect(formatDurationSec(120)).toBe('2\uBD84')
    expect(formatDurationSec(12)).toBe('12\uCD08')
    expect(formatDurationSec(0)).toBe('0\uCD08')
  })

  it('formats completion rate safely for 0-1 and 0-100 values', () => {
    expect(formatCompletionRate(0.82)).toBe('82%')
    expect(formatCompletionRate(82)).toBe('82%')
    expect(formatCompletionRate(null)).toBe('-')
  })

  it('formats exercise type and date labels', () => {
    expect(formatExerciseType('TOP')).toBe('\uC0C1\uCCB4')
    expect(formatExerciseType('UNKNOWN')).toBe('UNKNOWN')
    expect(formatDateTime('2026-05-06T01:36:20.863Z')).toContain('2026.')
  })

  it('sorts motion results by routine order and id fallback', () => {
    const motions: ExerciseSessionDetail['motions'] = [
      {
        id: 3,
        exerciseMotionId: 3,
        motionName: 'C',
        routineOrder: 2,
        durationSec: 10,
        accuracy: 0.8,
        completedReps: 3,
        feedback: '',
        createdAt: '2026-05-06T01:36:20.863Z',
      },
      {
        id: 1,
        exerciseMotionId: 1,
        motionName: 'A',
        routineOrder: 1,
        durationSec: 10,
        accuracy: 0.8,
        completedReps: 3,
        feedback: '',
        createdAt: '2026-05-06T01:36:20.863Z',
      },
      {
        id: 2,
        exerciseMotionId: 2,
        motionName: 'B',
        routineOrder: 1,
        durationSec: 10,
        accuracy: 0.8,
        completedReps: 3,
        feedback: '',
        createdAt: '2026-05-06T01:36:20.863Z',
      },
    ]

    expect(sortExerciseSessionMotions(motions).map(motion => motion.id)).toEqual([1, 2, 3])
  })

  it('builds report summary from session list', () => {
    expect(buildExerciseSessionReportSummary(sessions)).toEqual({
      totalSessionCount: 2,
      totalDurationSec: 300,
      averageCompletionRate: 45.4,
      totalCompletedMotionCount: 20,
      latestSessionAt: '2026-05-07T01:36:20.863Z',
      exerciseTypeCounts: {
        TOP: 1,
        DANIEL: 1,
      },
    })
  })

  it('builds empty report summary without treating empty data as an error', () => {
    expect(buildExerciseSessionReportSummary([])).toEqual({
      totalSessionCount: 0,
      totalDurationSec: 0,
      averageCompletionRate: null,
      totalCompletedMotionCount: 0,
      latestSessionAt: null,
      exerciseTypeCounts: {},
    })
  })
})
