import {
  createExerciseSession,
  getExerciseSessionDetail,
  getExerciseSessions,
  type CreateExerciseSessionRequest,
} from '@wish/api-client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

export const EXERCISE_SESSIONS_QUERY_KEY = 'exerciseSessions'
export const EXERCISE_SESSION_DETAIL_QUERY_KEY = 'exerciseSessionDetail'
export const EXERCISE_SESSION_REPORT_QUERY_KEY = 'exerciseSessionReport'

export function useExerciseSessions(patientProfileId?: number) {
  const enabled =
    typeof patientProfileId === 'number' &&
    Number.isInteger(patientProfileId) &&
    patientProfileId > 0

  return useQuery({
    queryKey: [EXERCISE_SESSIONS_QUERY_KEY, patientProfileId],
    queryFn: () => getExerciseSessions(patientProfileId!),
    enabled,
    staleTime: 1000 * 60,
    retry: 1,
    select: data => data ?? [],
  })
}

export function useExerciseSessionDetail(id?: number | null) {
  const enabled = typeof id === 'number' && Number.isInteger(id) && id > 0

  return useQuery({
    queryKey: [EXERCISE_SESSION_DETAIL_QUERY_KEY, id],
    queryFn: () => getExerciseSessionDetail(id!),
    enabled,
    staleTime: 1000 * 60,
    retry: 1,
  })
}

export function useCreateExerciseSession() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload: CreateExerciseSessionRequest) => createExerciseSession(payload),
    onSuccess: createdSession => {
      queryClient.invalidateQueries({
        queryKey: [EXERCISE_SESSIONS_QUERY_KEY, createdSession.patientProfileId],
      })
      queryClient.setQueryData(
        [EXERCISE_SESSION_DETAIL_QUERY_KEY, createdSession.id],
        createdSession,
      )
      queryClient.invalidateQueries({
        queryKey: [EXERCISE_SESSION_REPORT_QUERY_KEY, createdSession.patientProfileId],
      })
    },
  })
}
