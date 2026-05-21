import { apiClient } from './client'
import type { ApiResponse } from './artworks'

export type WeeklyReportAiSummary = {
  summary: string[]
  activityObservations: string[]
  emotionObservations: string[]
  connection: string | null
  suggestion: string
  isFallback: boolean
  // DEBUG (임시): fallback 원인 추적용. 운영 안정화 후 제거.
  debugReason?: string | null
  debugRaw?: string | null
}

/**
 * 보호자 페이지 주간 리포트 AI 요약 (S14P31E103-745).
 *
 * 월요일 `weekStart` 기준 그 주 활동/대화 데이터를 모아 AI 가 생성한 종합 코멘트 + 관찰 + 제안을 반환한다.
 * AI 호출 실패 시에도 `isFallback: true` 안전 응답이 내려가므로 리포트 화면 자체는 항상 노출된다.
 *
 * @param patientProfileId 환자 프로필 ID
 * @param weekStart 주 시작일 (YYYY-MM-DD, 반드시 월요일)
 */
export async function getReportAiSummary(
  patientProfileId: number,
  weekStart: string,
): Promise<WeeklyReportAiSummary> {
  const response = await apiClient.get<ApiResponse<WeeklyReportAiSummary>>(
    `/guardian/patients/${patientProfileId}/report/ai-summary`,
    {
      params: { weekStart },
      // Opus 호출은 20~40초 걸려서 전역 apiClient 의 10s timeout 으로는 못 받음.
      // BE 측 35s 와 맞춰 충분히 길게 둠 (BE 가 먼저 fallback 으로 응답하기 전에 axios 가 abort 되지 않도록).
      timeout: 60_000,
    },
  )
  return response.data.data
}
