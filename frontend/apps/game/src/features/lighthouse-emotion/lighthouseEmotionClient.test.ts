import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  chatWithLighthouseLlm,
  classifyLighthouseFreeInputSignal,
  getDialogueSessionDetail,
  LIGHTHOUSE_ENTRY_QUESTION,
  sanitizeEmotionScene,
  submitLighthouseChatTurn,
  submitLighthouseEmotionTurn,
} from './lighthouseEmotionClient'
import type { EmotionSceneViewModel } from './types'

function jsonResponse(body: unknown, ok = true) {
  return {
    ok,
    json: () => Promise.resolve(body),
  } as Response
}

describe('sanitizeEmotionScene', () => {
  it('keeps up to three display-safe choices and hides secondary actions', () => {
    const scene = sanitizeEmotionScene(
      {
        questionText: '무슨 얘기가 좋을까?',
        choices: [
          { choiceIntentId: 'talk_body', text: '몸 얘기' },
          { choiceIntentId: 'talk_peer', text: '친구나 학교 얘기' },
          { choiceIntentId: 'talk_worry', text: '걱정되는 얘기' },
          { choiceIntentId: 'extra_choice', text: '더 보기' },
        ],
        secondaryAction: { choiceIntentId: 'rest_today', text: '오늘은 쉴래요' },
        shouldEndSession: false,
        generatedBy: 'CLAUDE',
        reasonCode: 'internal_reason',
      },
      true,
    )

    expect(scene.choices.map(choice => choice.choiceIntentId)).toEqual([
      'talk_body',
      'talk_peer',
      'talk_worry',
    ])
    expect(scene.secondaryAction).toBeNull()
    expect(scene.generatedBy).toBe('CLAUDE')
    expect(scene.reasonCode).toBeUndefined()
  })

  it('uses the lighthouse entry fallback when backend text is empty', () => {
    const scene = sanitizeEmotionScene(
      {
        questionText: '',
        choices: [],
        secondaryAction: null,
        shouldEndSession: false,
      },
      true,
    )

    expect(scene.questionText).toBe(LIGHTHOUSE_ENTRY_QUESTION)
    expect(scene.choices.map(choice => choice.choiceIntentId)).toEqual([
      'entry_rest',
      'entry_activity',
      'entry_talk',
    ])
  })
})

describe('getDialogueSessionDetail', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('requests dialogue session detail with auth and unwraps response data', async () => {
    localStorage.setItem('wish_access_token', 'token-1')
    const detail = {
      sessionId: 42,
      patientProfileId: 7,
      npcName: 'YEONGCHEOL',
      status: 'IN_PROGRESS',
      stepCount: 1,
      maxSteps: 5,
      finishReason: null,
      startedAt: '2026-05-10T13:51:02.586Z',
      endedAt: null,
      turns: [
        {
          id: 1,
          stepIndex: 0,
          questionText: LIGHTHOUSE_ENTRY_QUESTION,
          choiceIntentId: 'entry_talk',
          choiceText: '잠깐 얘기하고 싶어요',
          intensity: 0,
          concernFlags: [],
          protectiveFactors: ['support_seeking'],
          generatedBy: 'CLAUDE',
          createdAt: '2026-05-10T13:51:02.586Z',
        },
      ],
    }
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        code: 'OK',
        message: 'ok',
        data: detail,
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(getDialogueSessionDetail(42)).resolves.toEqual(detail)
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/v1\/dialogue\/sessions\/42$/),
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer token-1',
        },
      },
    )
  })

  it('throws when dialogue session detail data is missing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: null })))

    await expect(getDialogueSessionDetail(404)).rejects.toThrow(
      'Dialogue session detail response is invalid.',
    )
  })
})

describe('submitLighthouseEmotionTurn', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('submits a dialogue turn for response rewriting and unwraps npc response', async () => {
    localStorage.setItem('wish_access_token', 'token-1')
    const nextScene: EmotionSceneViewModel = {
      questionText: 'Backend flow is ignored by the hook',
      choices: [{ choiceIntentId: 'ignored', text: 'Ignored' }],
      secondaryAction: null,
      shouldEndSession: false,
      generatedBy: 'CLAUDE',
    }
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        code: 'OK',
        message: 'ok',
        data: {
          sessionId: 42,
          status: 'IN_PROGRESS',
          npcResponse: ['그래, 편한 얘기부터 골라보자.'],
          nextScene,
        },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      submitLighthouseEmotionTurn('42', {
        questionText: LIGHTHOUSE_ENTRY_QUESTION,
        route: 'talk_topic_01',
        historyIntentIds: ['entry_talk'],
        previousQuestionTexts: [LIGHTHOUSE_ENTRY_QUESTION],
        selectedChoice: {
          choiceIntentId: 'entry_talk',
          text: '잠깐 얘기하고 싶어요',
          intensity: 0,
          concernFlags: [],
          protectiveFactors: ['support_seeking', 'verbal_expression'],
        },
      }),
    ).resolves.toEqual({
      npcResponse: ['그래, 편한 얘기부터 골라보자.'],
      nextScene: sanitizeEmotionScene(nextScene, false),
    })

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/v1\/dialogue\/sessions\/42\/turns$/),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: 'Bearer token-1',
        },
        body: JSON.stringify({
          npcId: 'lighthouse_keeper',
          npcName: 'YEONGCHEOL',
          questionText: LIGHTHOUSE_ENTRY_QUESTION,
          selectedChoice: {
            choiceIntentId: 'entry_talk',
            text: '잠깐 얘기하고 싶어요',
            intensity: 0,
            concernFlags: [],
            protectiveFactors: ['support_seeking', 'verbal_expression'],
          },
          route: 'talk_topic_01',
          historyIntentIds: ['entry_talk'],
          previousQuestionTexts: [LIGHTHOUSE_ENTRY_QUESTION],
          dailyActivityState: undefined,
        }),
      },
    )
  })

  it('fills backend-required choice metadata when choice omits it', async () => {
    localStorage.setItem('wish_access_token', 'token-1')
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        code: 'OK',
        message: 'ok',
        data: {
          sessionId: 42,
          status: 'IN_PROGRESS',
          npcResponse: ['좋구나. 가볍게 시작해도 괜찮단다.'],
          nextScene: null,
        },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      submitLighthouseEmotionTurn('42', {
        questionText: LIGHTHOUSE_ENTRY_QUESTION,
        selectedChoice: {
          choiceIntentId: 'entry_activity',
          text: '뭔가 해보고 싶어요',
        },
      }),
    ).resolves.toEqual({
      npcResponse: ['좋구나. 가볍게 시작해도 괜찮단다.'],
      nextScene: sanitizeEmotionScene(null, true),
    })

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/v1\/dialogue\/sessions\/42\/turns$/),
      expect.objectContaining({
        body: JSON.stringify({
          npcId: 'lighthouse_keeper',
          npcName: 'YEONGCHEOL',
          questionText: LIGHTHOUSE_ENTRY_QUESTION,
          selectedChoice: {
            choiceIntentId: 'entry_activity',
            text: '뭔가 해보고 싶어요',
            intensity: 0,
            concernFlags: [],
            protectiveFactors: [],
          },
        }),
      }),
    )
  })
})

describe('chatWithLighthouseLlm', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('calls AI server /dialogue/chat with trimmed message and history', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        npc_message: '응, 그래서 어떤 마음이었어?',
        is_fallback: false,
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      chatWithLighthouseLlm(7, '  오늘은 조금 피곤해요  ', [
        { role: 'assistant', content: '오늘은 어떻게 지내고 싶니?' },
        { role: 'user', content: '괜찮아요' },
      ]),
    ).resolves.toEqual({
      npcMessage: '응, 그래서 어떤 마음이었어?',
      isFallback: false,
    })

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/dialogue\/chat$/),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          patient_profile_id: 7,
          user_message: '오늘은 조금 피곤해요',
          conversation_history: [
            { role: 'assistant', content: '오늘은 어떻게 지내고 싶니?' },
            { role: 'user', content: '괜찮아요' },
          ],
        }),
      }),
    )
  })

  it('throws when AI chat response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, false)))
    await expect(chatWithLighthouseLlm(7, '안녕', [])).rejects.toThrow(
      'Failed to chat with lighthouse LLM.',
    )
  })
})

describe('classifyLighthouseFreeInputSignal', () => {
  it('maps free text body discomfort into the same signal shape used by NPC choices', () => {
    expect(classifyLighthouseFreeInputSignal('My belly hurts and I feel dizzy')).toEqual({
      choiceIntentId: 'hard_body',
      intensity: 3,
      concernFlags: ['body_discomfort'],
      protectiveFactors: ['body_state_named', 'verbal_expression'],
    })
  })

  it('keeps neutral free text as verbal expression metadata', () => {
    expect(classifyLighthouseFreeInputSignal('I want to talk a little')).toEqual({
      choiceIntentId: 'entry_talk',
      intensity: 0,
      concernFlags: [],
      protectiveFactors: ['verbal_expression'],
    })
  })
})

describe('submitLighthouseChatTurn', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('persists the user/assistant pair with FREE_INPUT choice intent and signal metadata', async () => {
    localStorage.setItem('wish_access_token', 'token-1')
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { sessionId: 42 } }))
    vi.stubGlobal('fetch', fetchMock)

    await submitLighthouseChatTurn('42', {
      questionText: LIGHTHOUSE_ENTRY_QUESTION,
      userMessage: '오늘은 조금 피곤해요',
      npcResponseText: '응, 피곤한 날도 있지.',
      isFallback: false,
    })

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/v1\/dialogue\/sessions\/42\/turns$/),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer token-1' }),
        body: JSON.stringify({
          npcId: 'lighthouse_keeper',
          npcName: 'YEONGCHEOL',
          questionText: LIGHTHOUSE_ENTRY_QUESTION,
          selectedChoice: {
            choiceIntentId: 'FREE_INPUT',
            text: '오늘은 조금 피곤해요',
            intensity: 2,
            concernFlags: ['fatigue_present', 'body_discomfort'],
            protectiveFactors: ['body_state_named', 'rest_need_named', 'verbal_expression'],
          },
          route: 'free_input',
          npcResponseText: '응, 피곤한 날도 있지.',
          generatedBy: 'CLAUDE',
        }),
      }),
    )
  })

  it('marks generatedBy as FALLBACK when chat returned fallback flag', async () => {
    localStorage.setItem('wish_access_token', 'token-1')
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { sessionId: 42 } }))
    vi.stubGlobal('fetch', fetchMock)

    await submitLighthouseChatTurn('42', {
      questionText: '응, 그래?',
      userMessage: '음...',
      npcResponseText: '괜찮아. 천천히 말해도 된단다.',
      isFallback: true,
    })

    const calledBody = fetchMock.mock.calls[0]?.[1]?.body as string
    expect(JSON.parse(calledBody).generatedBy).toBe('FALLBACK')
  })

  it('throws when turn save response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, false)))
    await expect(
      submitLighthouseChatTurn('42', {
        questionText: 'Q',
        userMessage: 'U',
        npcResponseText: 'N',
        isFallback: false,
      }),
    ).rejects.toThrow('Failed to submit lighthouse chat turn.')
  })
})
