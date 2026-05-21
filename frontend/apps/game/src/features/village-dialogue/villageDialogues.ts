import type { VillagerDialogueScript, VillagerIdentity, VillagerNpcId } from './types'

export const VILLAGER_IDENTITIES: Record<VillagerNpcId, VillagerIdentity> = {
  nurse_bunny: {
    npcId: 'nurse_bunny',
    displayName: '간호사 조은',
    backendNpcName: 'JOEUN',
  },
  sleepy_sheep: {
    npcId: 'sleepy_sheep',
    displayName: '건빈',
    backendNpcName: 'GEONBIN',
  },
  gardener_bear: {
    npcId: 'gardener_bear',
    displayName: '정호',
    backendNpcName: 'JEONGHO',
  },
  monkey_friend: {
    npcId: 'monkey_friend',
    displayName: '코몽',
    backendNpcName: 'SEORIN',
  },
  squirrel_friend: {
    npcId: 'squirrel_friend',
    displayName: '세현',
    backendNpcName: 'SEHYEON',
  },
  dain: {
    npcId: 'dain',
    displayName: '다인',
    backendNpcName: 'DAIN',
  },
}

export const VILLAGER_FIRST_GREETING: Record<VillagerNpcId, string[]> = {
  nurse_bunny: ['안녕, 오늘 하루 어땠어?', '편한 자리에 앉아봐.'],
  sleepy_sheep: ['(하품) 으음... 안녕.', '푹신한 자리 찾아뒀어. 같이 쉴래?'],
  gardener_bear: ['안녕. 방금 새싹에 물을 줬어.', '꽃 옆에서 잠깐 쉴래?'],
  monkey_friend: ['우와, 기다리고 있었어!', '코몽이랑 뭐 하면서 놀까?'],
  squirrel_friend: ['안녕, 기다렸어.', '나무 밑그늘이 참 시원하지?'],
  dain: ['안녕! 마침 심심했어.', '우리 뭐 하면서 놀까?'],
}

export interface VillagerPersona {
  npcId: VillagerNpcId
  toneName: string
  description: string
  speakingRules: string[]
}

export const VILLAGER_PERSONAS: Record<VillagerNpcId, VillagerPersona> = {
  nurse_bunny: {
    npcId: 'nurse_bunny',
    toneName: '차분하고 믿음직한 간호사',
    description: '몸 상태를 안전하게 살피고, 말하거나 가리켜도 괜찮다고 알려주는 캐릭터.',
    speakingRules: [
      '너무 장난스럽지 않게 말한다.',
      '몸이 불편할 때는 혼자 참지 않아도 된다고 말한다.',
      '선생님, 가까운 사람, 손으로 가리키기 같은 실제 행동으로 연결한다.',
      '동화적 표현은 적게 사용하고 안정감을 우선한다.',
    ],
  },
  sleepy_sheep: {
    npcId: 'sleepy_sheep',
    toneName: '느긋하고 포근한 친구',
    description: '쉬어도 된다는 분위기를 만들어주는 캐릭터.',
    speakingRules: [
      '천천히, 쉬어가자, 잠깐 눈 감자 같은 표현을 사용한다.',
      '활동을 강요하지 않는다.',
      '부드럽고 느긋한 말투를 유지한다.',
    ],
  },
  gardener_bear: {
    npcId: 'gardener_bear',
    toneName: '묵직하고 다정한 정원사',
    description: '마음을 말이나 그림으로 천천히 꺼내도 된다고 도와주는 캐릭터.',
    speakingRules: [
      '서두르지 않아도 된다는 표현을 쓴다.',
      '작게 시작해도 괜찮다는 말을 자주 한다.',
      '씨앗, 새싹, 꽃 같은 표현을 짧게만 사용한다.',
    ],
  },
  monkey_friend: {
    npcId: 'monkey_friend',
    toneName: '장난기 있지만 공감 잘하는 친구',
    description: '아이와 같은 눈높이에서 무서움과 속상함을 받아주는 캐릭터.',
    speakingRules: [
      '코몽이도 그럴 때 있어 같은 자기공감 표현을 사용한다.',
      '너무 과장하지 않는다.',
      '무서운 주제를 더 무섭게 만들지 않는다.',
      '짧고 통통 튀는 말투를 쓴다.',
    ],
  },
  squirrel_friend: {
    npcId: 'squirrel_friend',
    toneName: '활발하지만 곁을 편하게 지켜주는 친구',
    description: '밝고 빠르게 다가오지만, 아이가 쉬고 싶을 때는 곁에서 자리를 지켜주는 캐릭터.',
    speakingRules: [
      '밝고 짧은 말투를 쓰되, 아이가 쉬고 싶어 하면 속도를 낮춘다.',
      '나무 그늘, 잠깐 쉬기 같은 공간감을 사용한다.',
      '걱정을 크게 만들지 않고 작게 나눠도 된다고 말한다.',
      '대화를 재촉하지 않는다.',
    ],
  },
  dain: {
    npcId: 'dain',
    toneName: '또래 친구 같은 다정한 친구',
    description: '친구, 학교, 마음 전하기 주제에서 자연스럽게 반응하는 캐릭터.',
    speakingRules: [
      '어른스럽게 설명하지 않는다.',
      '나도 그런 날 있어 같은 공감 표현을 사용한다.',
      '짧게 말해도 된다는 표현을 자연스럽게 쓴다.',
    ],
  },
}

export const villageDialogues: Record<VillagerNpcId, VillagerDialogueScript> = {
  nurse_bunny: {
    ...VILLAGER_IDENTITIES.nurse_bunny,
    theme: '몸을 안전하게 살피는 차분한 대화',
  },
  sleepy_sheep: {
    ...VILLAGER_IDENTITIES.sleepy_sheep,
    theme: '느긋한 휴식과 천천히 말하기',
  },
  gardener_bear: {
    ...VILLAGER_IDENTITIES.gardener_bear,
    theme: '작게 시작하는 마음 표현',
  },
  monkey_friend: {
    ...VILLAGER_IDENTITIES.monkey_friend,
    theme: '장난기 있는 공감과 도움 요청',
  },
  squirrel_friend: {
    ...VILLAGER_IDENTITIES.squirrel_friend,
    theme: '밝은 곁 지킴과 쉬어가는 대화',
  },
  dain: {
    ...VILLAGER_IDENTITIES.dain,
    theme: '또래 친구 같은 짧은 대화',
  },
}
