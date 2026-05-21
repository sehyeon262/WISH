import { apiClient } from './client'
import type { ApiResponse, PageResponse } from './artworks'

export type GuardianDialogueNpc =
  | 'YEONGCHEOL'
  | 'JOEUN'
  | 'DAIN'
  | 'GEONBIN'
  | 'SEORIN'
  | 'JEONGHO'
  | 'SEHYEON'

export type GuardianDialogueSessionStatus = 'IN_PROGRESS' | 'FINISHED' | 'ABANDONED'

export type GuardianDialogueFinishReason = 'COMPLETED' | 'REST_TODAY' | 'TIMEOUT' | null

export type GuardianDialogueGeneratedBy = 'CLAUDE' | 'FALLBACK' | 'NPC_SCRIPT'

export type GuardianDialogueChoiceValence = 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE'
export type GuardianDialogueChoiceTone = 'CALM' | 'TIRED' | 'WORRIED'
export type GuardianDialogueSentimentTone = 'POSITIVE' | 'NEGATIVE'

export type GuardianDialogueSentimentWord = {
  phrase: string
  tone: GuardianDialogueSentimentTone
}

export type GuardianDialogueSessionMeta = {
  sessionId: number
  npcName: GuardianDialogueNpc
  status: GuardianDialogueSessionStatus
  stepCount: number
  maxSteps: number
  finishReason: GuardianDialogueFinishReason
  startedAt: string
  endedAt: string | null
  emotionValence: GuardianDialogueChoiceValence | null
  emotionTone: GuardianDialogueChoiceTone | null
  emotionIntensity: number | null
  guardianMessage: string | null
  emotionAnalyzedAt: string | null
  durationSeconds: number | null
}

export type GuardianDialogueTurn = {
  id: number
  stepIndex: number
  questionText: string
  choiceIntentId: string | null
  choiceText: string | null
  npcResponseText: string | null
  intensity: number | null
  concernFlags: string[]
  protectiveFactors: string[]
  valence: GuardianDialogueChoiceValence | null
  tone: GuardianDialogueChoiceTone | null
  topicKeywords: string[]
  sentimentWords: GuardianDialogueSentimentWord[]
  generatedBy: GuardianDialogueGeneratedBy
  createdAt: string
}

export type GuardianDialogueSessionDetail = GuardianDialogueSessionMeta & {
  patientProfileId: number
  emotionConcernFlags: string[]
  emotionProtectiveFactors: string[]
  turns: GuardianDialogueTurn[]
}

export type ListGuardianDialogueSessionsParams = {
  patientProfileId: number
  npc?: GuardianDialogueNpc
  from?: string
  to?: string
  page?: number
  size?: number
}

export async function listGuardianDialogueSessions({
  patientProfileId,
  npc,
  from,
  to,
  page = 0,
  size = 20,
}: ListGuardianDialogueSessionsParams) {
  const response = await apiClient.get<ApiResponse<PageResponse<GuardianDialogueSessionMeta>>>(
    `/guardian/patients/${patientProfileId}/dialogue/sessions`,
    {
      params: {
        ...(npc ? { npc } : {}),
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
        page,
        size,
        sort: 'startedAt,desc',
      },
    },
  )
  return response.data
}

export async function getGuardianDialogueSession(patientProfileId: number, sessionId: number) {
  const response = await apiClient.get<ApiResponse<GuardianDialogueSessionDetail>>(
    `/guardian/patients/${patientProfileId}/dialogue/sessions/${sessionId}`,
  )
  return response.data
}

// ===== Daily / Weekly summary (S14P31E103-813 / B4) =====

export type GuardianDialogueValenceDistribution = {
  positive: number
  neutral: number
  negative: number
}

export type GuardianDialogueSignalKind = 'CONCERN' | 'PROTECTIVE'

export type GuardianDialogueSignal = {
  kind: GuardianDialogueSignalKind
  flag: string
  label: string
  npc: string
}

export type GuardianNpcVisited = {
  npcName: string
  displayName: string
  scriptTitle: string | null
  sessionCount: number
}

export type GuardianDialogueDailySummary = {
  date: string
  summaryText: string
  valenceDistribution: GuardianDialogueValenceDistribution
  signals: GuardianDialogueSignal[]
  topics: string[]
  npcsVisited: GuardianNpcVisited[]
  recommendedActivity: string | null
  sessionCount: number
}

export type GuardianDialogueWeeklyTrendPoint = {
  date: string
  positiveNeutralPercent: number | null
  sessionCount: number
}

export type GuardianDialogueWeeklyTrend = {
  points: GuardianDialogueWeeklyTrendPoint[]
}

/**
 * 보호자 페이지의 "오늘 종합" 요약. 점수 미제공 — 응답 톤 분포(긍정/보통/부정 카운트) + 정성 요약 + 시그널 + 만난 NPC.
 *
 * @param date 조회 일자 (YYYY-MM-DD, KST). 미지정 시 오늘.
 */
export async function getGuardianDialogueDailySummary(
  patientProfileId: number,
  date?: string,
): Promise<GuardianDialogueDailySummary> {
  const response = await apiClient.get<ApiResponse<GuardianDialogueDailySummary>>(
    `/guardian/patients/${patientProfileId}/dialogue/summary/daily`,
    { params: date ? { date } : {} },
  )
  return response.data.data
}

/**
 * 보호자 페이지의 주간 응답 톤 변화. {@code endDate} 포함 직전 7일치 *긍정+보통 비율 %* — 점수가 아님.
 *
 * @param endDate 마지막 일자 (YYYY-MM-DD, KST). 미지정 시 오늘.
 */
export async function getGuardianDialogueWeeklyTrend(
  patientProfileId: number,
  endDate?: string,
): Promise<GuardianDialogueWeeklyTrend> {
  const response = await apiClient.get<ApiResponse<GuardianDialogueWeeklyTrend>>(
    `/guardian/patients/${patientProfileId}/dialogue/summary/weekly`,
    { params: endDate ? { endDate } : {} },
  )
  return response.data.data
}
