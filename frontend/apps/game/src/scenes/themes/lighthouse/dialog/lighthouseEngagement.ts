export type LighthouseChoiceId =
  | 'mood_okay'
  | 'mood_worried'
  | 'mood_hard'
  | 'global_rest_today'
  | string

export type LighthouseMicroFeedback = {
  animationKey:
    | 'lighthouse_warm_pulse'
    | 'lighthouse_fog_pulse'
    | 'lighthouse_wave_pulse'
    | 'lighthouse_calm_pulse'
  environmentEffect: 'soft_sun_glimmer' | 'fog_soften' | 'wave_soften' | 'calm_dim_light'
  childText: string
}

export type LighthouseCompanionReaction = {
  characterId: 'mong'
  reactionKey: 'small_happy_flap' | 'come_closer' | 'sit_quietly' | 'rest_together'
}

export type LighthouseNeutralReward = {
  id: 'daily_light_piece'
  displayName: string
  amount: 1
  giveOn: ReadonlyArray<'any_choice' | 'rest_choice' | 'session_complete'>
  childFacingText: string
  equalForAllEmotionChoices: true
  noStreakPenalty: true
}

export type LighthouseDecorReward = {
  id: string
  displayName: string
  spriteKey: string
}

export type LighthousePostcardConfig = {
  enabled: true
  title: string
  showScore: false
  showDiagnosis: false
  showRiskLevel: false
  closeOnBackdropClick: false
  allowEscClose: true
  focusFirstAction: true
  actions: ReadonlyArray<{
    id: 'save_postcard' | 'close_postcard'
    text: string
  }>
}

export type EmotionCheckinConfig = {
  showPostcardOnComplete: boolean
  hideDialogueBeforePostcard: true
  showCaregiverNoteOnPostcard: false
}

export type LighthouseMicroActivity = {
  title: string
  type: 'tap_or_auto_breath' | 'choose_one_sticker' | 'choose_phrase' | 'calm_close'
  durationSeconds?: number
  steps?: number
  childFacingTexts?: readonly string[]
  maxStickers?: number
  phrases?: readonly string[]
  skipAllowed: true
}

export type ChildComfortSettings = {
  reduceMotion: boolean
  allowSkipAnimations: true
  maxSessionSteps: 3
  maxChoicesPerScene: 3
  allowRestAnytime: true
  showLongText: false
  useSoundEffects: boolean
  allowMute: true
  hapticFeedback: false
}

export type EmotionCheckinEffectConfig = {
  enableEmotionSpecificEffects: false
  enableScreenShake: false
  enableFlash: false
  enableLargeScaleAnimation: false
  enableBackgroundWeatherChange: false
  enableCompanionReaction: false
  enableLighthousePulse: boolean
  lighthousePulseIntensity: 'subtle'
  choicePressDurationMs: 120
  choiceFadeOutDurationMs: 160
  respectReduceMotion: true
}

export type LighthousePlayEventType =
  | 'choice_selected'
  | 'micro_feedback_played'
  | 'neutral_reward_given'
  | 'postcard_shown'
  | 'postcard_saved'
  | 'micro_activity_started'
  | 'micro_activity_completed'
  | 'micro_activity_skipped'

export type LighthousePlayEvent = {
  sessionId: string
  eventType: LighthousePlayEventType
  timestamp: number
  metadata?: Record<string, unknown>
}

export const emotionMicroFeedback: Record<string, LighthouseMicroFeedback> = {
  mood_okay: {
    animationKey: 'lighthouse_warm_pulse',
    environmentEffect: 'soft_sun_glimmer',
    childText: '\uC791\uC740 \uD587\uBE5B\uC774 \uBC18\uC9DD\uC600\uC5B4\uC694.',
  },
  mood_worried: {
    animationKey: 'lighthouse_fog_pulse',
    environmentEffect: 'fog_soften',
    childText: '\uC548\uAC1C \uC18D\uC5D0 \uBD88\uBE5B\uC774 \uCF1C\uC84C\uC5B4\uC694.',
  },
  mood_hard: {
    animationKey: 'lighthouse_wave_pulse',
    environmentEffect: 'wave_soften',
    childText:
      '\uB192\uC740 \uD30C\uB3C4 \uC606\uC5D0 \uBD88\uBE5B\uC774 \uCF1C\uC84C\uC5B4\uC694.',
  },
  global_rest_today: {
    animationKey: 'lighthouse_calm_pulse',
    environmentEffect: 'calm_dim_light',
    childText: '\uB4F1\uB300 \uBD88\uC774 \uC870\uC6A9\uD788 \uCF1C\uC84C\uC5B4\uC694.',
  },
  rest_from_mood_check: {
    animationKey: 'lighthouse_calm_pulse',
    environmentEffect: 'calm_dim_light',
    childText: '\uB4F1\uB300 \uBD88\uC774 \uC870\uC6A9\uD788 \uCF1C\uC84C\uC5B4\uC694.',
  },
  rest_from_worry_source: {
    animationKey: 'lighthouse_calm_pulse',
    environmentEffect: 'calm_dim_light',
    childText: '\uB4F1\uB300 \uBD88\uC774 \uC870\uC6A9\uD788 \uCF1C\uC84C\uC5B4\uC694.',
  },
  rest_from_hard_part: {
    animationKey: 'lighthouse_calm_pulse',
    environmentEffect: 'calm_dim_light',
    childText: '\uB4F1\uB300 \uBD88\uC774 \uC870\uC6A9\uD788 \uCF1C\uC84C\uC5B4\uC694.',
  },
  rest_from_small_action: {
    animationKey: 'lighthouse_calm_pulse',
    environmentEffect: 'calm_dim_light',
    childText: '\uB4F1\uB300 \uBD88\uC774 \uC870\uC6A9\uD788 \uCF1C\uC84C\uC5B4\uC694.',
  },
  rest_from_support_choice: {
    animationKey: 'lighthouse_calm_pulse',
    environmentEffect: 'calm_dim_light',
    childText: '\uB4F1\uB300 \uBD88\uC774 \uC870\uC6A9\uD788 \uCF1C\uC84C\uC5B4\uC694.',
  },
}

export const companionReactionMap: Record<string, LighthouseCompanionReaction> = {
  mood_okay: { characterId: 'mong', reactionKey: 'small_happy_flap' },
  mood_worried: { characterId: 'mong', reactionKey: 'come_closer' },
  mood_hard: { characterId: 'mong', reactionKey: 'sit_quietly' },
  global_rest_today: { characterId: 'mong', reactionKey: 'rest_together' },
}

export const neutralCheckinReward: LighthouseNeutralReward = {
  id: 'daily_light_piece',
  displayName: '\uB4F1\uBD88 \uC870\uAC01',
  amount: 1,
  giveOn: ['any_choice', 'rest_choice', 'session_complete'],
  childFacingText: '\uC624\uB298\uC758 \uB4F1\uBD88 \uC870\uAC01\uC744 \uBC1D\uD614\uC5B4\uC694.',
  equalForAllEmotionChoices: true,
  noStreakPenalty: true,
}

export const lighthouseDecorRewards: LighthouseDecorReward[] = [
  { id: 'decor_shell', displayName: '\uC791\uC740 \uC870\uAC1C', spriteKey: 'decor_shell' },
  {
    id: 'decor_starlight',
    displayName: '\uBCC4\uBE5B \uC2A4\uD2F0\uCEE4',
    spriteKey: 'decor_starlight',
  },
  {
    id: 'decor_window_light',
    displayName: '\uCC3D\uBB38 \uBD88\uBE5B',
    spriteKey: 'decor_window_light',
  },
  { id: 'decor_flower', displayName: '\uC791\uC740 \uAF43', spriteKey: 'decor_flower' },
]

export const postcardConfig: LighthousePostcardConfig = {
  enabled: true,
  title: '\uC624\uB298\uC758 \uB9C8\uC74C \uC5FD\uC11C',
  showScore: false,
  showDiagnosis: false,
  showRiskLevel: false,
  closeOnBackdropClick: false,
  allowEscClose: true,
  focusFirstAction: true,
  actions: [
    { id: 'save_postcard', text: '\uAC04\uC9C1\uD558\uAE30' },
    { id: 'close_postcard', text: '\uB2EB\uAE30' },
  ],
}

export const emotionCheckinConfig: EmotionCheckinConfig = {
  showPostcardOnComplete: true,
  hideDialogueBeforePostcard: true,
  showCaregiverNoteOnPostcard: false,
}

export const microActivities: Record<string, LighthouseMicroActivity> = {
  action_breathe: {
    title: '\uC228\uC744 \uCC9C\uCC9C\uD788 \uC26C\uC5B4\uC694',
    type: 'tap_or_auto_breath',
    durationSeconds: 6,
    steps: 3,
    childFacingTexts: ['\uD558\uB098', '\uB458', '\uC14B'],
    skipAllowed: true,
  },
  action_draw: {
    title: '\uC2A4\uD2F0\uCEE4 \uD558\uB098 \uBD99\uC774\uAE30',
    type: 'choose_one_sticker',
    maxStickers: 3,
    skipAllowed: true,
  },
  action_tell: {
    title: '\uD55C\uB9C8\uB514 \uACE0\uB974\uAE30',
    type: 'choose_phrase',
    phrases: [
      '\uC624\uB298 \uB9C8\uC74C\uC774 \uBB34\uAC70\uC6CC\uC694',
      '\uC870\uAE08 \uAC71\uC815\uB3FC\uC694',
      '\uAC19\uC774 \uC788\uC5B4\uC918\uC694',
    ],
    skipAllowed: true,
  },
  global_rest_today: {
    title: '\uC624\uB298\uC740 \uC26C\uAE30',
    type: 'calm_close',
    durationSeconds: 3,
    skipAllowed: true,
  },
}

export const emotionCheckinEffectConfig: EmotionCheckinEffectConfig = {
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
}

export const childComfortSettings: ChildComfortSettings = {
  reduceMotion: false,
  allowSkipAnimations: true,
  maxSessionSteps: 3,
  maxChoicesPerScene: 3,
  allowRestAnytime: true,
  showLongText: false,
  useSoundEffects: true,
  allowMute: true,
  hapticFeedback: false,
}

export function getMicroFeedback(choiceId: string) {
  return emotionMicroFeedback[choiceId] ?? emotionMicroFeedback.mood_okay
}

export function getCompanionReaction(choiceId: string) {
  return companionReactionMap[choiceId] ?? companionReactionMap.mood_okay
}

export function getDecorRewardForSession(sessionId: string) {
  const seed = Array.from(sessionId).reduce((total, char) => total + char.charCodeAt(0), 0)
  return lighthouseDecorRewards[seed % lighthouseDecorRewards.length]
}

export function createLighthousePlayEvent(
  sessionId: string,
  eventType: LighthousePlayEventType,
  metadata?: Record<string, unknown>,
): LighthousePlayEvent {
  return {
    sessionId,
    eventType,
    timestamp: Date.now(),
    metadata,
  }
}
