import {
  fetchOpenMeteoCurrentWeather,
  getFallbackWeather,
  openMeteoWeatherProvider,
} from './openMeteoClient'
import type { WeatherProvider, WeatherState } from './types'

export const WEATHER_CACHE_KEY = 'game_weather_cache_v2'
export const WEATHER_TTL_MS = 10 * 60 * 1000

let weatherProvider: WeatherProvider = openMeteoWeatherProvider
let memoryWeatherCache: WeatherState | null = null
let pendingWeatherRequest: Promise<WeatherState> | null = null

export function setWeatherProvider(provider: WeatherProvider) {
  weatherProvider = provider
  pendingWeatherRequest = null
}

export function resetWeatherProvider() {
  weatherProvider = {
    getCurrentWeather: fetchOpenMeteoCurrentWeather,
  }
  pendingWeatherRequest = null
}

export async function getGameWeather(): Promise<WeatherState> {
  const now = Date.now()

  if (memoryWeatherCache && now - memoryWeatherCache.fetchedAt < WEATHER_TTL_MS) {
    return memoryWeatherCache
  }

  const stored = readStoredWeather()

  if (stored && now - stored.fetchedAt < WEATHER_TTL_MS) {
    memoryWeatherCache = stored
    return stored
  }

  if (pendingWeatherRequest) {
    return pendingWeatherRequest
  }

  const request: Promise<WeatherState> = weatherProvider
    .getCurrentWeather()
    .then(weather => {
      memoryWeatherCache = weather
      writeStoredWeather(weather)
      return weather
    })
    .catch(error => {
      console.warn('[Weather] Weather fetch failed. Using fallback.', error)

      if (memoryWeatherCache) {
        return {
          ...memoryWeatherCache,
          source: 'cache' as const,
          isStale: true,
        }
      }

      if (stored) {
        return {
          ...stored,
          source: 'cache' as const,
          isStale: true,
        }
      }

      return getFallbackWeather()
    })
    .finally(() => {
      pendingWeatherRequest = null
    })

  pendingWeatherRequest = request
  return request
}

export function clearWeatherCache() {
  memoryWeatherCache = null
  pendingWeatherRequest = null

  try {
    localStorage.removeItem(WEATHER_CACHE_KEY)
  } catch {
    // ignore storage failure
  }
}

function readStoredWeather(): WeatherState | null {
  try {
    const raw = localStorage.getItem(WEATHER_CACHE_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw) as WeatherState

    if (!parsed.condition || !parsed.fetchedAt) {
      return null
    }

    return parsed
  } catch {
    return null
  }
}

function writeStoredWeather(weather: WeatherState) {
  try {
    localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify(weather))
  } catch {
    // ignore storage failure
  }
}
