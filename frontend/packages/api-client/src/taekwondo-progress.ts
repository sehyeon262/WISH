import { apiClient } from './client'
import type { ApiResponse } from './artworks'
import type { TaekwondoBeltColor } from './taekwondo-belt-history'

export type TaekwondoProgressResponse = {
  currentBelt: TaekwondoBeltColor
  totalMonstersDefeated: number
  sessionCount: number
  averageAccuracy: number
  nextBelt: TaekwondoBeltColor | null
  monstersUntilNextPromotion: number | null
  lastPromotedAt: string | null
}

export async function getTaekwondoProgress(
  patientProfileId: number,
): Promise<TaekwondoProgressResponse | null> {
  if (!Number.isInteger(patientProfileId) || patientProfileId <= 0) {
    throw new Error('patientProfileId가 올바르지 않습니다.')
  }

  const response = await apiClient.get<ApiResponse<TaekwondoProgressResponse | null>>(
    '/taekwondo-progress',
    {
      params: { patientProfileId },
      headers: { Accept: 'application/json' },
    },
  )

  return response.data.data ?? null
}
