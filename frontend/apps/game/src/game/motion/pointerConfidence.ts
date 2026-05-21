export type PointerConfidenceOptions = {
  minScore?: number
  maxScore?: number
  activeThreshold?: number
  mediumThreshold?: number
}

export type PointerConfidenceLevel = 'low' | 'medium' | 'high'

export type PointerConfidenceResult = {
  rawScore: number | null
  normalizedConfidence: number
  confidenceLevel: PointerConfidenceLevel
  isConfident: boolean
}

const DEFAULT_POINTER_CONFIDENCE_OPTIONS: Required<PointerConfidenceOptions> = {
  minScore: 0.5,
  maxScore: 1,
  activeThreshold: 0.6,
  mediumThreshold: 0.8,
}

export function toPointerConfidence(
  score: number | undefined,
  options: PointerConfidenceOptions = {},
): PointerConfidenceResult {
  const resolvedOptions = {
    ...DEFAULT_POINTER_CONFIDENCE_OPTIONS,
    ...options,
  }

  const rawScore = typeof score === 'number' ? score : null
  const normalizedConfidence =
    rawScore === null
      ? 0
      : normalizeScore(rawScore, resolvedOptions.minScore, resolvedOptions.maxScore)

  return {
    rawScore,
    normalizedConfidence,
    confidenceLevel: getConfidenceLevel(
      normalizedConfidence,
      resolvedOptions.activeThreshold,
      resolvedOptions.mediumThreshold,
    ),
    isConfident: normalizedConfidence >= resolvedOptions.activeThreshold,
  }
}

function normalizeScore(score: number, minScore: number, maxScore: number): number {
  if (maxScore <= minScore) {
    return score >= maxScore ? 1 : 0
  }

  const normalizedValue = (score - minScore) / (maxScore - minScore)
  return Math.min(Math.max(normalizedValue, 0), 1)
}

function getConfidenceLevel(
  normalizedConfidence: number,
  activeThreshold: number,
  mediumThreshold: number,
): PointerConfidenceLevel {
  if (normalizedConfidence >= mediumThreshold) {
    return 'high'
  }

  if (normalizedConfidence >= activeThreshold) {
    return 'medium'
  }

  return 'low'
}
