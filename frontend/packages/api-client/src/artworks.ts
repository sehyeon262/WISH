import { apiClient } from './client'

export type CreateArtworkRequest = {
  sketchCode: number | null
  playDurationSeconds: number
  isPublic: boolean
  colorCount: number
}

export type UpdateArtworkRequest = {
  title?: string
  isPublic?: boolean
  additionalPlayDurationSeconds?: number
  colorCount?: number
}

export type Artwork = {
  id: number
  sketchCode: number | string | null
  title?: string
  imageUrl: string
  playDurationSeconds: number
  isPublic: boolean
  colorCount?: number
  createdAt: string
  updatedAt: string
}

export type ApiResponse<T> = {
  code: string
  message: string
  data: T
  errors?: Record<string, string>
}

export type CreateArtworkParams = CreateArtworkRequest & {
  image: Blob
  filename: string
}

export type UpdateArtworkParams = UpdateArtworkRequest & {
  id: number
  image?: Blob
  filename?: string
}

export type PageSort = {
  unsorted: boolean
  sorted: boolean
  empty: boolean
}

export type Pageable = {
  unpaged: boolean
  pageNumber: number
  paged: boolean
  pageSize: number
  offset: number
  sort: PageSort
}

export type PageResponse<T> = {
  totalElements: number
  totalPages: number
  pageable: Pageable
  numberOfElements: number
  first: boolean
  last: boolean
  size: number
  content: T[]
  number: number
  sort: PageSort
  empty: boolean
}

export type ArtworkPage = PageResponse<Artwork>

export type GetMyArtworksParams = {
  page?: number
  size?: number
  sort?: string
}

export async function createArtwork({ image, filename, ...request }: CreateArtworkParams) {
  const formData = new FormData()
  formData.append('request', new Blob([JSON.stringify(request)], { type: 'application/json' }))
  formData.append('image', image, filename)

  const response = await apiClient.post<ApiResponse<Artwork>>('/artworks', formData)
  return response.data
}

export type DrawingGuessRequest = {
  prompt: string
  image: Blob
  filename: string
}

export type DrawingGuessResult = {
  isMatch: boolean
  guess: string
  confidence: number
  source: 'CLAUDE' | 'FALLBACK'
}

export async function submitDrawingGuess({ prompt, image, filename }: DrawingGuessRequest) {
  const formData = new FormData()
  formData.append('request', new Blob([JSON.stringify({ prompt })], { type: 'application/json' }))
  formData.append('image', image, filename)

  const response = await apiClient.post<ApiResponse<DrawingGuessResult>>(
    '/artworks/guess',
    formData,
  )
  return response.data
}

export async function getMyArtworks({
  page = 0,
  size = 4,
  sort = 'createdAt,desc',
}: GetMyArtworksParams = {}) {
  const response = await apiClient.get<ApiResponse<ArtworkPage>>('/artworks/me', {
    params: { page, size, sort },
  })
  return response.data
}

export async function getArtwork(id: number) {
  const response = await apiClient.get<ApiResponse<Artwork>>(`/artworks/${id}`)
  return response.data
}

export async function updateArtwork({ id, image, filename, ...request }: UpdateArtworkParams) {
  const formData = new FormData()
  formData.append('request', new Blob([JSON.stringify(request)], { type: 'application/json' }))

  if (image) {
    formData.append('image', image, filename ?? `artwork-${id}.png`)
  }

  const response = await apiClient.patch<ApiResponse<Artwork>>(`/artworks/${id}`, formData)
  return response.data
}

export async function deleteArtwork(id: number) {
  await apiClient.delete(`/artworks/${id}`)
}
