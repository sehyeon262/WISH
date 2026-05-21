import { apiClient } from './client'
import type { ApiResponse, PageResponse } from './artworks'

export type CreatePhotoBoothRequest = {
  frameId: string
  isPublic: boolean
}

export type UpdatePhotoBoothRequest = {
  isPublic?: boolean
}

export type PhotoBooth = {
  id: number
  frameId: string
  imageUrl: string
  thumbnailUrl?: string | null
  isPublic: boolean
  createdAt: string
  updatedAt: string
}

export type PublicPhotoBoothAuthor = {
  nickname: string
}

export type PublicPhotoBooth = {
  id: number
  frameId: string
  imageUrl: string
  thumbnailUrl?: string | null
  createdAt: string
  author: PublicPhotoBoothAuthor
}

export type CreatePhotoBoothParams = CreatePhotoBoothRequest & {
  image: Blob
  filename: string
  thumbnail?: Blob | null
  thumbnailFilename?: string
}

export type ListPhotoBoothParams = {
  page?: number
  size?: number
}

export type PhotoBoothPage = PageResponse<PhotoBooth>
export type PublicPhotoBoothPage = PageResponse<PublicPhotoBooth>

export async function createPhotoBooth({
  image,
  filename,
  thumbnail,
  thumbnailFilename,
  ...request
}: CreatePhotoBoothParams) {
  const formData = new FormData()
  formData.append('request', new Blob([JSON.stringify(request)], { type: 'application/json' }))
  formData.append('image', image, filename)
  if (thumbnail) {
    formData.append(
      'thumbnail',
      thumbnail,
      thumbnailFilename ?? filename.replace(/\.[^.]+$/, '.jpg'),
    )
  }

  const response = await apiClient.post<ApiResponse<PhotoBooth>>('/photo-booths', formData)
  return response.data
}

export async function getMyPhotoBooths({ page = 0, size = 12 }: ListPhotoBoothParams = {}) {
  const response = await apiClient.get<ApiResponse<PhotoBoothPage>>('/photo-booths/me', {
    params: { page, size },
  })
  return response.data
}

export async function getPublicPhotoBooths({ page = 0, size = 12 }: ListPhotoBoothParams = {}) {
  const response = await apiClient.get<ApiResponse<PublicPhotoBoothPage>>('/photo-booths/public', {
    params: { page, size },
  })
  return response.data
}

export async function getPhotoBooth(id: number) {
  const response = await apiClient.get<ApiResponse<PhotoBooth>>(`/photo-booths/${id}`)
  return response.data
}

export async function updatePhotoBooth(id: number, request: UpdatePhotoBoothRequest) {
  const response = await apiClient.patch<ApiResponse<PhotoBooth>>(`/photo-booths/${id}`, request)
  return response.data
}

export async function deletePhotoBooth(id: number) {
  await apiClient.delete(`/photo-booths/${id}`)
}
