import axios from 'axios'
import { apiClient } from './client'
import type { ApiResponse } from './artworks'

export type UploadPurpose = 'MUSIC_RESULT' | 'GYMNASTICS_PERFORMANCE' | 'TAEKWONDO_PERFORMANCE'

export type PresignedUploadRequest = {
  videoContentType: string
  thumbContentType: string
  purpose?: UploadPurpose
}

export type PresignedUploadItem = {
  key: string
  putUrl: string
  method: string
  contentType: string
  expiresInSeconds: number
}

export type PresignedUploadResponse = {
  video: PresignedUploadItem
  thumb: PresignedUploadItem
}

export async function requestPresignedUploadUrls(request: PresignedUploadRequest) {
  const response = await apiClient.post<ApiResponse<PresignedUploadResponse>>(
    '/uploads/presigned',
    request,
  )
  return response.data
}

export async function uploadToPresignedUrl(item: PresignedUploadItem, body: Blob) {
  await axios.request({
    url: item.putUrl,
    method: item.method,
    data: body,
    headers: { 'Content-Type': item.contentType },
    transformRequest: [d => d],
  })
}
