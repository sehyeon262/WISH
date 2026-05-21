import type { WeatherEffectConfig } from './types'

const WEATHER_ACCESSIBILITY_STORAGE_KEY = 'wish_weather_accessibility_settings'

export const defaultWeatherAccessibilityConfig = {
  reduceWeatherMotion: false,
  disableWeatherParticles: false,
  disableWeatherSounds: true,
  disableThunderFlash: true,
  disableScreenShake: true,
  maxParticleOpacity: 0.65,
  indoorMaxEffectIntensity: 0.18,
}

export type WeatherAccessibilityConfig = typeof defaultWeatherAccessibilityConfig

export function getWeatherAccessibilityConfig(): WeatherAccessibilityConfig {
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  return {
    ...defaultWeatherAccessibilityConfig,
    ...readStoredAccessibilityConfig(),
    reduceWeatherMotion:
      prefersReducedMotion || readStoredAccessibilityConfig().reduceWeatherMotion === true,
  }
}

export function updateWeatherAccessibilityConfig(next: Partial<WeatherAccessibilityConfig>) {
  const merged = {
    ...getWeatherAccessibilityConfig(),
    ...next,
  }

  try {
    localStorage.setItem(WEATHER_ACCESSIBILITY_STORAGE_KEY, JSON.stringify(merged))
  } catch {
    // ignore storage failure
  }

  return merged
}

export function applyWeatherAccessibilityConfig(
  effect: WeatherEffectConfig,
  config: WeatherAccessibilityConfig,
): WeatherEffectConfig {
  return {
    ...effect,
    particleType: config.disableWeatherParticles ? 'none' : effect.particleType,
    particleIntensity: config.disableWeatherParticles
      ? 0
      : Math.min(effect.particleIntensity, config.maxParticleOpacity),
    ambientSound: config.disableWeatherSounds ? 'none' : effect.ambientSound,
  }
}

function readStoredAccessibilityConfig(): Partial<WeatherAccessibilityConfig> {
  try {
    const raw = localStorage.getItem(WEATHER_ACCESSIBILITY_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Partial<WeatherAccessibilityConfig>) : {}
  } catch {
    return {}
  }
}
