import type { MapWeatherRule, WeatherCondition, WeatherEffectConfig } from './types'

export const weatherEffectPresetMap: Record<WeatherCondition, WeatherEffectConfig> = {
  CLEAR: {
    condition: 'CLEAR',
    particleType: 'none',
    particleIntensity: 0,
    overlayOpacity: 0,
    backgroundDarken: 0,
    lightTint: '#fff6dc',
    ambientSound: 'none',
    windowEffect: 'none',
  },
  PARTLY_CLOUDY: {
    condition: 'PARTLY_CLOUDY',
    particleType: 'none',
    particleIntensity: 0,
    overlayOpacity: 0.06,
    backgroundDarken: 0.03,
    lightTint: '#f4eadb',
    ambientSound: 'none',
    windowEffect: 'soft_cloud_shadow',
  },
  CLOUDY: {
    condition: 'CLOUDY',
    particleType: 'none',
    particleIntensity: 0,
    overlayOpacity: 0.1,
    backgroundDarken: 0.07,
    lightTint: '#e8e1d4',
    ambientSound: 'none',
    windowEffect: 'soft_cloud_shadow',
  },
  RAIN: {
    condition: 'RAIN',
    particleType: 'rain',
    particleIntensity: 0.45,
    overlayOpacity: 0.24,
    backgroundDarken: 0.28,
    lightTint: '#9fb1c4',
    ambientSound: 'rain_soft',
    windowEffect: 'rain_window',
  },
  HEAVY_RAIN: {
    condition: 'HEAVY_RAIN',
    particleType: 'rain',
    particleIntensity: 0.45,
    overlayOpacity: 0.3,
    backgroundDarken: 0.34,
    lightTint: '#91a7bd',
    ambientSound: 'rain_soft',
    windowEffect: 'rain_window',
  },
  SNOW: {
    condition: 'SNOW',
    particleType: 'snow',
    particleIntensity: 0.58,
    overlayOpacity: 0.2,
    backgroundDarken: 0.22,
    lightTint: '#bac9d8',
    ambientSound: 'none',
    windowEffect: 'none',
  },
  FOG: {
    condition: 'FOG',
    particleType: 'fog',
    particleIntensity: 0.2,
    overlayOpacity: 0.14,
    backgroundDarken: 0.05,
    lightTint: '#e8e3d8',
    ambientSound: 'none',
    windowEffect: 'soft_cloud_shadow',
  },
  WIND: {
    condition: 'WIND',
    particleType: 'none',
    particleIntensity: 0,
    overlayOpacity: 0.06,
    backgroundDarken: 0.03,
    lightTint: '#f0eadf',
    ambientSound: 'wind_soft',
    windowEffect: 'soft_cloud_shadow',
  },
  THUNDER: {
    condition: 'THUNDER',
    particleType: 'rain',
    particleIntensity: 0.35,
    overlayOpacity: 0.3,
    backgroundDarken: 0.34,
    lightTint: '#91a0b8',
    ambientSound: 'rain_soft',
    windowEffect: 'rain_window',
  },
  UNKNOWN: {
    condition: 'UNKNOWN',
    particleType: 'none',
    particleIntensity: 0,
    overlayOpacity: 0,
    backgroundDarken: 0,
    lightTint: '#fff6dc',
    ambientSound: 'none',
    windowEffect: 'none',
  },
}

export function buildMapWeatherEffect(
  condition: WeatherCondition,
  rule: MapWeatherRule,
): WeatherEffectConfig {
  const base = weatherEffectPresetMap[condition] ?? weatherEffectPresetMap.UNKNOWN

  if (rule.mode === 'DISABLED') {
    return weatherEffectPresetMap.CLEAR
  }

  if (rule.mode === 'INDOOR_SUBTLE') {
    return {
      ...base,
      particleType: 'none',
      particleIntensity: 0,
      overlayOpacity: Math.min(base.overlayOpacity, rule.maxEffectIntensity),
      backgroundDarken: Math.min(base.backgroundDarken, rule.maxEffectIntensity),
      ambientSound: rule.allowAmbientSound ? base.ambientSound : 'none',
      windowEffect: base.windowEffect,
    }
  }

  return {
    ...base,
    particleIntensity: rule.allowParticles
      ? Math.min(base.particleIntensity, rule.maxEffectIntensity)
      : 0,
    overlayOpacity: Math.min(base.overlayOpacity, rule.maxEffectIntensity),
    backgroundDarken: Math.min(base.backgroundDarken, rule.maxEffectIntensity),
    ambientSound: rule.allowAmbientSound ? base.ambientSound : 'none',
  }
}
