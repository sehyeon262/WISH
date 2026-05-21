import { apiClient } from './client'
import type { ApiResponse } from './artworks'

export type ExerciseType = 'TOP' | 'DANIEL'

export type ExerciseMotion = {
  id: number
  exerciseType: ExerciseType
  name: string
  routineOrder: number
  targetReps: number
  description: string
  demoVideoUrl?: string | null
  thumbnailUrl?: string | null
  createdAt: string
  updatedAt: string
}

export type CreateExerciseMotionRequest = {
  exerciseType: ExerciseType
  name: string
  routineOrder: number
  targetReps: number
  description: string
}

export type UpdateExerciseMotionRequest = {
  name?: string
  routineOrder?: number
  targetReps?: number
  description?: string
  clearThumbnail?: boolean
  clearDemoVideo?: boolean
}

export type ExerciseMotionReorderRequest = {
  exerciseType: ExerciseType
  motionIds: number[]
}

export type CreateExerciseMotionParams = {
  request: CreateExerciseMotionRequest
  thumbnail?: File
  demoVideo?: File
}

export type UpdateExerciseMotionParams = {
  request: UpdateExerciseMotionRequest
  thumbnail?: File
  demoVideo?: File
}

export async function listExerciseMotions(exerciseType: ExerciseType) {
  const response = await apiClient.get<ApiResponse<ExerciseMotion[]>>('/exercise-motions', {
    params: { exerciseType },
  })
  return response.data
}

export async function getExerciseMotion(id: number) {
  const response = await apiClient.get<ApiResponse<ExerciseMotion>>(`/exercise-motions/${id}`)
  return response.data
}

export async function createExerciseMotion({
  request,
  thumbnail,
  demoVideo,
}: CreateExerciseMotionParams) {
  const formData = buildFormData(request, thumbnail, demoVideo)
  const response = await apiClient.post<ApiResponse<ExerciseMotion>>('/exercise-motions', formData)
  return response.data
}

export async function updateExerciseMotion(
  id: number,
  { request, thumbnail, demoVideo }: UpdateExerciseMotionParams,
) {
  const formData = buildFormData(request, thumbnail, demoVideo)
  const response = await apiClient.patch<ApiResponse<ExerciseMotion>>(
    `/exercise-motions/${id}`,
    formData,
  )
  return response.data
}

export async function reorderExerciseMotions(request: ExerciseMotionReorderRequest) {
  const response = await apiClient.patch<ApiResponse<ExerciseMotion[]>>(
    '/exercise-motions/reorder',
    request,
  )
  return response.data
}

export async function deleteExerciseMotion(id: number) {
  await apiClient.delete(`/exercise-motions/${id}`)
}

function buildFormData(request: object, thumbnail?: File, demoVideo?: File): FormData {
  const formData = new FormData()
  formData.append('request', new Blob([JSON.stringify(request)], { type: 'application/json' }))
  if (thumbnail) {
    formData.append('thumbnail', thumbnail, thumbnail.name)
  }
  if (demoVideo) {
    formData.append('demoVideo', demoVideo, demoVideo.name)
  }
  return formData
}
