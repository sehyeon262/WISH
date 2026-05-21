import { describe, expect, it } from 'vitest'
import { toPointerConfidence } from './pointerConfidence'

describe('toPointerConfidence', () => {
  it('normalizes a score into the configured confidence range', () => {
    const result = toPointerConfidence(0.75)

    expect(result.rawScore).toBe(0.75)
    expect(result.normalizedConfidence).toBeCloseTo(0.5)
    expect(result.confidenceLevel).toBe('low')
    expect(result.isConfident).toBe(false)
  })

  it('returns medium confidence when the active threshold is met', () => {
    const result = toPointerConfidence(0.8)

    expect(result.normalizedConfidence).toBeCloseTo(0.6)
    expect(result.confidenceLevel).toBe('medium')
    expect(result.isConfident).toBe(true)
  })

  it('returns high confidence for strong scores', () => {
    const result = toPointerConfidence(0.95)

    expect(result.confidenceLevel).toBe('high')
    expect(result.isConfident).toBe(true)
  })

  it('treats missing scores as not confident', () => {
    const result = toPointerConfidence(undefined)

    expect(result.rawScore).toBeNull()
    expect(result.normalizedConfidence).toBe(0)
    expect(result.confidenceLevel).toBe('low')
    expect(result.isConfident).toBe(false)
  })
})
