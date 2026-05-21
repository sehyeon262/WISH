import { apiClient } from './client'
import type { ApiResponse } from './artworks'

export type DailyUsageItem = {
  date: string
  login: number
  art: number
  music: number
  taekwondo: number
  gymnastics: number
}

export type DailyUsageStats = {
  patientId: number
  from: string
  to: string
  items: DailyUsageItem[]
}

export type CumulativeUsageStats = {
  patientId: number
  login: number
  art: number
  music: number
  taekwondo: number
  gymnastics: number
}

export type DailyUsageStatsParams = {
  from?: string
  to?: string
}

export type UsageAverage = {
  totalSeconds: number
  averageSeconds: number
}

export type ContentUsageAverage = UsageAverage & {
  contentType: 'ART' | 'MUSIC' | 'TAEKWONDO' | 'GYMNASTICS' | 'LOGIN'
  label: string
}

export type UsageAverages = {
  from: string
  to: string
  activePatients: number
  login: UsageAverage
  contentAverages: ContentUsageAverage[]
}

export type UsageAveragesParams = {
  from?: string
  to?: string
}

export type UsageRankingEntry = {
  rank: number
  patientProfileId: number
  nickname: string
  totalSeconds: number
}

export type UsageRankings = {
  from: string | null
  to: string
  rankings: UsageRankingEntry[]
}

export type UsageRankingsParams = {
  from?: string
  to?: string
}

export async function getDailyUsageStats(patientId: number, params: DailyUsageStatsParams = {}) {
  const response = await apiClient.get<ApiResponse<DailyUsageStats>>(
    `/patients/${patientId}/usage-stats/daily`,
    { params },
  )
  return response.data
}

export async function getCumulativeUsageStats(patientId: number) {
  const response = await apiClient.get<ApiResponse<CumulativeUsageStats>>(
    `/patients/${patientId}/usage-stats/cumulative`,
  )
  return response.data
}

export async function getUsageAverages(params: UsageAveragesParams = {}) {
  const response = await apiClient.get<ApiResponse<UsageAverages>>('/usage-stats/period-averages', {
    params,
  })
  return response.data
}

export async function getUsageRankings(params: UsageRankingsParams = {}) {
  const response = await apiClient.get<ApiResponse<UsageRankings>>('/usage-stats/period-rankings', {
    params,
  })
  return response.data
}
