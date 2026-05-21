import { getPublicPhotoBooths } from '@wish/api-client'
import { useQuery } from '@tanstack/react-query'

export const PUBLIC_PHOTO_BOOTHS_QUERY_KEY = 'publicPhotoBooths'

export function usePublicPhotoBooths({
  page = 0,
  size = 24,
  enabled = true,
}: { page?: number; size?: number; enabled?: boolean } = {}) {
  return useQuery({
    queryKey: [PUBLIC_PHOTO_BOOTHS_QUERY_KEY, page, size],
    queryFn: () => getPublicPhotoBooths({ page, size }),
    enabled,
    staleTime: 1000 * 30,
    retry: 1,
  })
}
