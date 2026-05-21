import { describe, expect, it } from 'vitest'
import {
  createEmotionCheckinAnalysis,
  generateEmotionSummary,
  sumEmotionWeights,
  type SelectedChoiceEvent,
} from './emotionAnalytics'

function event(
  overrides: Partial<SelectedChoiceEvent> & Pick<SelectedChoiceEvent, 'choiceId'>,
): SelectedChoiceEvent {
  return {
    sessionId: 'session-test',
    sceneId: 'lh_test',
    timestamp: 1,
    emotionWeights: {},
    intensity: 0,
    concernFlags: [],
    protectiveFactors: [],
    ...overrides,
  }
}

describe('emotionAnalytics', () => {
  it('stores only compact selected choice event data', () => {
    const analysis = createEmotionCheckinAnalysis('session-1', [
      event({
        choiceId: 'mood_worried',
        sceneId: 'lh_00_greeting_mood_check',
        emotionWeights: { anxietyFear: 2, informationNeed: 1 },
        intensity: 2,
        concernFlags: ['worry_present'],
        protectiveFactors: ['emotion_named'],
      }),
    ])

    expect(analysis.selectedChoiceEvents[0]).toMatchObject({
      sessionId: 'session-1',
      sceneId: 'lh_00_greeting_mood_check',
      choiceId: 'mood_worried',
      emotionWeights: { anxietyFear: 2, informationNeed: 1 },
      intensity: 2,
      concernFlags: ['worry_present'],
      protectiveFactors: ['emotion_named'],
    })
  })

  it('sums emotion weights across selected choices', () => {
    const totals = sumEmotionWeights([
      event({ choiceId: 'mood_worried', emotionWeights: { anxietyFear: 2 } }),
      event({ choiceId: 'worry_unknown', emotionWeights: { anxietyFear: 2, informationNeed: 2 } }),
    ])

    expect(totals).toEqual({ anxietyFear: 4, informationNeed: 2 })
  })

  it('raises a single intensity 3 choice to support recommended or above', () => {
    const summary = generateEmotionSummary('session-1', [
      event({
        choiceId: 'worry_pain',
        emotionWeights: { anxietyFear: 2, painSomatic: 2 },
        intensity: 3,
        concernFlags: ['pain_concern', 'procedure_fear'],
      }),
    ])

    expect(['support_recommended', 'clinical_review_recommended']).toContain(
      summary.distressSignalLevel,
    )
  })

  it('raises repeated intensity 3 choices to clinical review recommended', () => {
    const summary = generateEmotionSummary('session-1', [
      event({
        choiceId: 'worry_pain',
        emotionWeights: { anxietyFear: 2, painSomatic: 2 },
        intensity: 3,
        concernFlags: ['pain_concern'],
      }),
      event({
        choiceId: 'hard_body',
        emotionWeights: { painSomatic: 3 },
        intensity: 3,
        concernFlags: ['pain_concern', 'body_discomfort'],
      }),
    ])

    expect(summary.distressSignalLevel).toBe('clinical_review_recommended')
  })

  it('keeps child-facing reflection free of diagnostic, score, and risk wording', () => {
    const summary = generateEmotionSummary('session-1', [
      event({
        choiceId: 'hard_lonely',
        emotionWeights: { sadnessLoneliness: 3 },
        intensity: 3,
        concernFlags: ['loneliness', 'social_isolation'],
      }),
    ])

    expect(summary.childFacingReflection).not.toMatch(
      /우울|불안|진단|위험|등급|점수|환자 상태|support_recommended|clinical_review_recommended|watch|low/,
    )
  })

  it('records support seeking and agency coping as protective factors', () => {
    const summary = generateEmotionSummary('session-1', [
      event({
        choiceId: 'light_tell',
        emotionWeights: { supportSeeking: 3, agencyCoping: 1 },
        protectiveFactors: ['adult_support_plan'],
      }),
    ])

    expect(summary.distressSignalLevel).toBe('low')
    expect(summary.caregiverFacingNote).toContain('adult_support_plan')
  })
})
