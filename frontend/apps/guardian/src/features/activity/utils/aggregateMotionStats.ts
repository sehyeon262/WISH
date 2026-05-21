import type { ExerciseSessionDetail, TaekwondoSessionDetail } from '@wish/api-client'

/**
 * motion-별 집계 통계.
 * - latestDurationSec: 가장 최근 수행 1회의 durationSec (사용자가 정한 "수행 시간" 의미)
 * - totalReps:        전체 세션 누적 completedReps 합 ("총" 연습 수)
 * - avgAccuracy:      전체 세션 정확도 평균 (0~1, "평균" 정확도)
 * - latestVideoUrl:   가장 최근 수행 영상 URL (BE `videoUrl` 컬럼 추가 후 채워짐)
 * - latestThumbUrl:   가장 최근 수행 영상 썸네일 URL
 * - latestPlayedAt:   가장 최근 수행 시각 (정렬용)
 * - sessionCount:     이 동작이 포함된 결과 개수
 */
export type MotionStats = {
  latestDurationSec: number
  totalReps: number
  avgAccuracy: number
  latestVideoUrl: string | null
  latestThumbUrl: string | null
  latestPlayedAt: string
  sessionCount: number
}

type AggregatableMotion = {
  motionId: number
  durationSec: number
  accuracy: number
  completedReps: number
  createdAt: string
  videoUrl: string | null
  thumbUrl: string | null
}

function aggregate(motions: AggregatableMotion[]): Record<number, MotionStats> {
  const grouped = new Map<number, AggregatableMotion[]>()
  for (const m of motions) {
    const arr = grouped.get(m.motionId)
    if (arr) arr.push(m)
    else grouped.set(m.motionId, [m])
  }

  const result: Record<number, MotionStats> = {}
  for (const [motionId, items] of grouped) {
    const sortedDesc = [...items].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    const latest = sortedDesc[0]
    const latestWithVideo = sortedDesc.find(item => Boolean(item.videoUrl)) ?? latest
    const totalReps = items.reduce((sum, m) => sum + m.completedReps, 0)
    const avgAccuracy = items.reduce((sum, m) => sum + m.accuracy, 0) / items.length

    result[motionId] = {
      latestDurationSec: latest.durationSec,
      totalReps,
      avgAccuracy,
      latestVideoUrl: latestWithVideo.videoUrl,
      latestThumbUrl: latestWithVideo.thumbUrl,
      latestPlayedAt: latest.createdAt,
      sessionCount: items.length,
    }
  }
  return result
}

// videoUrl/thumbUrl 필드는 BE 가 `MotionResult` 스키마에 추가한 뒤부터 채워짐 — 그 전엔 undefined.
// 타입 단언으로 안전하게 옵셔널 read.
type WithOptionalMediaUrls = { videoUrl?: string | null; thumbUrl?: string | null }

export function aggregateTaekwondoMotionStats(
  sessions: TaekwondoSessionDetail[],
): Record<number, MotionStats> {
  const motions = sessions.flatMap(session =>
    session.motions.map(m => ({
      motionId: m.taekwondoMotionId,
      durationSec: m.durationSec,
      accuracy: m.accuracy,
      completedReps: m.completedReps,
      createdAt: m.createdAt,
      videoUrl: (m as WithOptionalMediaUrls).videoUrl ?? null,
      thumbUrl: (m as WithOptionalMediaUrls).thumbUrl ?? null,
    })),
  )
  return aggregate(motions)
}

export function aggregateExerciseMotionStats(
  sessions: ExerciseSessionDetail[],
): Record<number, MotionStats> {
  const motions = sessions.flatMap(session =>
    session.motions.map(m => ({
      motionId: m.exerciseMotionId,
      durationSec: m.durationSec,
      accuracy: m.accuracy,
      completedReps: m.completedReps,
      createdAt: m.createdAt,
      videoUrl: (m as WithOptionalMediaUrls).videoUrl ?? null,
      thumbUrl: (m as WithOptionalMediaUrls).thumbUrl ?? null,
    })),
  )
  return aggregate(motions)
}
