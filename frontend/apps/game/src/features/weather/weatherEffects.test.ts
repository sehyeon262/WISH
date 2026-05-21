import { describe, expect, it } from 'vitest'
import { getMapWeatherRule } from './mapWeatherRules'
import { buildMapWeatherEffect } from './weatherEffects'
import {
  applyWeatherAccessibilityConfig,
  defaultWeatherAccessibilityConfig,
} from './weatherAccessibility'

describe('weather effects and map rules', () => {
  it('allows soft rain particles on outdoor maps', () => {
    const effect = buildMapWeatherEffect('RAIN', getMapWeatherRule('VillageScene'))

    expect(effect.particleType).toBe('rain')
    expect(effect.particleIntensity).toBeGreaterThan(0)
    expect(effect.particleIntensity).toBeLessThanOrEqual(0.45)
  })

  it('keeps gymnastics maps indoor and particle-free', () => {
    const effect = buildMapWeatherEffect('SNOW', getMapWeatherRule('GymnasticsSelectScene'))

    expect(effect.particleType).toBe('none')
    expect(effect.particleIntensity).toBe(0)
    expect(effect.overlayOpacity).toBeLessThanOrEqual(0.18)
  })

  it('disables weather entirely for disabled maps', () => {
    const effect = buildMapWeatherEffect('HEAVY_RAIN', getMapWeatherRule('MusicRhythmScene'))

    expect(effect.particleType).toBe('none')
    expect(effect.overlayOpacity).toBe(0)
    expect(effect.backgroundDarken).toBe(0)
  })

  it('honors accessibility defaults for sound and particle opacity', () => {
    const effect = buildMapWeatherEffect('HEAVY_RAIN', getMapWeatherRule('LighthouseSelectScene'))
    const accessible = applyWeatherAccessibilityConfig(effect, defaultWeatherAccessibilityConfig)

    expect(accessible.ambientSound).toBe('none')
    expect(accessible.particleIntensity).toBeLessThanOrEqual(0.45)
  })
})
