import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearWeatherCache,
  getGameWeather,
  resetWeatherProvider,
  setWeatherProvider,
} from './weatherStore'
import type { WeatherState } from './types'

const weatherAt = (
  fetchedAt: number,
  condition: WeatherState['condition'] = 'CLOUDY',
): WeatherState => ({
  condition,
  observedAt: '2026-05-07T10:00',
  fetchedAt,
  source: 'open-meteo',
})

describe('weatherStore', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-07T10:00:00+09:00'))
    localStorage.clear()
    clearWeatherCache()
  })

  afterEach(() => {
    resetWeatherProvider()
    clearWeatherCache()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('uses one provider request inside the TTL instead of refetching on map changes', async () => {
    const getCurrentWeather = vi.fn().mockResolvedValue(weatherAt(Date.now(), 'RAIN'))
    setWeatherProvider({ getCurrentWeather })

    const first = await getGameWeather()
    const second = await getGameWeather()

    expect(first.condition).toBe('RAIN')
    expect(second.condition).toBe('RAIN')
    expect(getCurrentWeather).toHaveBeenCalledTimes(1)
  })

  it('falls back to CLEAR when the provider fails and no cache exists', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    setWeatherProvider({
      getCurrentWeather: vi.fn().mockRejectedValue(new Error('network down')),
    })

    const weather = await getGameWeather()

    expect(weather.condition).toBe('CLEAR')
    expect(weather.source).toBe('fallback')
    expect(weather.isFallback).toBe(true)
  })

  it('returns stale cache when refresh fails after TTL expires', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const cached = weatherAt(Date.now(), 'SNOW')
    const getCurrentWeather = vi
      .fn()
      .mockResolvedValueOnce(cached)
      .mockRejectedValueOnce(new Error('offline'))
    setWeatherProvider({ getCurrentWeather })

    await getGameWeather()
    vi.advanceTimersByTime(11 * 60 * 1000)
    const stale = await getGameWeather()

    expect(stale.condition).toBe('SNOW')
    expect(stale.source).toBe('cache')
    expect(stale.isStale).toBe(true)
  })
})
