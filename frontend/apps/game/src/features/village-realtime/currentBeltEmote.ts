import { getLatestTaekwondoBeltColor } from '@wish/api-client'

import { resolvePatientProfileIdOrFetch } from '@/features/exerciseSessions/patientProfile'

import { createVillageEmojisForBelt } from './types'
import type { VillageEmojiPaletteHandle } from './villageEmojiPalette'

export function syncCurrentBeltEmojiToPalette(palette: VillageEmojiPaletteHandle) {
  let disposed = false

  void resolvePatientProfileIdOrFetch()
    .then(patientProfileId => getLatestTaekwondoBeltColor(patientProfileId))
    .then(beltColor => {
      if (disposed) return
      palette.setEmojis(createVillageEmojisForBelt(beltColor))
    })
    .catch(error => {
      console.warn('[village-realtime] Failed to load current taekwondo belt emote.', error)
    })

  return () => {
    disposed = true
  }
}
