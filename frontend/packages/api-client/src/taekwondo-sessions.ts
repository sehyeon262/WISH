import type { AxiosInstance } from 'axios'
import { apiClient } from './client'
import type { ApiResponse, PageResponse } from './artworks'
import type { TaegeukAnalyzeResponse } from './taekwondo-ai'
import { listPatientProfiles } from './patient-profiles'
import type { Poomsae } from './taekwondo-motions'

const TAEKWONDO_SESSION_DETAIL_CONCURRENCY = 6

export type CreateTaekwondoSessionMotionRequest = {
  taekwondoMotionId: number
  durationSec: number
  accuracy: number
  completedReps: number
  feedback: string
  monstersDefeated: number
  videoKey?: string
  thumbKey?: string
}

export type CreateTaekwondoSessionRequest = {
  patientProfileId: number
  poomsae: Poomsae
}

export type BeltPromotionResponse = {
  fromBelt: string
  toBelt: string
}

export type TaekwondoSessionSummary = {
  id: number
  patientProfileId: number
  poomsae: Poomsae
  durationSec: number
  averageAccuracy: number
  completedMotionCount: number
  monstersDefeated: number
  createdAt: string
}

export type TaekwondoSessionMotionResult = {
  id: number
  taekwondoMotionId: number
  motionName: string
  routineOrder: number
  durationSec: number
  accuracy: number
  completedReps: number
  feedback: string
  videoUrl?: string | null
  thumbUrl?: string | null
  createdAt: string
}

export type TaekwondoSessionDetail = TaekwondoSessionSummary & {
  motions: TaekwondoSessionMotionResult[]
  beltPromotion?: BeltPromotionResponse | null
}

export type TaekwondoSessionMotionSaveResponse = {
  sessionId: number
  sessionDurationSec: number
  sessionAverageAccuracy: number
  sessionCompletedMotionCount: number
  sessionMonstersDefeated: number
  savedMotion: TaekwondoSessionMotionResult
  beltPromotion: BeltPromotionResponse | null
}

function clampTaekwondoAccuracy(value: number) {
  if (!Number.isFinite(value)) {
    return 0
  }

  return Math.max(0, Math.min(1, value))
}

function normalizeTaekwondoTargetReps(value: number) {
  if (!Number.isFinite(value)) {
    return 1
  }

  return Math.max(1, Math.trunc(value))
}

export function toTaekwondoAccuracy(score: number) {
  return clampTaekwondoAccuracy(score / 100)
}

const MAX_TAEKWONDO_FEEDBACK_LENGTH = 255
const TAEKWONDO_FEEDBACK_ELLIPSIS = '...'

function truncateTaekwondoFeedback(feedback: string) {
  const feedbackChars = Array.from(feedback)
  if (feedbackChars.length <= MAX_TAEKWONDO_FEEDBACK_LENGTH) {
    return feedback
  }

  return `${feedbackChars
    .slice(0, MAX_TAEKWONDO_FEEDBACK_LENGTH - TAEKWONDO_FEEDBACK_ELLIPSIS.length)
    .join('')}${TAEKWONDO_FEEDBACK_ELLIPSIS}`
}

export function formatTaekwondoAiFeedback(
  analysis: Pick<TaegeukAnalyzeResponse, 'weakest_body_part' | 'worst_joint' | 'feedback_summary'>,
  fallback = 'Taekwondo motion analysis completed.',
) {
  const summary = analysis.feedback_summary?.trim() || fallback
  const detailParts = [analysis.weakest_body_part, analysis.worst_joint]
    .map(part => part?.trim())
    .filter((part): part is string => Boolean(part))
  const prefix = detailParts.length > 0 ? `[${detailParts.join('/')}] ` : ''
  const feedback = `${prefix}${summary}`.trim()

  return truncateTaekwondoFeedback(feedback)
}

export type ToCreateTaekwondoSessionMotionRequestParams = {
  taekwondoMotionId: number
  durationSec: number
  targetReps: number
  analysis: TaegeukAnalyzeResponse | null | undefined
  feedbackFallback?: string
}

export function toCreateTaekwondoSessionMotionRequest({
  taekwondoMotionId,
  durationSec,
  targetReps,
  analysis,
  feedbackFallback,
}: ToCreateTaekwondoSessionMotionRequestParams): CreateTaekwondoSessionMotionRequest {
  const completedReps = analysis?.passed ? normalizeTaekwondoTargetReps(targetReps) : 0
  return {
    taekwondoMotionId,
    durationSec,
    accuracy: analysis ? toTaekwondoAccuracy(analysis.score) : 0,
    completedReps,
    monstersDefeated: completedReps > 0 ? 1 : 0,
    feedback: analysis
      ? formatTaekwondoAiFeedback(analysis, feedbackFallback)
      : feedbackFallback || 'Taekwondo motion analysis was not completed.',
  }
}

export async function createTaekwondoSession(
  payload: CreateTaekwondoSessionRequest,
  client: AxiosInstance = apiClient,
): Promise<TaekwondoSessionDetail> {
  const response = await client.post<ApiResponse<TaekwondoSessionDetail | null>>(
    '/taekwondo-sessions',
    payload,
    {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    },
  )

  const session = response.data.data
  if (!session) {
    throw new Error(response.data.message || 'Failed to save taekwondo session.')
  }

  return session
}

export async function createTaekwondoSessionMotion(
  sessionId: number,
  payload: CreateTaekwondoSessionMotionRequest,
  client: AxiosInstance = apiClient,
): Promise<TaekwondoSessionMotionSaveResponse> {
  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    throw new Error('태권도 세션 ID가 올바르지 않습니다.')
  }

  const response = await client.post<ApiResponse<TaekwondoSessionMotionSaveResponse | null>>(
    `/taekwondo-sessions/${sessionId}/motions`,
    payload,
    {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    },
  )

  const saved = response.data.data
  if (!saved) {
    throw new Error(response.data.message || 'Failed to save taekwondo motion.')
  }

  return saved
}

export type TaekwondoSessionPage = PageResponse<TaekwondoSessionDetail>

export type GetMyTaekwondoSessionsParams = {
  page?: number
  size?: number
  sort?: string
  poomsae?: Poomsae
  patientProfileId?: number
}

function assertValidPatientProfileId(patientProfileId: number) {
  if (!Number.isInteger(patientProfileId) || patientProfileId <= 0) {
    throw new Error('patientProfileId가 올바르지 않습니다.')
  }
}

function normalizeTaekwondoSessionPage(page: number | undefined): number {
  return Number.isInteger(page) && page != null && page >= 0 ? page : 0
}

function normalizeTaekwondoSessionPageSize(size: number | undefined): number {
  return Number.isInteger(size) && size != null && size > 0 ? size : 50
}

function sortTaekwondoSessionSummaries(
  sessions: TaekwondoSessionSummary[],
  sort = 'createdAt,desc',
): TaekwondoSessionSummary[] {
  const [field, rawDirection] = sort.split(',')
  if (field !== 'createdAt') return [...sessions]

  const direction = rawDirection?.toLowerCase() === 'asc' ? 1 : -1
  return [...sessions].sort((a, b) => {
    const left = new Date(a.createdAt).getTime()
    const right = new Date(b.createdAt).getTime()
    return (left - right) * direction
  })
}

function toTaekwondoSessionPage(
  content: TaekwondoSessionDetail[],
  totalElements: number,
  page: number,
  size: number,
): TaekwondoSessionPage {
  const totalPages = totalElements === 0 ? 0 : Math.ceil(totalElements / size)

  return {
    totalElements,
    totalPages,
    pageable: {
      unpaged: false,
      pageNumber: page,
      paged: true,
      pageSize: size,
      offset: page * size,
      sort: {
        unsorted: false,
        sorted: true,
        empty: false,
      },
    },
    numberOfElements: content.length,
    first: page === 0,
    last: totalPages === 0 || page >= totalPages - 1,
    size,
    content,
    number: page,
    sort: {
      unsorted: false,
      sorted: true,
      empty: false,
    },
    empty: content.length === 0,
  }
}

async function resolveMyTaekwondoSessionPatientProfileId(patientProfileId?: number) {
  if (patientProfileId !== undefined) {
    assertValidPatientProfileId(patientProfileId)
    return patientProfileId
  }

  const profiles = await listPatientProfiles()
  return profiles.data[0]?.id
}

async function fetchTaekwondoSessionDetails(
  sessions: TaekwondoSessionSummary[],
): Promise<TaekwondoSessionDetail[]> {
  const details: TaekwondoSessionDetail[] = []

  for (let index = 0; index < sessions.length; index += TAEKWONDO_SESSION_DETAIL_CONCURRENCY) {
    const chunk = sessions.slice(index, index + TAEKWONDO_SESSION_DETAIL_CONCURRENCY)
    details.push(
      ...(await Promise.all(chunk.map(session => getTaekwondoSessionDetail(session.id)))),
    )
  }

  return details
}

export async function getTaekwondoSessions(
  patientProfileId: number,
  client: AxiosInstance = apiClient,
): Promise<TaekwondoSessionSummary[]> {
  assertValidPatientProfileId(patientProfileId)

  const response = await client.get<ApiResponse<TaekwondoSessionSummary[] | null>>(
    '/taekwondo-sessions',
    {
      params: { patientProfileId },
      headers: { Accept: 'application/json' },
    },
  )
  return response.data.data ?? []
}

export async function getMyTaekwondoSessions({
  page = 0,
  size = 50,
  sort = 'createdAt,desc',
  poomsae,
  patientProfileId,
}: GetMyTaekwondoSessionsParams = {}) {
  const normalizedPage = normalizeTaekwondoSessionPage(page)
  const normalizedSize = normalizeTaekwondoSessionPageSize(size)
  const resolvedPatientProfileId = await resolveMyTaekwondoSessionPatientProfileId(patientProfileId)

  if (!resolvedPatientProfileId) {
    return {
      code: 'OK',
      message: 'ok',
      data: toTaekwondoSessionPage([], 0, normalizedPage, normalizedSize),
    } satisfies ApiResponse<TaekwondoSessionPage>
  }

  const sessions = await getTaekwondoSessions(resolvedPatientProfileId)
  const filtered = poomsae ? sessions.filter(session => session.poomsae === poomsae) : sessions
  const start = normalizedPage * normalizedSize
  const selected = sortTaekwondoSessionSummaries(filtered, sort).slice(
    start,
    start + normalizedSize,
  )
  const details = await fetchTaekwondoSessionDetails(selected)

  return {
    code: 'OK',
    message: 'ok',
    data: toTaekwondoSessionPage(details, filtered.length, normalizedPage, normalizedSize),
  } satisfies ApiResponse<TaekwondoSessionPage>
}

// 단건 상세 — list 응답엔 motion의 videoUrl 이 빈 채로 내려와서,
// 영상 재생용 presigned URL 을 받으려면 이걸 호출해야 한다.
// getExerciseSessionDetail 과 동일하게 ApiResponse 를 unwrap 해서 detail 만 반환.
export async function getTaekwondoSessionDetail(id: number): Promise<TaekwondoSessionDetail> {
  const response = await apiClient.get<ApiResponse<TaekwondoSessionDetail | null>>(
    `/taekwondo-sessions/${id}`,
  )
  const detail = response.data.data
  if (!detail) {
    throw new Error(response.data.message || 'Failed to load taekwondo session detail.')
  }
  return detail
}
