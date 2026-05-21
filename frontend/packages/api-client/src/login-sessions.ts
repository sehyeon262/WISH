import { apiClient } from './client'
import type { ApiResponse } from './artworks'

export type LoginSession = {
  id: number
  patientProfileId: number
  startedAt: string
  lastHeartbeatAt: string
  endedAt: string | null
  durationSeconds: number
}

export type LoginSessionStartRequest = {
  patientProfileId: number
}

export async function startLoginSession(request: LoginSessionStartRequest) {
  const response = await apiClient.post<ApiResponse<LoginSession>>('/login-sessions', request)
  return response.data
}

export async function heartbeatLoginSession(id: number) {
  const response = await apiClient.patch<ApiResponse<LoginSession>>(
    `/login-sessions/${id}/heartbeat`,
  )
  return response.data
}

export async function endLoginSession(id: number) {
  const response = await apiClient.patch<ApiResponse<LoginSession>>(`/login-sessions/${id}/end`)
  return response.data
}
