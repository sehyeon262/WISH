import { apiClient } from './client'
import type { ApiResponse } from './artworks'

export const TAEKWONDO_BELT_COLORS = [
  'WHITE',
  'YELLOW',
  'ORANGE',
  'GREEN',
  'BLUE',
  'PURPLE',
  'BROWN',
  'RED',
  'BLACK',
] as const

export type TaekwondoBeltColor = (typeof TAEKWONDO_BELT_COLORS)[number]

export type TaekwondoBeltHistory = {
  id: number
  fromBelt: TaekwondoBeltColor | null
  toBelt: TaekwondoBeltColor
  triggeredSessionId: number
  promotedAt: string
}

export const DEFAULT_TAEKWONDO_BELT_COLOR: TaekwondoBeltColor = 'WHITE'

const TAEKWONDO_BELT_COLOR_SET = new Set<string>(TAEKWONDO_BELT_COLORS)

export function normalizeTaekwondoBeltColor(value: unknown): TaekwondoBeltColor | null {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.toUpperCase()
  return TAEKWONDO_BELT_COLOR_SET.has(normalized) ? (normalized as TaekwondoBeltColor) : null
}

export async function getTaekwondoBeltHistory(patientProfileId: number) {
  const response = await apiClient.get<ApiResponse<TaekwondoBeltHistory[]>>(
    '/taekwondo-belt-history',
    {
      params: { patientProfileId },
      headers: { Accept: 'application/json' },
    },
  )

  return response.data.data ?? []
}

export async function getLatestTaekwondoBeltColor(patientProfileId?: number) {
  if (!patientProfileId) {
    return DEFAULT_TAEKWONDO_BELT_COLOR
  }

  try {
    const history = await getTaekwondoBeltHistory(patientProfileId)
    return normalizeTaekwondoBeltColor(history[0]?.toBelt) ?? DEFAULT_TAEKWONDO_BELT_COLOR
  } catch {
    return DEFAULT_TAEKWONDO_BELT_COLOR
  }
}
