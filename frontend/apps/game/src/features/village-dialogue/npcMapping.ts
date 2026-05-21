import type { VillagerNpcId } from './types'

export type VillageDialogueNpcEnum = 'JOEUN' | 'GEONBIN' | 'JEONGHO' | 'SEORIN' | 'SEHYEON' | 'DAIN'

export const VILLAGE_NPC_TO_API_ENUM: Record<VillagerNpcId, VillageDialogueNpcEnum> = {
  nurse_bunny: 'JOEUN',
  sleepy_sheep: 'GEONBIN',
  gardener_bear: 'JEONGHO',
  monkey_friend: 'SEORIN',
  squirrel_friend: 'SEHYEON',
  dain: 'DAIN',
}
