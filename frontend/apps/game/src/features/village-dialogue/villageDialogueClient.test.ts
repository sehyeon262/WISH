import { afterEach, describe, expect, it, vi } from 'vitest'
import { cancelVillagerDialogueSession, saveVillagerChoiceEvent } from './villageDialogueClient'
import type { VillagerChoiceEvent } from './types'

const baseEvent: VillagerChoiceEvent = {
  sessionId: '42',
  clientEventId: 'event-1',
  npcId: 'monkey_friend',
  displayName: 'Komong',
  npcName: 'SEORIN',
  sceneId: 'monkey_friend_01_move',
  nodeId: 'monkey_friend_01_move',
  questionText: 'What should we do?',
  choiceIntentId: 'monkey_move_little',
  choiceText: 'Move a little',
  intensity: 0,
  concernFlags: [],
  protectiveFactors: ['playful_coping', 'agency_coping'],
  generatedBy: 'STATIC',
  createdAt: '2026-05-11T00:00:00.000Z',
}

describe('saveVillagerChoiceEvent', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('stores displayName and backend npcName separately in localStorage', async () => {
    await saveVillagerChoiceEvent(baseEvent)

    const events = JSON.parse(localStorage.getItem('villager_dialogue_events') ?? '[]')
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      npcId: 'monkey_friend',
      displayName: 'Komong',
      npcName: 'SEORIN',
    })
  })

  it('sends backend enum npcName and nested choice metadata in backend mode payload', async () => {
    vi.stubEnv('VITE_VILLAGE_DIALOGUE_SAVE_MODE', 'backend')
    const fetchMock = vi.fn().mockResolvedValue({ ok: true } as Response)
    vi.stubGlobal('fetch', fetchMock)

    await saveVillagerChoiceEvent(baseEvent)

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/api/v1/dialogue/sessions/42/turns')
    expect(init).toMatchObject({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })
    expect(JSON.parse(init.body as string)).toMatchObject({
      clientEventId: 'event-1',
      npcId: 'monkey_friend',
      npcName: 'SEORIN',
      sceneId: 'monkey_friend_01_move',
      nodeId: 'monkey_friend_01_move',
      questionText: 'What should we do?',
      selectedChoice: {
        choiceIntentId: 'monkey_move_little',
        text: 'Move a little',
        intensity: 0,
        concernFlags: [],
        protectiveFactors: ['playful_coping', 'agency_coping'],
      },
      generatedBy: 'STATIC',
    })
  })

  it('stores cancelled session status locally', async () => {
    await cancelVillagerDialogueSession('session-1')

    const sessions = JSON.parse(localStorage.getItem('villager_dialogue_sessions') ?? '[]')
    expect(sessions[0]).toMatchObject({
      sessionId: 'session-1',
      status: 'CANCELLED',
    })
  })
})
