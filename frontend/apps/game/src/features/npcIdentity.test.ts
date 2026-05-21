import { describe, expect, it } from 'vitest'
import { getNpcIdentity, NPC_IDENTITY_MAP, type FrontNpcId } from './npcIdentity'

describe('NPC_IDENTITY_MAP', () => {
  it.each([
    ['nurse_bunny', '간호사 조은', 'JOEUN'],
    ['dain', '다인', 'DAIN'],
    ['sleepy_sheep', '건빈', 'GEONBIN'],
    ['monkey_friend', '코몽', 'SEORIN'],
    ['gardener_bear', '정호', 'JEONGHO'],
    ['squirrel_friend', '세현', 'SEHYEON'],
    ['lighthouse_keeper', '등대지기 영철', 'YEONGCHEOL'],
  ] satisfies Array<[FrontNpcId, string, string]>)(
    'maps %s to displayName and backend enum',
    (npcId, displayName, backendNpcName) => {
      expect(getNpcIdentity(npcId)).toMatchObject({
        npcId,
        displayName,
        backendNpcName,
      })
    },
  )

  it('keeps monkey_friend persisted as backend SEORIN', () => {
    expect(NPC_IDENTITY_MAP.monkey_friend).toMatchObject({
      displayName: '코몽',
      backendNpcName: 'SEORIN',
    })
  })
})
