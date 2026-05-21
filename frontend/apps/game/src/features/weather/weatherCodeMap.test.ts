import { describe, expect, it } from 'vitest'
import { mapOpenMeteoWeatherCodeToCondition } from './weatherCodeMap'

describe('mapOpenMeteoWeatherCodeToCondition', () => {
  it('maps clear, cloudy, rain, heavy rain, snow, fog, thunder, and wind conditions', () => {
    expect(mapOpenMeteoWeatherCodeToCondition({ weatherCode: 0 })).toBe('CLEAR')
    expect(mapOpenMeteoWeatherCodeToCondition({ weatherCode: 2 })).toBe('PARTLY_CLOUDY')
    expect(mapOpenMeteoWeatherCodeToCondition({ weatherCode: 3 })).toBe('CLOUDY')
    expect(mapOpenMeteoWeatherCodeToCondition({ weatherCode: 45 })).toBe('FOG')
    expect(mapOpenMeteoWeatherCodeToCondition({ weatherCode: 61 })).toBe('RAIN')
    expect(mapOpenMeteoWeatherCodeToCondition({ weatherCode: 82 })).toBe('HEAVY_RAIN')
    expect(mapOpenMeteoWeatherCodeToCondition({ weatherCode: 71 })).toBe('SNOW')
    expect(mapOpenMeteoWeatherCodeToCondition({ weatherCode: 95 })).toBe('THUNDER')
    expect(mapOpenMeteoWeatherCodeToCondition({ weatherCode: undefined, windSpeed: 36 })).toBe(
      'WIND',
    )
  })

  it('lets measured precipitation override vague weather codes', () => {
    expect(mapOpenMeteoWeatherCodeToCondition({ weatherCode: 0, rain: 0.4 })).toBe('RAIN')
    expect(mapOpenMeteoWeatherCodeToCondition({ weatherCode: 0, precipitation: 5 })).toBe(
      'HEAVY_RAIN',
    )
    expect(mapOpenMeteoWeatherCodeToCondition({ weatherCode: 0, snowfall: 0.1 })).toBe('SNOW')
  })
})
