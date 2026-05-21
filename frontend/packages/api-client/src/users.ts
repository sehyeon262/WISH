import { apiClient } from './client'
import type { ApiResponse } from './artworks'
import type { UserResponse, UserRole } from './auth'

export type AdminUserResponse = {
  id: number
  email: string
  nickname: string
  role: UserRole
  createdAt: string
  patientProfileId: number | null
  patientName: string | null
  patientNickname: string | null
}

export async function listUsers() {
  const response = await apiClient.get<ApiResponse<AdminUserResponse[]>>('/users')
  return response.data
}

export async function changeUserRole(userId: number, role: UserRole) {
  const response = await apiClient.patch<ApiResponse<UserResponse>>(`/users/${userId}/role`, {
    role,
  })
  return response.data
}
