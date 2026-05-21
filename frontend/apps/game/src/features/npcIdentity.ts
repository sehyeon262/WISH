export type FrontNpcId =
  | 'nurse_bunny'
  | 'dain'
  | 'sleepy_sheep'
  | 'monkey_friend'
  | 'gardener_bear'
  | 'squirrel_friend'
  | 'lighthouse_keeper'

export type BackendNpcName =
  | 'JOEUN'
  | 'DAIN'
  | 'GEONBIN'
  | 'SEORIN'
  | 'JEONGHO'
  | 'SEHYEON'
  | 'YEONGCHEOL'

export interface NpcIdentity {
  npcId: FrontNpcId
  displayName: string
  backendNpcName: BackendNpcName
}

export const NPC_IDENTITY_MAP: Record<FrontNpcId, NpcIdentity> = {
  nurse_bunny: {
    npcId: 'nurse_bunny',
    displayName: '간호사 조은',
    backendNpcName: 'JOEUN',
  },
  dain: {
    npcId: 'dain',
    displayName: '다인',
    backendNpcName: 'DAIN',
  },
  sleepy_sheep: {
    npcId: 'sleepy_sheep',
    displayName: '건빈',
    backendNpcName: 'GEONBIN',
  },
  monkey_friend: {
    npcId: 'monkey_friend',
    displayName: '코몽',
    backendNpcName: 'SEORIN',
  },
  gardener_bear: {
    npcId: 'gardener_bear',
    displayName: '정호',
    backendNpcName: 'JEONGHO',
  },
  squirrel_friend: {
    npcId: 'squirrel_friend',
    displayName: '세현',
    backendNpcName: 'SEHYEON',
  },
  lighthouse_keeper: {
    npcId: 'lighthouse_keeper',
    displayName: '등대지기 영철',
    backendNpcName: 'YEONGCHEOL',
  },
}

export function getNpcIdentity(npcId: FrontNpcId): NpcIdentity {
  const identity = NPC_IDENTITY_MAP[npcId]

  if (!identity) {
    throw new Error(`Unknown npcId: ${npcId}`)
  }

  return identity
}
