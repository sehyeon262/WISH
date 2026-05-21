import type { EmotionTag, EmotionWeights, WaveMeterCard } from './lighthouseEmotionDialogue'

export type DistressSignalLevel =
  | 'low'
  | 'watch'
  | 'support_recommended'
  | 'clinical_review_recommended'

export type SelectedSupportPreference = 'family' | 'medical_staff' | 'draw_or_write' | 'unknown'

export type SelectedChoiceEvent = {
  sessionId?: string
  sceneId: string
  choiceId: string
  timestamp: number
  emotionWeights: EmotionWeights
  intensity: 0 | 1 | 2 | 3
  concernFlags: string[]
  protectiveFactors: string[]
}

export type EmotionSessionSummary = {
  sessionId: string
  topEmotions: EmotionTag[]
  distressSignalLevel: DistressSignalLevel
  childFacingReflection: string
  caregiverFacingNote: string
  selectedSupportPreference?: SelectedSupportPreference
}

export type EmotionCheckinAnalysis = {
  sessionId: string
  selectedChoiceEvents: SelectedChoiceEvent[]
  summary: EmotionSessionSummary
}

const RECENT_EVENT_LIMIT = 5

const clinicalReviewFlags = new Set([
  'pain_concern',
  'procedure_fear',
  'parent_concern',
  'body_discomfort',
  'fatigue_or_pain',
  'loneliness',
  'social_isolation',
  'avoidanceWithdrawal',
  'withdrawal',
  'ended_checkin',
])

const forbiddenChildTerms = [
  '우울',
  '불안',
  '진단',
  '위험',
  '등급',
  '점수',
  '환자 상태',
  'clinical_review_recommended',
  'support_recommended',
  'watch',
  'low',
]

export function createEmotionCheckinAnalysis(
  sessionId: string,
  events: SelectedChoiceEvent[],
  waveMeterCard?: WaveMeterCard,
): EmotionCheckinAnalysis {
  const eventsWithSession = events.map(event => ({ ...event, sessionId }))

  return {
    sessionId,
    selectedChoiceEvents: eventsWithSession,
    summary: generateEmotionSummary(sessionId, eventsWithSession, waveMeterCard),
  }
}

export function generateEmotionSummary(
  sessionId: string,
  events: SelectedChoiceEvent[],
  waveMeterCard?: WaveMeterCard,
): EmotionSessionSummary {
  const recentEvents = events.slice(-RECENT_EVENT_LIMIT)
  const emotionTotals = sumEmotionWeights(recentEvents)
  const topEmotions = getTopEmotions(emotionTotals)
  const highIntensityCount = recentEvents.filter(event => event.intensity === 3).length
  const hasIntensityTwo = recentEvents.some(event => event.intensity === 2)
  const hasRepeatedClinicalFlags = countRepeatedClinicalFlags(recentEvents) > 0

  let distressSignalLevel: DistressSignalLevel = 'low'

  if (highIntensityCount > 0) distressSignalLevel = 'support_recommended'
  if (hasIntensityTwo && distressSignalLevel === 'low') distressSignalLevel = 'watch'
  if (hasRepeatedClinicalFlags || highIntensityCount >= 2) {
    distressSignalLevel = 'clinical_review_recommended'
  }
  if (waveMeterCard?.distressSignalLevelHint === 'watch' && distressSignalLevel === 'low') {
    distressSignalLevel = 'watch'
  }
  if (
    waveMeterCard?.distressSignalLevelHint === 'support_recommended' &&
    distressSignalLevel !== 'clinical_review_recommended'
  ) {
    distressSignalLevel = 'support_recommended'
  }

  return {
    sessionId,
    topEmotions,
    distressSignalLevel,
    childFacingReflection: sanitizeChildReflection(buildChildFacingReflection(distressSignalLevel)),
    caregiverFacingNote: buildCaregiverFacingNote(distressSignalLevel, recentEvents, waveMeterCard),
    selectedSupportPreference: inferSupportPreference(recentEvents),
  }
}

export function sumEmotionWeights(events: SelectedChoiceEvent[]) {
  return events.reduce<EmotionWeights>((totals, event) => {
    Object.entries(event.emotionWeights).forEach(([tag, value]) => {
      totals[tag as EmotionTag] = (totals[tag as EmotionTag] ?? 0) + (value ?? 0)
    })
    return totals
  }, {})
}

function getTopEmotions(emotionTotals: EmotionWeights) {
  return Object.entries(emotionTotals)
    .filter((entry): entry is [EmotionTag, number] => Boolean(entry[1] && entry[1] > 0))
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([tag]) => tag)
}

function countRepeatedClinicalFlags(events: SelectedChoiceEvent[]) {
  const counts = new Map<string, number>()
  events.forEach(event => {
    event.concernFlags.forEach(flag => {
      const isAvoidanceSignal = flag.toLowerCase().includes('avoidance')
      if (!clinicalReviewFlags.has(flag) && !isAvoidanceSignal) return
      counts.set(flag, (counts.get(flag) ?? 0) + 1)
    })
  })
  return Array.from(counts.values()).filter(count => count >= 2).length
}

function inferSupportPreference(events: SelectedChoiceEvent[]): SelectedSupportPreference {
  const choiceIds = events.map(event => event.choiceId)
  if (choiceIds.includes('support_family')) return 'family'
  if (choiceIds.includes('support_medical')) return 'medical_staff'
  if (choiceIds.includes('support_draw') || choiceIds.includes('action_draw'))
    return 'draw_or_write'
  return 'unknown'
}

function buildChildFacingReflection(level: DistressSignalLevel) {
  switch (level) {
    case 'low':
      return '오늘은 작은 햇빛이 보였구나.'
    case 'watch':
      return '오늘은 안개가 조금 있었구나. 알아차린 것만으로도 좋아.'
    case 'support_recommended':
      return '오늘 파도가 조금 높았구나. 가까운 어른과 나누면 좋겠다.'
    case 'clinical_review_recommended':
      return '오늘 파도가 많이 높아 보였어. 혼자 있지 말고 가까운 어른과 함께하자.'
  }
}

function buildCaregiverFacingNote(
  level: DistressSignalLevel,
  events: SelectedChoiceEvent[],
  waveMeterCard?: WaveMeterCard,
) {
  const flags = Array.from(new Set(events.flatMap(event => event.concernFlags)))
  const factors = Array.from(new Set(events.flatMap(event => event.protectiveFactors)))
  const waveNote = waveMeterCard
    ? ` 마음 파도계 선택 경향: ${waveMeterCard.id}(${waveMeterCard.scoreRange.join('-')}).`
    : ''
  const detail = [
    flags.length ? ` 관찰된 선택 경향: ${flags.join(', ')}.` : '',
    factors.length ? ` 보호 요인: ${factors.join(', ')}.` : '',
    waveNote,
  ].join('')

  switch (level) {
    case 'low':
      return `아이가 안정 또는 대처 관련 선택을 주로 했습니다.${detail}`
    case 'watch':
      return `걱정 또는 정서 부담 신호가 일부 나타났습니다. 짧고 부담 없는 대화를 권장합니다.${detail}`
    case 'support_recommended':
      return `높은 정서 부담 선택이 나타났습니다. 아이가 선택한 방식에 따라 가족, 의료진, 그림/편지 등으로 표현을 돕는 것이 좋습니다.${detail}`
    case 'clinical_review_recommended':
      return `높은 정서 부담 신호가 반복되었습니다. 임상 전문가 또는 의료진 확인이 권장됩니다.${detail}`
  }
}

function sanitizeChildReflection(reflection: string) {
  return forbiddenChildTerms.reduce(
    (safeReflection, term) => safeReflection.replaceAll(term, '마음'),
    reflection,
  )
}
