import { apiClient } from './client'
import type { ApiResponse } from './artworks'

export type Gender = 'MALE' | 'FEMALE' | 'OTHER'

export type PatientProfileCreateRequest = {
  name: string
  nickname: string
  birthDate: string
  gender: Gender
}

export type PatientProfileUpdateRequest = Partial<{
  name: string
  nickname: string
  birthDate: string
  gender: Gender
}>

export type PatientProfile = {
  id: number
  name: string
  nickname: string
  birthDate: string
  gender: Gender
}

export async function createPatientProfile(request: PatientProfileCreateRequest) {
  const response = await apiClient.post<ApiResponse<PatientProfile>>('/patient-profiles', request)
  return response.data
}

export async function listPatientProfiles() {
  const response = await apiClient.get<ApiResponse<PatientProfile[]>>('/patient-profiles')
  return response.data
}

export async function updatePatientProfile(id: number, request: PatientProfileUpdateRequest) {
  const response = await apiClient.patch<ApiResponse<PatientProfile>>(
    `/patient-profiles/${id}`,
    request,
  )
  return response.data
}
