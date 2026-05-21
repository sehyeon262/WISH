import { useQuery } from '@tanstack/react-query'
import {
  getCumulativeUsageStats,
  getDailyUsageStats,
  getMyArtworks,
  getMyExerciseSessions,
  getMyMusicResults,
  getMyTaekwondoSessions,
  getUsageAverages,
  getUsageRankings,
  type DailyUsageStatsParams,
  type GetMyArtworksParams,
  type GetMyExerciseSessionsParams,
  type GetMyMusicResultsParams,
  type GetMyTaekwondoSessionsParams,
  type UsageAveragesParams,
  type UsageRankingsParams,
} from '@wish/api-client'

export const USAGE_STATS_DAILY_QUERY_KEY = 'usage-stats-daily'
export const USAGE_STATS_CUMULATIVE_QUERY_KEY = 'usage-stats-cumulative'
export const USAGE_STATS_AVERAGES_QUERY_KEY = 'usage-stats-averages'
export const USAGE_STATS_RANKINGS_QUERY_KEY = 'usage-stats-rankings'
export const MY_ARTWORKS_QUERY_KEY = 'artworks-me'
export const MY_MUSIC_RESULTS_QUERY_KEY = 'music-results-me'
export const MY_TAEKWONDO_SESSIONS_QUERY_KEY = 'taekwondo-sessions-me'
export const MY_EXERCISE_SESSIONS_QUERY_KEY = 'exercise-sessions-me'

type PatientTaekwondoSessionsParams = Omit<GetMyTaekwondoSessionsParams, 'patientProfileId'>
type PatientExerciseSessionsParams = Omit<GetMyExerciseSessionsParams, 'patientProfileId'>

export function useUsageAverages(params: UsageAveragesParams = {}) {
  return useQuery({
    queryKey: [USAGE_STATS_AVERAGES_QUERY_KEY, params.from, params.to],
    queryFn: async () => {
      const response = await getUsageAverages(params)
      return response.data
    },
  })
}

export function useUsageRankings(params: UsageRankingsParams = {}) {
  return useQuery({
    queryKey: [USAGE_STATS_RANKINGS_QUERY_KEY, params.from, params.to],
    queryFn: async () => {
      const response = await getUsageRankings(params)
      return response.data
    },
  })
}

export function useDailyUsageStats(
  patientId: number | undefined,
  params: DailyUsageStatsParams = {},
) {
  return useQuery({
    queryKey: [USAGE_STATS_DAILY_QUERY_KEY, patientId, params.from, params.to],
    queryFn: async () => {
      const response = await getDailyUsageStats(patientId!, params)
      return response.data
    },
    enabled: typeof patientId === 'number' && patientId > 0,
  })
}

export function useCumulativeUsageStats(patientId: number | undefined) {
  return useQuery({
    queryKey: [USAGE_STATS_CUMULATIVE_QUERY_KEY, patientId],
    queryFn: async () => {
      const response = await getCumulativeUsageStats(patientId!)
      return response.data
    },
    enabled: typeof patientId === 'number' && patientId > 0,
  })
}

export function useMyArtworks(params: GetMyArtworksParams = {}) {
  return useQuery({
    queryKey: [MY_ARTWORKS_QUERY_KEY, params.page ?? 0, params.size ?? 20, params.sort],
    queryFn: async () => {
      const response = await getMyArtworks(params)
      return response.data
    },
  })
}

export function useMyMusicResults(params: GetMyMusicResultsParams = {}) {
  return useQuery({
    queryKey: [
      MY_MUSIC_RESULTS_QUERY_KEY,
      params.page ?? 0,
      params.size ?? 50,
      params.sort ?? 'playedAt,desc',
    ],
    queryFn: async () => {
      const response = await getMyMusicResults(params)
      return response.data
    },
  })
}

export function useMyTaekwondoSessions(
  patientId: number | undefined,
  params: PatientTaekwondoSessionsParams = {},
) {
  return useQuery({
    queryKey: [
      MY_TAEKWONDO_SESSIONS_QUERY_KEY,
      patientId,
      params.poomsae,
      params.page ?? 0,
      params.size ?? 50,
      params.sort ?? 'createdAt,desc',
    ],
    queryFn: async () => {
      const response = await getMyTaekwondoSessions({ ...params, patientProfileId: patientId })
      return response.data
    },
    enabled: typeof patientId === 'number' && Number.isInteger(patientId) && patientId > 0,
    retry: false,
  })
}

export function usePatientExerciseSessions(
  patientId: number | undefined,
  params: PatientExerciseSessionsParams = {},
) {
  return useQuery({
    queryKey: [
      MY_EXERCISE_SESSIONS_QUERY_KEY,
      patientId,
      params.exerciseType,
      params.page ?? 0,
      params.size ?? 50,
      params.sort ?? 'createdAt,desc',
    ],
    queryFn: async () => {
      const response = await getMyExerciseSessions({ ...params, patientProfileId: patientId })
      return response.data.content
    },
    enabled: typeof patientId === 'number' && Number.isInteger(patientId) && patientId > 0,
    retry: false,
  })
}
