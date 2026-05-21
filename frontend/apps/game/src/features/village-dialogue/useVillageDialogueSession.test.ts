import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./villageDialogueClient', () => ({
  startVillageDialogueSession: vi.fn(),
  submitVillageTurnCatalog: vi.fn(),
  finishVillageDialogueSession: vi.fn(),
  cancelVillagerDialogueSession: vi.fn(),
}))

import {
  cancelVillagerDialogueSession,
  finishVillageDialogueSession,
  startVillageDialogueSession,
  submitVillageTurnCatalog,
} from './villageDialogueClient'
import { useVillageDialogueSession } from './useVillageDialogueSession'

const startSpy = vi.mocked(startVillageDialogueSession)
const submitSpy = vi.mocked(submitVillageTurnCatalog)
const finishSpy = vi.mocked(finishVillageDialogueSession)
const cancelSpy = vi.mocked(cancelVillagerDialogueSession)

function makeScene(
  overrides: {
    questionText?: string
    choices?: Array<{ choiceIntentId: string; text: string }>
    npcResponse?: string[]
    shouldEndSession?: boolean
  } = {},
) {
  return {
    questionText: overrides.questionText ?? '오늘 좀 무서운 거 있어?',
    choices: overrides.choices ?? [
      { choiceIntentId: 'mky_inj_fear', text: '주사가 무서워요' },
      { choiceIntentId: 'mky_inj_okay', text: '괜찮아요' },
    ],
    secondaryAction: null,
    shouldEndSession: overrides.shouldEndSession ?? false,
    generatedBy: 'NPC_SCRIPT' as const,
    npcResponse: overrides.npcResponse ?? [],
  }
}

describe('useVillageDialogueSession (BE scene-driven)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('start → 첫 scene 의 질문/선택지가 화면에 적용되고 waiting_choice 상태가 된다', async () => {
    startSpy.mockResolvedValue({
      sessionId: 42,
      status: 'IN_PROGRESS',
      scene: makeScene(),
    })

    const { result } = renderHook(() => useVillageDialogueSession(7))

    await act(async () => {
      await result.current.startVillagerDialogue('monkey_friend')
    })

    expect(startSpy).toHaveBeenCalledWith(7, 'SEORIN')
    expect(result.current.sessionId).toBe(42)

    // queueTimer 가 applyScene 을 호출 + status_to_waiting 전환까지 진행
    await act(async () => {
      await vi.runAllTimersAsync()
    })

    expect(result.current.status).toBe('waiting_choice')
    expect(result.current.currentNode?.questionText).toBe('오늘 좀 무서운 거 있어?')
    expect(result.current.currentNode?.choices.map(c => c.choiceIntentId)).toEqual([
      'mky_inj_fear',
      'mky_inj_okay',
    ])
  })

  it('선택지 클릭 → BE 에 turn 제출 후 nextScene 적용', async () => {
    startSpy.mockResolvedValue({
      sessionId: 42,
      status: 'IN_PROGRESS',
      scene: makeScene(),
    })
    submitSpy.mockResolvedValue({
      nextScene: makeScene({
        questionText: '같이 손 잡고 갈까?',
        choices: [
          { choiceIntentId: 'mky_inj_hold_hand', text: '응 손 잡아줘' },
          { choiceIntentId: 'mky_inj_alone', text: '혼자 해볼래' },
        ],
        npcResponse: ['괜찮아, 함께 있어줄게.'],
      }),
    })

    const { result } = renderHook(() => useVillageDialogueSession(7))

    await act(async () => {
      await result.current.startVillagerDialogue('monkey_friend')
    })
    await act(async () => {
      await vi.runAllTimersAsync()
    })

    const firstChoice = result.current.currentNode!.choices[0]
    await act(async () => {
      await result.current.selectChoice(firstChoice)
    })

    expect(submitSpy).toHaveBeenCalledWith(
      42,
      'mky_inj_fear',
      '오늘 좀 무서운 거 있어?',
      '주사가 무서워요',
    )
    expect(result.current.selectedChoiceIntentId).toBe('mky_inj_fear')

    await act(async () => {
      await vi.runAllTimersAsync()
    })

    expect(result.current.status).toBe('waiting_choice')
    expect(result.current.currentNode?.questionText).toBe('같이 손 잡고 갈까?')
  })

  it('shouldEndSession=true scene → waiting_final_close 상태로 전환', async () => {
    startSpy.mockResolvedValue({
      sessionId: 42,
      status: 'IN_PROGRESS',
      scene: makeScene(),
    })
    submitSpy.mockResolvedValue({
      nextScene: makeScene({
        questionText: '',
        choices: [],
        npcResponse: ['오늘 얘기해줘서 고마워.', '잘 가, 또 보자.'],
        shouldEndSession: true,
      }),
    })

    const { result } = renderHook(() => useVillageDialogueSession(7))

    await act(async () => {
      await result.current.startVillagerDialogue('monkey_friend')
    })
    await act(async () => {
      await vi.runAllTimersAsync()
    })

    await act(async () => {
      await result.current.selectChoice(result.current.currentNode!.choices[0])
    })
    await act(async () => {
      await vi.runAllTimersAsync()
    })

    expect(result.current.status).toBe('waiting_final_close')
  })

  it('start 도중 API 가 실패하면 error 상태가 된다', async () => {
    startSpy.mockRejectedValue(new Error('boom'))

    const { result } = renderHook(() => useVillageDialogueSession(7))

    await act(async () => {
      await result.current.startVillagerDialogue('monkey_friend')
    })

    expect(result.current.status).toBe('error')
    expect(result.current.visibleLines.at(-1)).toContain('저장하지 못했어')
  })

  it('환자 프로필 ID 없이 startVillagerDialogue → API 호출 안 하고 error', async () => {
    const { result } = renderHook(() => useVillageDialogueSession(undefined))

    await act(async () => {
      await result.current.startVillagerDialogue('monkey_friend')
    })

    expect(startSpy).not.toHaveBeenCalled()
    expect(result.current.status).toBe('error')
  })

  it('cancelDialogue → 세션 cancel + finish 호출 후 idle 로 리셋', async () => {
    startSpy.mockResolvedValue({
      sessionId: 42,
      status: 'IN_PROGRESS',
      scene: makeScene(),
    })
    cancelSpy.mockResolvedValue()
    finishSpy.mockResolvedValue()

    const onFinished = vi.fn()
    const { result } = renderHook(() => useVillageDialogueSession(7, onFinished))

    await act(async () => {
      await result.current.startVillagerDialogue('monkey_friend')
    })
    await act(async () => {
      await vi.runAllTimersAsync()
    })

    act(() => {
      result.current.cancelDialogue()
    })

    expect(cancelSpy).toHaveBeenCalledWith(42)
    expect(finishSpy).toHaveBeenCalledWith(42, 'CANCELLED')
    expect(result.current.status).toBe('idle')
    expect(onFinished).toHaveBeenCalled()
  })
})
