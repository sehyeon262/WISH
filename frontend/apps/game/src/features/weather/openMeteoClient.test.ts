import { describe, expect, it, vi } from 'vitest'
import {
  buildOpenMeteoCurrentWeatherUrl,
  DEFAULT_WEATHER_LOCATION,
  fetchOpenMeteoCurrentWeather,
} from './openMeteoClient'

describe('openMeteoClient', () => {
  it('builds an Open-Meteo URL with Seoul defaults and no API key parameter', () => {
    const url = buildOpenMeteoCurrentWeatherUrl()

    expect(url).toContain('https://api.open-meteo.com/v1/forecast?')
    expect(url).toContain(`latitude=${DEFAULT_WEATHER_LOCATION.latitude}`)
    expect(url).toContain(`longitude=${DEFAULT_WEATHER_LOCATION.longitude}`)
    expect(url).toContain('timezone=Asia%2FSeoul')
    expect(url).toContain('weather_code')
    expect(Array.from(new URL(url).searchParams.keys()).sort()).toEqual([
      'current',
      'latitude',
      'longitude',
      'timezone',
    ])
  })

  it('normalizes current weather responses into WeatherState', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        current: {
          time: '2026-05-07T10:00',
          temperature_2m: 19,
          relative_humidity_2m: 65,
          precipitation: 0.2,
          rain: 0.2,
          snowfall: 0,
          weather_code: 61,
          cloud_cover: 80,
          wind_speed_10m: 4,
          is_day: 1,
        },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const weather = await fetchOpenMeteoCurrentWeather()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(weather).toMatchObject({
      condition: 'RAIN',
      temperatureC: 19,
      humidity: 65,
      precipitation: 0.2,
      source: 'open-meteo',
      isDay: true,
    })
  })
})
