import type { GuardianDialogueTurn } from '@wish/api-client'
import { describe, expect, it } from 'vitest'
import { toChatMessages } from './adapters'

function turn(overrides: Partial<GuardianDialogueTurn>): GuardianDialogueTurn {
  return {
    id: 1,
    stepIndex: 0,
    questionText: '오늘 기분은 어떠니?',
    choiceIntentId: 'FREE_INPUT',
    choiceText: '배가 아파요',
    npcResponseText: '배가 아픈 마음을 말해줘서 고마워.',
    intensity: 1,
    concernFlags: [],
    protectiveFactors: [],
    valence: null,
    tone: null,
    topicKeywords: [],
    sentimentWords: [],
    generatedBy: 'FALLBACK',
    createdAt: '2026-05-20T00:00:00',
    ...overrides,
  }
}

describe('toChatMessages', () => {
  it('턴마다 아이 답변 뒤의 NPC 응답까지 말풍선으로 만든다', () => {
    const messages = toChatMessages([
      turn({
        id: 2,
        stepIndex: 1,
        questionText: '배가 아픈 마음을 말해줘서 고마워.',
        choiceText: '조금 어지러워요',
        npcResponseText: '어지러운 것도 함께 기억해둘게.',
      }),
      turn({
        id: 1,
        stepIndex: 0,
        questionText: '오늘 기분은 어떠니?',
        choiceText: '배가 아파요',
        npcResponseText: '배가 아픈 마음을 말해줘서 고마워.',
      }),
    ])

    expect(messages.map(message => message.parts.map(part => part.text).join(''))).toEqual([
      '오늘 기분은 어떠니?',
      '배가 아파요',
      '배가 아픈 마음을 말해줘서 고마워.',
      '조금 어지러워요',
      '어지러운 것도 함께 기억해둘게.',
    ])
    expect(messages.map(message => message.speaker)).toEqual([
      'character',
      'child',
      'character',
      'child',
      'character',
    ])
  })
})
