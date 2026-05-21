import { apiClient } from './client'
import type { ApiResponse, PageResponse } from './artworks'

export type MusicResultRequest = {
  chartId: string
  score: number
  maxCombo: number
  perfectCount: number
  greatCount?: number
  goodCount: number
  missCount: number
  totalNotes: number
  playedDurationMs: number
  videoKey?: string
  thumbKey?: string
}

export type MusicResult = {
  id: number
  chartId: string
  score: number
  maxCombo: number
  perfectCount: number
  greatCount?: number
  goodCount: number
  missCount: number
  totalNotes: number
  accuracy: number
  rank: string
  playedDurationMs: number
  playedAt: string
  videoKey: string | null
  thumbKey: string | null
  isNewBest: boolean
  previousBestScore: number | null
}

export type MusicResultDetail = {
  id: number
  chartId: string
  chartTitle: string
  score: number
  maxCombo: number
  perfectCount: number
  greatCount?: number
  goodCount: number
  missCount: number
  totalNotes: number
  accuracy: number
  rank: string
  playedDurationMs: number
  playedAt: string
  videoKey: string | null
  thumbKey: string | null
  videoUrl: string | null
  thumbUrl: string | null
}

export type ChartStats = {
  chartId: string
  averagePlayedDurationMs: number
  totalPlays: number
}

export type MusicBestResult = {
  chartId: string
  bestScore: number
  bestRank: string
  bestAccuracy: number
  playCount: number
  lastPlayedAt: string
}

export async function saveMusicResult(request: MusicResultRequest) {
  const response = await apiClient.post<ApiResponse<MusicResult>>('/music/results', request)
  return response.data
}

export async function getMusicResult(id: number) {
  const response = await apiClient.get<ApiResponse<MusicResultDetail>>(`/music/results/${id}`)
  return response.data
}

export async function getMyBestMusicResults() {
  const response = await apiClient.get<ApiResponse<MusicBestResult[]>>('/music/results/me/best')
  return response.data
}

export type MusicResultPage = PageResponse<MusicResultDetail>

export type GetMyMusicResultsParams = {
  page?: number
  size?: number
  sort?: string
}

export async function getMyMusicResults({
  page = 0,
  size = 50,
  sort = 'playedAt,desc',
}: GetMyMusicResultsParams = {}) {
  const response = await apiClient.get<ApiResponse<MusicResultPage>>('/music/results/me', {
    params: { page, size, sort },
  })
  return response.data
}

export async function getChartStats(chartId: string) {
  const response = await apiClient.get<ApiResponse<ChartStats>>(
    `/music/charts/${encodeURIComponent(chartId)}/stats`,
  )
  return response.data
}

export type MusicRankingEntry = {
  rank: number
  patientProfileId: number
  nickname: string
  score: number
  accuracy: number
  maxCombo: number
  rankGrade: string
  playedAt: string
  isMe: boolean
}

export type MusicMyRanking = {
  rank: number | null
  bestScore: number | null
  bestAccuracy: number | null
  bestMaxCombo: number | null
  bestRankGrade: string | null
  bestPlayedAt: string | null
}

export type MusicChartRanking = {
  chartId: string
  chartTitle: string
  totalPlayers: number
  entries: MusicRankingEntry[]
  me: MusicMyRanking
}

export async function getChartRanking(chartId: string, limit = 10) {
  const response = await apiClient.get<ApiResponse<MusicChartRanking>>(
    `/music/charts/${encodeURIComponent(chartId)}/ranking`,
    { params: { limit } },
  )
  return response.data
}
