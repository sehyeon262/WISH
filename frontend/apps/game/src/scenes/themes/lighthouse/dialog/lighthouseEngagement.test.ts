import { describe, expect, it } from 'vitest'
import {
  getSecondaryAction,
  getVisibleChoices,
  lighthouseShortEmotionDialogue,
} from './lighthouseEmotionDialogue'
import {
  childComfortSettings,
  createLighthousePlayEvent,
  emotionCheckinConfig,
  emotionCheckinEffectConfig,
  emotionMicroFeedback,
  getCompanionReaction,
  getDecorRewardForSession,
  lighthouseDecorRewards,
  microActivities,
  neutralCheckinReward,
  postcardConfig,
} from './lighthouseEngagement'

describe('lighthouse engagement layer', () => {
  it('adds neutral engagement to each player choice scene without changing question count', () => {
    const playerChoiceScenes = lighthouseShortEmotionDialogue.filter(
      scene => scene.mode === 'PLAYER_CHOICE',
    )

    expect(playerChoiceScenes).toHaveLength(5)
    playerChoiceScenes.forEach(scene => {
      expect(scene.engagement).toMatchObject({
        presentationType: 'emotion_card_select',
        afterChoiceFeedback: true,
        neutralRewardId: 'daily_light_piece',
        companionId: 'mong',
      })
      expect(getVisibleChoices(scene).length).toBeLessThanOrEqual(3)
    })
  })

  it('keeps the neutral light piece reward equal for every mood and rest choice', () => {
    const choiceIds = ['mood_okay', 'mood_worried', 'mood_hard', 'rest_from_mood_check']

    expect(neutralCheckinReward).toMatchObject({
      id: 'daily_light_piece',
      amount: 1,
      equalForAllEmotionChoices: true,
      noStreakPenalty: true,
    })
    expect(neutralCheckinReward.giveOn).toEqual(['any_choice', 'rest_choice', 'session_complete'])
    choiceIds.forEach(choiceId => {
      expect(emotionMicroFeedback[choiceId]).toBeDefined()
      expect(getCompanionReaction(choiceId).characterId).toBe('mong')
    })
  })

  it('keeps decor rewards independent from emotion choice ids', () => {
    expect(lighthouseDecorRewards).toHaveLength(4)
    expect(getDecorRewardForSession('session-a')).toBeDefined()
    expect(lighthouseDecorRewards.map(reward => reward.id).join(' ')).not.toMatch(
      /mood_okay|mood_worried|mood_hard|global_rest_today/,
    )
  })

  it('configures a safe postcard without score diagnosis or risk labels', () => {
    expect(postcardConfig).toMatchObject({
      enabled: true,
      showScore: false,
      showDiagnosis: false,
      showRiskLevel: false,
      closeOnBackdropClick: false,
      allowEscClose: true,
      focusFirstAction: true,
    })
    expect(postcardConfig.actions.map(action => action.text)).toEqual([
      '\uAC04\uC9C1\uD558\uAE30',
      '\uB2EB\uAE30',
    ])
    expect(emotionCheckinConfig).toMatchObject({
      showPostcardOnComplete: true,
      hideDialogueBeforePostcard: true,
      showCaregiverNoteOnPostcard: false,
    })
  })

  it('keeps micro activities short skippable and child-comfortable', () => {
    expect(childComfortSettings).toMatchObject({
      allowSkipAnimations: true,
      maxSessionSteps: 3,
      maxChoicesPerScene: 3,
      allowRestAnytime: true,
      showLongText: false,
      allowMute: true,
    })
    Object.values(microActivities).forEach(activity => {
      expect(activity.skipAllowed).toBe(true)
      expect(activity.durationSeconds ?? 1).toBeLessThanOrEqual(10)
    })
  })

  it('minimizes emotion-specific choice effects', () => {
    expect(emotionCheckinEffectConfig).toMatchObject({
      enableEmotionSpecificEffects: false,
      enableScreenShake: false,
      enableFlash: false,
      enableLargeScaleAnimation: false,
      enableBackgroundWeatherChange: false,
      enableCompanionReaction: false,
      enableLighthousePulse: true,
      lighthousePulseIntensity: 'subtle',
      choicePressDurationMs: 120,
      choiceFadeOutDurationMs: 160,
      respectReduceMotion: true,
    })
  })

  it('stores play engagement events separately from emotion analysis events', () => {
    const playEvent = createLighthousePlayEvent('session-1', 'neutral_reward_given', {
      rewardId: neutralCheckinReward.id,
    })

    expect(playEvent).toMatchObject({
      sessionId: 'session-1',
      eventType: 'neutral_reward_given',
    })
    expect(playEvent).not.toHaveProperty('emotionWeights')
    expect(playEvent).not.toHaveProperty('intensity')
    expect(playEvent).not.toHaveProperty('concernFlags')
  })

  it('keeps secondary rest actions reward-eligible and separate from primary choices', () => {
    lighthouseShortEmotionDialogue
      .filter(scene => scene.mode === 'PLAYER_CHOICE')
      .forEach(scene => {
        const restAction = getSecondaryAction(scene)
        expect(restAction?.text).toBe('오늘은 쉬고 싶어요')
        expect(restAction?.concernFlags).toContain('ended_checkin')
        expect(getVisibleChoices(scene).map(choice => choice.id)).not.toContain(restAction?.id)
      })
  })
})
