import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getReportAiSummary, type WeeklyReportAiSummary } from '@wish/api-client'
import type { WeekRange } from './data/types'
import { buildWeekRange } from './data/week'
import { useReportData } from './data/queries'

type UseReportOptions = {
  patientId: number | undefined
  patientName: string
}

export function useReport({ patientId, patientName }: UseReportOptions) {
  const week = useMemo<WeekRange>(() => buildWeekRange(), [])
  const { data, isLoading, isError } = useReportData({ patientId, patientName, week })
  return { week, data, isLoading, isError }
}

export const REPORT_AI_SUMMARY_QUERY_KEY = 'report-ai-summary'

/**
 * 보호자 주간 리포트 AI 요약 (S14P31E103-745).
 *
 * 진행 중인 주는 데이터가 계속 바뀌므로 `staleTime: 0` — 캐시는 짧게 유지하고 리포트 화면 진입 시마다 재요청.
 * Opus 호출 비용 고려해 staleTime 을 길게 가져갈 수도 있지만, 우선 정확성 우선. (서버 측 캐시는 v2 작업)
 *
 * 호출 실패 시에도 서버가 fallback 응답을 내려주므로 `useQuery` 에서 별도 retry 는 불필요 — 1회만 시도.
 */
export function useReportAiSummary(patientId: number | undefined, weekStart: string | undefined) {
  return useQuery<WeeklyReportAiSummary>({
    queryKey: [REPORT_AI_SUMMARY_QUERY_KEY, patientId, weekStart],
    queryFn: () => getReportAiSummary(patientId!, weekStart!),
    enabled: typeof patientId === 'number' && typeof weekStart === 'string',
    retry: false,
  })
}
